import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { feegowIntegerId } from './feegow-identifiers';

const base = 'https://api.feegow.com/v1/api';
function date(v: unknown) {
  const s = String(v ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function money(v: unknown) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[R$\s]/g,'');
  return Number(s.includes(',') ? s.replace(/\./g,'').replace(',','.') : s) || 0;
}
export async function fetchAppointments(start: string, end: string) {
  const rows: any[] = [];
  const seenPages = new Set<string>();
  for (let offset = 0; offset < 20000; offset += 50) {
    const url = new URL(`${base}/appoints/search`);
    for (const [k,v] of Object.entries({data_start:start.split('-').reverse().join('-'),data_end:end.split('-').reverse().join('-'),list_procedures:'1',start:String(offset),offset:'50'})) url.searchParams.set(k,v);
    const res = await fetch(url,{headers:{'x-access-token':process.env['FEEGOW_API_TOKEN'] ?? ''}});
    if (!res.ok) throw new Error(`appoints/search HTTP ${res.status}: ${(await res.text()).slice(0,2000)}`);
    const body = await res.json();
    if (body.success !== true) throw new Error(`appoints/search: ${JSON.stringify(body).slice(0,2000)}`);
    const content = body.content;
    const page = Array.isArray(content) ? content : content?.appointments ?? content?.data ?? [];
    if (!Array.isArray(page)) throw new Error('appoints/search formato inválido');
    if (!page.length) return rows;
    const signature = JSON.stringify(page.map((r:any)=>r.agendamento_id ?? r.id));
    if (seenPages.has(signature)) throw new Error('appoints/search repetiu uma página; carga incompleta');
    seenPages.add(signature);
    rows.push(...page);
    if(page.length<50) return rows;
  }
  throw new Error('appoints/search excedeu limite de paginação');
}
export async function syncAgendamentosRange(start: string,end: string) {
  const rows = await fetchAppointments(start,end);
  // Keep the same reference-price semantics as the legacy appointment sync:
  // estimates never enter valor_total.
  const refs = new Map<number,number>();
  const res = await fetch(`${base}/procedures/list`,{headers:{'x-access-token':process.env['FEEGOW_API_TOKEN'] ?? ''}});
  if (res.ok) {
    const body = await res.json();
    const list = Array.isArray(body.content) ? body.content : body.content?.procedures ?? [];
    for (const p of list) {
      const id = feegowIntegerId(p.procedimento_id ?? p.id);
      if (id !== null) refs.set(id, /^-?\d+$/.test(String(p.valor)) ? Number(p.valor)/100 : money(p.valor));
    }
  }
  const records = new Map<number,any>();
  for (const r of rows) {
    const id = feegowIntegerId(r.agendamento_id ?? r.id);
    const data = date(r.data ?? r.date);
    if (id === null || !data) throw new Error('Agendamento com identificador ou data inválidos; carga não concluída');
    const procs = r.procedimentos ?? r.procedures ?? r.itens ?? r.items ?? [];
    const details = (Array.isArray(procs)?procs:[]).map((p:any)=>{
      const pid = feegowIntegerId(p.procedimentoID ?? p.procedimento_id ?? p.id);
      const valor = money(p.valor ?? p.value);
      return {procedimento_id:pid,valor,valor_referencia:valor || (pid === null?0:refs.get(pid)??0),origem:valor?'feegow':'sem_valor'};
    });
    const sum = details.reduce((s:number,p:any)=>s+p.valor,0);
    const top = money(r.valor_total_agendamento ?? r.valor_total ?? r.total_value ?? r.valor);
    const valor = sum || top;
    const item:any = {agendamento_id:id,data,horario:r.horario ?? r.time ?? null,valor_total:valor,valor_estimado:Math.max(valor,details.reduce((s:number,p:any)=>s+p.valor_referencia,0)),valor_origem:sum?(details.some((p:any)=>!p.valor)?'parcial':'feegow'):top?'feegow_topo':'sem_valor',qtd_procedimentos:details.length,procedimentos_detalhe:details,duracao_min:Number(r.duracao ?? r.duration)>0?Number(r.duracao ?? r.duration):30};
    for (const key of ['paciente_id','profissional_id','especialidade_id','procedimento_id','status_id','unidade_id','local_id','canal_id','convenio_id','plano_id','tabela_id']) item[key]=feegowIntegerId(r[key]);
    for (const key of ['telemedicina','encaixe','retorno','primeiro_agendamento']) item[key]=Boolean(r[key]);
    records.set(id,item);
  }
  let gravados=0;
  for(let i=0,values=[...records.values()];i<values.length;i+=200) {
    const batch=values.slice(i,i+200);
    const {error}=await supabaseAdmin.from('agendamentos').upsert(batch,{onConflict:'agendamento_id'});
    if(error) throw new Error(error.message);
    gravados+=batch.length;
  }
  return {total:rows.length,gravados};
}