import { after, before, beforeEach, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { nomeConvenioProducao, origemProducao, prepararProducao, resumoOrigensProducao } from "./lab-producao";

const sql = readFileSync(new URL("../../drizzle/migrations/0016_guard_production_transactions_and_audit.sql", import.meta.url), "utf8");
const db = new PGlite();

describe("Production transition and audit — exact PostgreSQL migration", () => {
  before(async () => {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.lab_producao_feegow (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agendamento_id bigint NOT NULL,
        procedimento_id bigint NOT NULL, id_transacao text, n_guia_prestador text DEFAULT '',
        data_execucao date DEFAULT '2026-11-01', valor numeric, valor_pago numeric DEFAULT 0,
        convenio_nome text, convenio_id bigint, grupo_nome text, profissional_nome text,
        procedimento_nome text, unidade_id bigint, profissional_id bigint, forma_pagamento text,
        UNIQUE(id_transacao,n_guia_prestador,procedimento_id,agendamento_id)
      );
      CREATE FUNCTION public.dre_normalizar(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT lower(btrim(translate(coalesce(s,''),'ãáàâéêíóôõúç','aaaaeeiooouc')))
      $$;
    `);
    await db.exec(sql);
    await db.exec(readFileSync(new URL("../../drizzle/migrations/0017_optimize_production_duplicate_audit.sql", import.meta.url), "utf8"));
    await db.exec(readFileSync(new URL("../../drizzle/migrations/0018_accelerate_ai_production_filters.sql", import.meta.url), "utf8"));
  });
  beforeEach(async () => { await db.exec("TRUNCATE public.lab_producao_feegow"); });
  after(async () => { await db.close(); });

  async function insert(id: string | null, appointment = 1, procedure = 10, value = 100) {
    await db.query("INSERT INTO public.lab_producao_feegow(id_transacao,agendamento_id,procedimento_id,valor) VALUES ($1,$2,$3,$4)", [id, appointment, procedure, value]);
  }
  async function ids() {
    return (await db.query<{ id_transacao: string }>("SELECT id_transacao FROM public.lab_producao_feegow ORDER BY id_transacao")).rows.map(r => r.id_transacao);
  }
  for (const billing of ["PART1", "G1"]) {
    it(`${billing} removes stale ATE for the same appointment + procedure even when its value differs`, async () => {
      await insert("ATE1", 1, 10, 120);
      await insert(billing, 1, 10, 100);
      assert.deepEqual(await ids(), [billing]);
    });
  }
  it("skips ATE when a billed item already exists, regardless of value", async () => {
    await insert("G1"); await insert("ATE1", 1, 10, 120);
    assert.deepEqual(await ids(), ["G1"]);
  });
  for (const empty of ["", "   ", null]) {
    it(`does not write ${JSON.stringify(empty)} transactions`, async () => {
      await insert(empty); assert.deepEqual(await ids(), []);
    });
  }
  it("preserves ATE for a different appointment or procedure", async () => {
    await insert("ATE1"); await insert("ATE2", 2); await insert("ATE3", 1, 11); await insert("PART1");
    assert.deepEqual(await ids(), ["ATE2", "ATE3", "PART1"]);
  });
  it("keeps real separate billed transactions of the same value", async () => {
    await insert("PART1"); await insert("G1"); await insert("ATE1");
    assert.deepEqual(await ids(), ["G1", "PART1"]);
  });
  it("remains idempotent under the sync natural-key upsert", async () => {
    await insert("ATE1"); await insert("PART1");
    await db.exec("INSERT INTO public.lab_producao_feegow(id_transacao,agendamento_id,procedimento_id,valor) VALUES ('PART1',1,10,140) ON CONFLICT(id_transacao,n_guia_prestador,procedimento_id,agendamento_id) DO UPDATE SET valor=EXCLUDED.valor");
    assert.deepEqual(await ids(), ["PART1"]);
    assert.equal(Number((await db.query<{ valor: string }>("SELECT valor FROM public.lab_producao_feegow")).rows[0]?.valor), 140);
  });
  it("also guards updates that change a provisional transaction into billing", async () => {
    await insert("ATE1"); await insert("ATE2");
    await db.exec("UPDATE public.lab_producao_feegow SET id_transacao='PART1' WHERE id_transacao='ATE2'");
    assert.deepEqual(await ids(), ["PART1"]);
  });
  it("duplicate view follows group A without value match and group B with exact value match", async () => {
    await db.exec("ALTER TABLE public.lab_producao_feegow DISABLE TRIGGER lab_producao_guard_transacao");
    try {
      await insert("ATE1", 1, 10, 120); await insert("PART1", 1, 10, 100);
      await insert("", 2, 10, 50); await insert("G1", 2, 10, 50);
      await insert(null, 3, 10, 60); await insert("G2", 3, 10, 70);
      await insert("ATEunrelated", 4, 10, 80);
      const rows = (await db.query<{ motivo: string; valor: string }>("SELECT motivo,valor FROM public.vw_producao_duplicados ORDER BY motivo")).rows;
      assert.deepEqual(rows.map(r => [r.motivo, Number(r.valor)]), [["ATE substituído", 120], ["Transação vazia", 50]]);
    } finally { await db.exec("ALTER TABLE public.lab_producao_feegow ENABLE TRIGGER lab_producao_guard_transacao"); }
  });
  async function originsFixture() {
    await db.exec(`INSERT INTO public.lab_producao_feegow(id_transacao,agendamento_id,procedimento_id,valor,convenio_nome,convenio_id)
      VALUES ('ATE1',1,10,30,'Não Faturado',99),('PART1',2,10,100,'Particular',0),('G1',3,10,200,'Unimed',99)`);
  }
  it("ia_producao groups Não Faturado separately even with a positive convenio ID", async () => {
    await originsFixture();
    const rows = (await db.query<{ chave: string; faturado: string }>("SELECT * FROM public.ia_producao('2026-01-01','2026-11-30','origem') ORDER BY chave")).rows;
    assert.deepEqual(rows.map(r => [r.chave, Number(r.faturado)]), [["Convênio", 200], ["Não faturado", 30], ["Particular", 100]]);
  });
  it("ia_producao Convênio filter excludes Não Faturado", async () => {
    await originsFixture();
    const rows = (await db.query<{ faturado: string }>("SELECT * FROM public.ia_producao('2026-01-01','2026-11-30','total',NULL,'Convênio')")).rows;
    assert.equal(Number(rows[0]?.faturado), 200);
  });
  it("monthly Convênio aggregate excludes Não Faturado", async () => {
    await originsFixture();
    const rows = (await db.query<{ valor: string }>("SELECT * FROM public.lab_comparativo_mensal('2026-01-01','2026-11-30',NULL,NULL,'convenio')")).rows;
    assert.equal(rows.length, 1); assert.equal(Number(rows[0]?.valor), 200);
  });
  it("does not grant duplicate view or AI reads to anon", async () => {
    const rows = (await db.query<{ view_allowed: boolean; ai_allowed: boolean }>("SELECT has_table_privilege('anon','public.vw_producao_duplicados','SELECT') AS view_allowed,has_function_privilege('anon','public.ia_producao(date,date,text,text,text,text)','EXECUTE') AS ai_allowed")).rows;
    assert.deepEqual(rows[0], { view_allowed: false, ai_allowed: false });
  });
});

describe("Shared production presentation and batching", () => {
  it("classifies the Não Faturado sentinel as its own origin", () => {
    assert.equal(origemProducao({ convenio_nome: "Não Faturado", convenio_id: 99 }), "Não faturado");
    assert.equal(nomeConvenioProducao({ convenio_nome: " NÃO FATURADO " }), "Não faturado");
  });
  it("does not inflate Convênio with a Não Faturado item", () => {
    assert.deepEqual(resumoOrigensProducao([
      { convenio_nome: "Não Faturado", valor: 30 }, { convenio_nome: "Particular", valor: 100 }, { convenio_nome: "Unimed", valor: 200 },
    ]), [{ name: "Particular", value: 100 }, { name: "Convênio", value: 200 }, { name: "Não faturado", value: 30 }]);
  });
  it("rejects blank transactions before contacting the database", () => {
    assert.deepEqual(prepararProducao([{ id_transacao: "", agendamento_id: 1, procedimento_id: 10 }]), []);
  });
  it("drops stale same-pair ATE in either batch order", () => {
    const ate = { id_transacao: "ATE1", agendamento_id: 1, procedimento_id: 10 };
    const billed = { ...ate, id_transacao: "PART1" };
    assert.deepEqual(prepararProducao([ate, billed]), [billed]);
    assert.deepEqual(prepararProducao([billed, ate]), [billed]);
  });
  it("deduplicates repeated natural keys without dropping unrelated procedures", () => {
    const billed = { id_transacao: "PART1", agendamento_id: 1, procedimento_id: 10 };
    const other = { id_transacao: "ATE1", agendamento_id: 1, procedimento_id: 11 };
    assert.deepEqual(prepararProducao([billed, billed, other]), [billed, other]);
  });
});