import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { PAUSE_HOURS, RETRY_DELAY_MS, SYNC_STAGES, appointmentWindow, pauseExpired, isolatedStage } from './sync-policy';
describe('Incremental recovery rules',()=>{
  it('appointments cover the last three days plus seven future days',()=>{
    assert.deepEqual(appointmentWindow('2026-11-24'),{inicio:'2026-11-22',fim:'2026-12-01'});
  });
  it('automatic pauses last only two hours and then retry',()=>{
    assert.equal(PAUSE_HOURS,2);
    const start=Date.parse('2026-11-24T20:00:00Z');
    const until=new Date(start+PAUSE_HOURS*3600000).toISOString();
    assert.equal(pauseExpired(until,start+7199999),false);
    assert.equal(pauseExpired(until,start+7200000),true);
  });
  it('old pauses without a deadline no longer block all cycles',()=>assert.equal(pauseExpired(null),true));
  it('production retries wait two seconds',()=>assert.equal(RETRY_DELAY_MS,2000));
  it('all six stages continue after a production failure',async()=>{
    const visited:string[]=[];
    const results=[];
    for(const stage of SYNC_STAGES) results.push(await isolatedStage(async()=>{
      visited.push(stage); if(stage==='producao') throw new Error('HTTP 403'); return stage;
    }));
    assert.deepEqual(visited,['producao','safety','repasse','receita','itens','agendamentos']);
    assert.equal(results[0]?.ok,false);
    assert.equal(results[5]?.ok,true);
  });
});