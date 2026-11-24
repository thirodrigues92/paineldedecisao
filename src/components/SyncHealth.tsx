import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { brl, num } from '@/lib/format';
import { AlertTriangle } from 'lucide-react';

export const syncHealthOptions = {
  queryKey: ['sync-stage-health'],
  queryFn: async () => {
    const {data,error}=await supabase.from('lab_vw_sync_etapas').select('*');
    if(error) throw error;
    return data ?? [];
  },
  refetchInterval: 30_000,
};
export function SyncHealthBanner() {
  const q=useQuery(syncHealthOptions);
  if(q.error) return <div role="alert" className="bg-destructive text-destructive-foreground px-4 py-2 text-sm">Não foi possível conferir a sincronização — dados podem estar incompletos.</div>;
  const stopped=(q.data ?? []).filter(s=>s.atrasada);
  if(!stopped.length) return null;
  return <div role="alert" className="bg-destructive text-destructive-foreground px-4 py-2 space-y-1 text-sm">
    {stopped.map(s=><div key={s.etapa} className="flex items-start gap-2"><AlertTriangle className="size-4 mt-0.5 shrink-0"/><span>Sincronização de {s.nome} parada {s.ultimo_sucesso ? `desde ${new Date(s.ultimo_sucesso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}` : '— sem sucesso registrado'} — dados podem estar incompletos</span></div>)}
  </div>;
}
export function SyncStageStatus() {
  const q=useQuery(syncHealthOptions);
  return <div className="space-y-2">{q.error && <p className="text-destructive">Falha ao consultar últimas sincronizações.</p>}{(q.data??[]).map(s=><div key={s.etapa} className="flex flex-wrap justify-between gap-1 border-b border-border py-2 text-xs"><span className="font-medium">{s.nome}</span><span className={s.atrasada?'text-destructive':'text-muted-foreground'}>{s.ultimo_sucesso?new Date(s.ultimo_sucesso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Sem sucesso registrado'} · {num(s.registros_ultimo_sucesso??0)} registros</span></div>)}</div>;
}
export function SyncDailyAudit() {
  const q=useQuery({queryKey:['sync-daily-audit'],queryFn:async()=>{
    const {data,error}=await supabase.from('vw_saude_sync').select('*').order('dia',{ascending:false});
    if(error) throw error;
    return data??[];
  },refetchInterval:30_000});
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Conferência diária · últimos 60 dias</h2>{q.error && <p className="text-destructive">Falha ao consultar a conferência diária.</p>}<div className="overflow-x-auto"><table className="w-full text-sm whitespace-nowrap"><thead><tr className="text-left border-b border-border">{['Data','Agendamentos','Atendidos','Produção (qtd)','Produção (valor)','Receita (itens)','Repasses (qtd)','Repasse (valor)','Alerta'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{(q.data??[]).map(r=><tr key={r.dia} className={`border-b border-border ${r.alerta?'bg-destructive/10 text-destructive':''}`}><td className="p-2">{r.dia?.split('-').reverse().join('/')}</td><td className="p-2">{num(r.agendamentos??0)}</td><td className="p-2">{num(r.atendidos??0)}</td><td className="p-2">{num(r.producao_qtd??0)}</td><td className="p-2">{brl(r.producao_valor??0)}</td><td className="p-2">{num(r.receita_itens??0)}</td><td className="p-2">{num(r.repasses??0)}</td><td className="p-2">{brl(r.repasse_valor??0)}</td><td className="p-2">{r.alerta?'Produção abaixo do esperado':'—'}</td></tr>)}</tbody></table></div></section>;
}