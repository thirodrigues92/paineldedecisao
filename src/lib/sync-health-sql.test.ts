import { it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
it('daily SQL flags attended weekday without production and production below 50% of weekday average',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE lab_sync_lock(id text); CREATE TABLE lab_backfill_jobs(id text);
      CREATE TABLE lab_sync_log(endpoint text,executado_em timestamptz,api_success boolean,registros int);
      CREATE TABLE sync_logs(endpoint text,iniciado_em timestamptz,sucesso boolean,registros int);
      CREATE TABLE agendamentos(data date,status_id int);
      CREATE TABLE status_agendamento(status_id int,categoria text);
      CREATE TABLE lab_producao_feegow(data_execucao date,valor numeric);
      CREATE TABLE lab_repasse_feegow(data_repasse date,valor_repassado numeric);
      CREATE TABLE fin_itens(data_pagamento date,tipo_transacao text);
    `);
    await db.exec(readFileSync(new URL('../../drizzle/migrations/0027_sync_stage_health_and_recovery.sql',import.meta.url),'utf8'));
    await db.exec(`INSERT INTO agendamentos VALUES (date_trunc('week',CURRENT_DATE)::date,3);
      INSERT INTO lab_producao_feegow SELECT d::date,100 FROM generate_series(CURRENT_DATE-59,date_trunc('week',CURRENT_DATE)::date-1,interval '1 day') d CROSS JOIN generate_series(1,10) WHERE extract(isodow FROM d)=1;`);
    const empty=(await db.query<{alerta:boolean}>("SELECT alerta FROM vw_saude_sync WHERE dia=date_trunc('week',CURRENT_DATE)::date")).rows[0];
    assert.equal(empty?.alerta,true);
    await db.exec("INSERT INTO lab_producao_feegow SELECT date_trunc('week',CURRENT_DATE)::date,100 FROM generate_series(1,4)");
    assert.equal((await db.query<{alerta:boolean}>("SELECT alerta FROM vw_saude_sync WHERE dia=date_trunc('week',CURRENT_DATE)::date")).rows[0]?.alerta,true);
    await db.exec("INSERT INTO lab_producao_feegow VALUES(date_trunc('week',CURRENT_DATE)::date,100)");
    assert.equal((await db.query<{alerta:boolean}>("SELECT alerta FROM vw_saude_sync WHERE dia=date_trunc('week',CURRENT_DATE)::date")).rows[0]?.alerta,false);
    assert.equal((await db.query<{qtd:number}>("SELECT count(*)::int qtd FROM vw_saude_sync")).rows[0]?.qtd,60);
  } finally {await db.close();}
});