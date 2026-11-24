import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePersonPairs, associationPerson, type PersonRow } from "../../supabase/functions/sync-feegow/conta-pessoa";
import { personLabel, personSearch } from "./dre-person-display";

function harness() {
  const saved: PersonRow[] = [], waits: number[] = [], calls: number[] = [];
  return { saved, waits, calls, dependencies: {
    association: async (pair: { conta_id: number }) => { calls.push(pair.conta_id); return { name: " Nome ", document: "123.456", type: { description: "Fornecedor" } }; },
    save: async (r: PersonRow) => { saved.push(r); }, wait: async (ms: number) => { waits.push(ms); }, now: () => 0,
  } };
}
describe("DRE account people", () => {
  it("limits each execution to 300 pairs and waits 150ms between API calls", async () => {
    const h = harness();
    const r = await resolvePersonPairs(Array.from({ length: 301 }, (_, i) => ({ tipo_conta: 2, conta_id: i + 1, paciente_nome: null })), h.dependencies);
    assert.equal(r.processados, 300); assert.equal(h.calls.length, 300);
    assert.equal(h.waits.length, 299); assert.ok(h.waits.every(ms => ms === 150));
  });
  it("uses patient_id account match before consulting the API for type 3", async () => {
    const h = harness();
    await resolvePersonPairs([{ tipo_conta: 3, conta_id: 713, paciente_nome: "Paciente local" }, { tipo_conta: 3, conta_id: 714, paciente_nome: null }], h.dependencies);
    assert.deepEqual(h.calls, [714]); assert.equal(h.saved[0]?.nome, "Paciente local");
    assert.equal(h.saved[0]?.tipo_descricao, "Paciente");
  });
  it("persists null on API failure and continues with subsequent pairs", async () => {
    const h = harness();
    const r = await resolvePersonPairs([{ tipo_conta: 2, conta_id: 713, paciente_nome: null }, { tipo_conta: 5, conta_id: 714, paciente_nome: null }], { ...h.dependencies, association: async p => { if (p.conta_id === 713) throw new Error("API error"); return { name: "Profissional" }; } });
    assert.equal(r.falhas, 1); assert.equal(h.saved.length, 2); assert.equal(h.saved[0]?.nome, null); assert.equal(h.saved[1]?.nome, "Profissional");
  });
  it("does not round invalid identifiers", async () => {
    const h = harness(); await resolvePersonPairs([{ tipo_conta: 2, conta_id: 713.5, paciente_nome: null }], h.dependencies);
    assert.equal(h.saved.length, 0); assert.equal(h.calls.length, 0);
  });
  it("maps name, document and type.description without guessing", () => {
    assert.deepEqual(associationPerson({ name: " Nome ", document: " 123 ", type: { description: " Funcionário " } }), { nome: "Nome", documento: "123", tipo_descricao: "Funcionário" });
  });
  it("uses account type and ID when the source has no name", () => {
    assert.equal(personLabel({ pessoa_nome: null, pessoa_tipo: "Fornecedor", pessoa_conta_id: 713, pessoa_documento: null, pessoa_tipo_conta: 2 }), "Fornecedor #713");
  });
  it("includes the document and type in the searchable data", () => {
    const value = personSearch({ pessoa_nome: "Nome", pessoa_tipo: "Fornecedor", pessoa_conta_id: 713, pessoa_documento: "123.456.789-00", pessoa_tipo_conta: 2 });
    assert.ok(value.includes("Fornecedor")); assert.ok(value.includes("123.456.789-00")); assert.ok(value.includes("12345678900"));
  });
});