import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Exercise the exact migration query with inline SQL fixtures: no real rows are changed.
const migration = readFileSync(new URL('../../drizzle/migrations/0010_optimize_item_dre_aggregation.sql', import.meta.url), 'utf8');
const body = migration.split('-- DRE_ITEMS_QUERY_BEGIN')[1]?.split('-- DRE_ITEMS_QUERY_END')[0];
if (!body) throw new Error('DRE query not found');
const fixtures = `
fixture_items AS (
 SELECT item_id::bigint, tipo_transacao, categoria_id::bigint, procedimento_id::bigint, agendamento_id::bigint,
 valor::numeric, quantidade::numeric, desconto::numeric, acrescimo::numeric, is_cancelado,
 data_competencia::date, data_pagamento::date FROM (VALUES
 (1,'C',1,10,1,100,2,10,5,false,'2026-01-10','2026-02-10'),
 (2,'C',1,10,2,50,1,0,0,false,'2026-01-10','2026-02-10'),
 (3,'C',1,10,3,40,1,0,0,false,'2026-01-10','2026-02-10'),
 (4,'C',1,10,4,30,1,0,0,false,'2026-01-10','2026-02-10'),
 (5,'C',1,10,999,20,1,0,0,false,'2026-01-10','2026-02-10'),
 (6,'C',1,0,null,60,1,0,0,false,'2026-01-10','2026-02-10'),
 (7,'C',1,0,null,70,1,0,0,false,'2026-01-10',null),
 (8,'C',1,0,null,1000,1,0,0,true,'2026-01-10','2026-02-10'),
 (9,'D',2,0,null,10,1,0,0,false,'2026-01-10','2026-02-10'),
 (10,'D',3,0,null,20,1,0,0,false,'2026-01-10','2026-02-10'),
 (11,'D',4,0,null,30,1,0,0,false,'2026-01-10','2026-02-10'),
 (12,'D',5,0,null,40,1,0,0,false,'2026-01-10','2026-02-10'),
 (13,'D',0,0,null,5,1,0,0,false,'2026-01-10','2026-02-10'),
 (14,'D',null,0,null,6,1,0,0,false,'2026-01-10','2026-02-10'),
 (15,'D',999,0,null,7,1,0,0,false,'2026-01-10','2026-02-10'),
 (16,'D',1,0,null,8,1,0,0,false,'2026-01-10','2026-02-10'),
 (17,'C',1,0,null,2000,1,0,0,false,'2025-01-10','2025-02-10')
 ) v(item_id,tipo_transacao,categoria_id,procedimento_id,agendamento_id,valor,quantidade,desconto,acrescimo,is_cancelado,data_competencia,data_pagamento)
), fixture_categories(categoria_id,categoria_nome,tipo,grupo_dre_posicao,ordem_dre,grupo_dre_nome) AS (VALUES
 (1::bigint,'Integralização','income','1.2',2::numeric,'OUTRAS RECEITAS'),
 (2,'Distribuição','expense','10.2',2,'SÓCIOS'),
 (3,'Equipamento','expense','10.7',7,'AQUISIÇAO DE PATRIMONIO'),
 (4,'Ampliação','expense','10.8',8,'MANUTENÇAO PREDIAL /LIMPEZA'),
 (5,'Dr. Exemplo','expense','10.10',10,'REPASSES')
), fixture_procedures(procedimento_id,grupo_nome) AS (VALUES (10::bigint,'CONSULTAS')),
fixture_procedure_fallback(procedimento_id,grupo) AS (VALUES (10::bigint,'CONSULTAS')),
fixture_appointments(agendamento_id,convenio_id) AS (VALUES (1::bigint,NULL::int),(2,33)),
fixture_enriched(agendamento_id,convenio_id,sem_dados_agendamento) AS (VALUES (3::bigint,15,false)),
fixture_dimensions(agendamento_id,convenio_id) AS (VALUES (4::bigint,21))
`;
type Row = { linha_ref: string; nivel_ref: number; mes_ref: number; valor_ref: string | number; ordem_ref: number };
function query(regime: string): Row[] {
  let sql = body?.replace('WITH parametros', `WITH ${fixtures}, parametros`)
    .replace('ano AS ano_ref, regime AS regime_ref', `2026 AS ano_ref, '${regime}' AS regime_ref`);
  if (!sql) throw new Error('Missing query');
  for (const [table, fixture] of Object.entries({ fin_itens: 'fixture_items', vw_plano_contas_dre: 'fixture_categories', lab_dim_procedimento: 'fixture_procedures', procedimentos: 'fixture_procedure_fallback', agendamentos: 'fixture_appointments', lab_agendamento_enriquecido: 'fixture_enriched', lab_dim_agendamento: 'fixture_dimensions' })) {
    sql = sql.replaceAll(`public.${table} `, `${fixture} `);
  }
  return JSON.parse(execFileSync('lovable', ['supabase', 'query', sql, '--json'], { encoding: 'utf8', maxBuffer: 4e6 })).rows;
}
const payment = query('pagamento');
const competency = query('competencia');
function value(rows: Row[], line: string, month = 2, level = 0) {
  const row = rows.find(r => r.linha_ref === line && r.mes_ref === month && r.nivel_ref === level);
  assert.ok(row, `Missing ${line}`);
  return Number(row.valor_ref);
}
describe('Item-based SQL DRE', () => {
  it('applies value × quantity − discount + surcharge', () => assert.equal(value(payment,'RECEITA PARTICULAR',2,1),195));
  it('groups insured revenue with appointment and lab fallback links', () => assert.equal(value(payment,'RECEITA CONVÊNIO',2,1),120));
  it('keeps missing appointment links explicit instead of assuming private', () => assert.equal(value(payment,'RECEITA SEM VÍNCULO DE AGENDAMENTO',2,1),20));
  it('details procedures under the revenue group', () => assert.equal(value(payment,'CONSULTAS',2,2),195));
  it('displays D in income groups negative, without omitting C without procedure', () => assert.equal(value(payment,'OUTRAS RECEITAS',2,1),52));
  it('retains zero, null and orphan category expenses', () => assert.equal(value(payment,'SEM CATEGORIA',2,1),18));
  it('includes REPASSES in all expense totals without counting hierarchy twice', () => { assert.equal(value(payment,'REPASSES',2,1),40); assert.equal(value(payment,'TOTAL DE DESPESAS'),126); });
  it('excludes unpaid and cancelled items in payment regime', () => assert.equal(value(payment,'TOTAL DE RECEITAS'),395));
  it('uses payment month rather than competency month', () => assert.equal(value(payment,'TOTAL DE RECEITAS',1),0));
  it('includes unpaid items in competency and still excludes cancelled', () => assert.equal(value(competency,'TOTAL DE RECEITAS',1),465));
  it('subtracts every expense, including expenses assigned to income categories', () => assert.equal(value(payment,'RESULTADO'),269));
  it('adds only Socios, Patrimonio and Ampliacao exactly once', () => assert.equal(value(payment,'RESULTADO OPERACIONAL'),329));
  it('orders expense groups numerically, with REPASSES after investment groups', () => {
    const order = (line: string) => payment.find(r => r.linha_ref===line && r.nivel_ref===1)?.ordem_ref;
    assert.ok(Number(order('SÓCIOS')) < Number(order('REPASSES')));
  });
  it('returns all twelve months and limits the year', () => { assert.equal(payment.filter(r => r.linha_ref==='RESULTADO').length,12); assert.equal(value(payment,'TOTAL DE RECEITAS',12),0); });
});