import {supabaseAdmin as db} from '@/integrations/supabase/client.server';
import {locationKey,validCityCoordinate} from './patient-map-rules';
type Point={latitude:number;longitude:number};
type Patient={paciente_id:number;cep:string|null;bairro:string|null;cidade:string|null;estado:string|null;latitude:number|null;longitude:number|null};
const state=(s:string|null)=>locationKey(s)==='goias'?'GO':(s??'').trim().toUpperCase();
const city=(s:string|null)=>['santa helena','santa helena de goias'].includes(locationKey(s))?'Santa Helena de Goiás':s??'';
async function search(query:string):Promise<Point|null> {
  await new Promise(r=>setTimeout(r,1100));
  const response=await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`,{headers:{'User-Agent':'OptimaSaudePatientMap/1.0'},signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`Geocodificação HTTP ${response.status}`);
  const rows=await response.json();const r=rows[0];
  return r?{latitude:Number(r.lat),longitude:Number(r.lon)}:null;
}
async function all<T>(table:'geo_bairros'|'lab_geo_cidades'|'ceps_geocodificados') {
  const rows:T[]=[];
  for(let n=0;;n+=1000) {const {data,error}=await db.from(table).select('*').range(n,n+999);if(error)throw error;rows.push(...data as T[]);if(!data.length || data.length<1000)break;}
  return rows;
}
export async function processPatientGeocodes(limit=150,externalBudget=20) {
  const [cities,neighborhoods,ceps]=await Promise.all([all<any>('lab_geo_cidades'),all<any>('geo_bairros'),all<any>('ceps_geocodificados')]);
  const cityMap=new Map<string,Point|null>(cities.map(r=>[r.chave,r.latitude==null?null:{latitude:Number(r.latitude),longitude:Number(r.longitude)}]));
  const key=(b:string|null,c:string|null,s:string|null)=>`${locationKey(b)}|${locationKey(city(c))}|${state(s)}`;
  const neighborhoodMap=new Map<string,Point>(neighborhoods.filter(r=>r.latitude!=null && r.longitude!=null).map(r=>[key(r.bairro,r.cidade,r.estado),{latitude:Number(r.latitude),longitude:Number(r.longitude)}]));
  const cepMap=new Map(ceps.map(r=>[r.cep,r]));
  const {data:queue,error}=await db.from('lab_paciente_geo_fila').select('*').eq('status','pendente').order('atualizado_em').limit(limit);
  if(error)throw error;
  const {data:patientRows,error:patientsError}=await db.from('pacientes').select('paciente_id,cep,bairro,cidade,estado,latitude,longitude').in('paciente_id',(queue??[]).map(r=>r.paciente_id));
  if(patientsError)throw patientsError;
  const patients=new Map((patientRows??[]).map(p=>[p.paciente_id,p]));
  let gravados=0,semEndereco=0,calls=0;const errors:string[]=[];
  for(const job of queue??[]) {
    const p=patients.get(job.paciente_id);if(!p)continue;
    try {
      if(!p.cidade || !p.estado) {semEndereco++;await finish(p.paciente_id,'sem_endereco','Cidade ou estado ausentes');continue;}
      const c=city(p.cidade),uf=state(p.estado),ck=`${locationKey(c)}|${uf}`;
      let center=cityMap.get(ck);
      if(center===undefined) {
        if(calls>=externalBudget) {await finish(p.paciente_id,'pendente',null);continue;}calls++;
        center=await search(`${c}, ${uf}, Brasil`);cityMap.set(ck,center);
        const {error:save}=await db.from('lab_geo_cidades').upsert({chave:ck,cidade:c,estado:uf,latitude:center?.latitude??null,longitude:center?.longitude??null});if(save)throw save;
      }
      if(!center) {await clear(p);await finish(p.paciente_id,'erro','Centro da cidade não localizado');continue;}
      let candidate:Point|null=null;
      const cached=p.cep?cepMap.get(p.cep):null;
      if(cached && locationKey(city(cached.cidade))===locationKey(c) && state(cached.estado)===uf)candidate={latitude:Number(cached.latitude),longitude:Number(cached.longitude)};
      // Keep an existing valid coordinate, including the address already resolved from CEP.
      if(!candidate && p.latitude!=null && p.longitude!=null)candidate={latitude:Number(p.latitude),longitude:Number(p.longitude)};
      if(!validCityCoordinate(candidate,center) && p.cep?.length===8 && calls<externalBudget) {
        calls++;
        const via=await fetch(`https://viacep.com.br/ws/${p.cep}/json/`,{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
        if(!via.erro && locationKey(city(via.localidade))===locationKey(c) && state(via.uf)===uf) {
          candidate=await search(`${via.logradouro??''}, ${via.bairro??''}, ${c}, ${uf}, Brasil`);
          if(validCityCoordinate(candidate,center) && candidate) {
            await db.from('ceps_geocodificados').upsert({cep:p.cep,...candidate,bairro:via.bairro||null,cidade:c,estado:uf});cepMap.set(p.cep,{...candidate,cidade:c,estado:uf});
          }
        }
      }
      if(!validCityCoordinate(candidate,center)) {
        const nk=key(p.bairro,p.cidade,p.estado);candidate=neighborhoodMap.get(nk)??null;
        if(!validCityCoordinate(candidate,center) && p.bairro && calls<externalBudget) {
          calls++;candidate=await search(`${p.bairro}, ${c}, ${uf}, Brasil`);
          if(candidate && validCityCoordinate(candidate,center)) {
            neighborhoodMap.set(nk,candidate);
            await db.from('geo_bairros').upsert({bairro:p.bairro,cidade:c,estado:uf,...candidate},{onConflict:'bairro,cidade,estado'});
          }
        }
      }
      if(candidate && validCityCoordinate(candidate,center)) {
        const {error:write}=await db.from('pacientes').update(candidate).eq('paciente_id',p.paciente_id);if(write)throw write;
        gravados++;await finish(p.paciente_id,'concluido',null);
      } else {
        await clear(p);
        // Leave unqueried neighborhoods pending for the next bounded execution.
        if(calls>=externalBudget) {await finish(p.paciente_id,'pendente',null);continue;}
        await finish(p.paciente_id,'sem_endereco','CEP e centro do bairro não localizados');semEndereco++;
      }
    } catch(e) {
      const message=e instanceof Error?e.message:'Falha de geocodificação';errors.push(`${p.paciente_id}: ${message}`);
      await finish(p.paciente_id,'erro',message);
    }
  }
  await db.from('lab_sync_log').insert({endpoint:'sync:geocode-pacientes',api_success:errors.length===0,registros:gravados,parametros:{limite:limit,consultas:calls,sem_endereco:semEndereco},erro:errors.slice(0,10).join(' | ')||null});
  return {gravados,semEndereco,erros:errors};
}
async function finish(id:number,status:string,erro:string|null) {const {error}=await db.from('lab_paciente_geo_fila').update({status,erro,atualizado_em:new Date().toISOString()}).eq('paciente_id',id);if(error)throw error;}
async function clear(p:Patient) {if(p.latitude!=null || p.longitude!=null) {const {error}=await db.from('pacientes').update({latitude:null,longitude:null}).eq('paciente_id',p.paciente_id);if(error)throw error;}}