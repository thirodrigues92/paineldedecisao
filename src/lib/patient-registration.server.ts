import {supabaseAdmin as db} from '@/integrations/supabase/client.server';
import {feegowIntegerId} from './feegow-identifiers';
import {PATIENT_BATCH_LIMIT,PATIENT_CALL_DELAY_MS} from './patient-map-rules';
const text=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ')||null;
function birth(v:unknown) {
  const s=String(v??'');
  if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m=s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:null;
}
export async function syncPatientRegistrations(limit=300) {
  const {data:pending,error}=await db.from('lab_vw_pacientes_pendentes').select('*').order('sem_cadastro',{ascending:false}).order('paciente_id').limit(Math.min(PATIENT_BATCH_LIMIT,Math.max(1,limit)));
  if(error) throw error;
  let gravados=0; const errors:string[]=[];
  // Four in flight; every new request starts at least 150 ms after the previous one.
  const inFlight=new Set<Promise<void>>();
  for(const row of pending??[]) {
    if(inFlight.size>=4) await Promise.race(inFlight);
    const pid=feegowIntegerId(row.paciente_id); if(pid===null) continue;
    const task=(async()=>{
      try {
        const response=await fetch(`https://api.feegow.com/v1/api/patient/search?paciente_id=${pid}`,{headers:{'x-access-token':process.env['FEEGOW_API_TOKEN']??''},signal:AbortSignal.timeout(20000)});
        if(!response.ok) throw new Error(`patient/search HTTP ${response.status}`);
        const body=await response.json(); if(body.success!==true) throw new Error('Cadastro não retornado pelo Feegow');
        const content=body.content; const p=Array.isArray(content)?content[0]:content;
        if(!p || !text(p.nome??p.name)) throw new Error('Cadastro sem nome ou conteúdo');
        const nascimento=birth(p.nascimento??p.birthDate), cep=String(p.cep??'').replace(/\D/g,'');
        const now=new Date().toISOString();
        const prontuario=text(p.prontuario??p.Prontuario);
        const {error:write}=await db.from('pacientes').upsert({paciente_id:pid,nome:text(p.nome??p.name??p.nome_completo),sexo:locationSex(p.sexo),nascimento,ano_nascimento:nascimento?Number(nascimento.slice(0,4)):null,cep:cep.length===8?cep:null,bairro:text(p.bairro),cidade:text(p.cidade),estado:text(p.estado)?.toUpperCase()??null,convenio_id:feegowIntegerId(p.convenio_id),...(prontuario?{prontuario}:{}),cadastro_raw:{id:p.id,sexo:p.sexo,nascimento:p.nascimento,cep:p.cep,bairro:p.bairro,cidade:p.cidade,estado:p.estado,convenio_id:p.convenio_id},cadastro_sincronizado_em:now,updated_at:now},{onConflict:'paciente_id'});
        if(write) throw write;
        await db.from('lab_paciente_sync_estado').upsert({paciente_id:pid,tentado_em:now,erro:null});gravados++;
      } catch(e) {
        const message=e instanceof Error?e.message:'Falha no cadastro'; errors.push(`${pid}: ${message}`);
        await db.from('lab_paciente_sync_estado').upsert({paciente_id:pid,tentado_em:new Date().toISOString(),erro:message});
      }
    })();
    inFlight.add(task);void task.finally(()=>inFlight.delete(task));
    await new Promise(resolve=>setTimeout(resolve,PATIENT_CALL_DELAY_MS));
  }
  await Promise.all(inFlight);
  const {count}=await db.from('lab_vw_pacientes_pendentes').select('*',{count:'exact',head:true});
  const {error:log}=await db.from('lab_sync_log').insert({endpoint:'sync:pacientes',api_success:errors.length===0,registros:gravados,parametros:{limite:Math.min(limit,300),restantes:count??0},erro:errors.length?errors.slice(0,20).join(' | '):null});
  if(log) throw log;
  return {gravados,tentados:pending?.length??0,restantes:count??0,erros:errors};
}
function locationSex(v:unknown) {const s=String(v??'').toLowerCase();return s.startsWith('m')?'M':s.startsWith('f')?'F':null;}