import { supabase } from "@/integrations/supabase/client";
import type {DashboardFilters} from './filters-context';
import {locationKey,locationName,realMapRows,type MapProduction} from './patient-map-rules';

export type PacienteGeo = {
  paciente_id: number;
  nome?: string | null;
  prontuario?: string | null;
  cep?: string | null;
  sexo: string | null;
  ano_nascimento: number | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  convenio_id: number | null;
  metricas: Record<string, unknown> | null;
};

export type UnidadeGeo = {
  unidade_id: number;
  nome_fantasia: string;
  latitude: number | null;
  longitude: number | null;
};

/** Todos os pacientes (paginado — PostgREST devolve no máximo 1000 linhas por request). */
export async function fetchPacientesGeo(limit = Infinity): Promise<PacienteGeo[]> {
  const pageSize = 1_000;
  const all: PacienteGeo[] = [];
  for (let from = 0; from < limit; from += pageSize) {
    const { data, error } = await supabase
      .from("pacientes")
      .select("paciente_id, nome, prontuario, cep, sexo, ano_nascimento, bairro, cidade, estado, latitude, longitude, convenio_id, metricas")
      .order("paciente_id", { ascending: true })
      .range(from, Math.min(from + pageSize - 1, limit - 1));
    if (error) throw error;
    all.push(...((data ?? []) as unknown as PacienteGeo[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

export async function fetchUnidadesGeo(): Promise<UnidadeGeo[]> {
  const { data, error } = await supabase
    .from("unidades")
    .select("unidade_id, nome_fantasia, latitude, longitude");
  if (error) throw error;
  return (data ?? []).map((u) => ({
    unidade_id: u.unidade_id,
    nome_fantasia: u.nome_fantasia,
    latitude: u.latitude == null ? null : Number(u.latitude),
    longitude: u.longitude == null ? null : Number(u.longitude),
  }));
}

/** Distância em km entre duas coordenadas (Haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function idadeDe(anoNascimento: number | null | undefined): number | null {
  if (!anoNascimento) return null;
  const idade = new Date().getFullYear() - anoNascimento;
  return idade >= 0 && idade < 120 ? idade : null;
}

export function normalizarCidade(value: string | null | undefined): string {
  const raw = locationName(value);
  const key = locationKey(value);
  if (key === "acreuna") return "Acreúna";
  if (key === "santa helena" || key === "santa helena de goias") return "Santa Helena de Goiás";
  return raw;
}

/** Map-only source: complete stable pagination; no appointment enrichment or row ceiling. */
export async function fetchMapProduction(f:DashboardFilters):Promise<MapProduction[]> {
  const rows:MapProduction[]=[];
  for(let n=0;;n+=1000) {
    let q=supabase.from('vw_lab_producao_classificada').select('id,agendamento_id,paciente_id,paciente_nome,prontuario,grupo_nome,valor,situacao,convenio_nome,convenio_id').gte('data_execucao',f.from.toISOString().slice(0,10)).lte('data_execucao',f.to.toISOString().slice(0,10)).order('id').range(n,n+999);
    if(f.unidadeIds.length)q=q.in('unidade_id',f.unidadeIds);
    if(f.profissionalIds.length)q=q.in('profissional_id',f.profissionalIds);
    if(f.convenioTipo==='particular')q=q.or('convenio_id.is.null,convenio_id.eq.0,convenio_nome.eq.Particular').or('convenio_nome.is.null,convenio_nome.not.ilike.Não Faturado');
    if(f.convenioTipo==='convenio')q=q.not('convenio_nome','eq','Particular').not('convenio_id','is',null).not('convenio_id','eq',0).not('convenio_nome','ilike','Não Faturado');
    const {data,error}=await q;if(error)throw error;
    rows.push(...(data??[]).filter(r=>r.agendamento_id!=null).map(r=>({...r,agendamento_id:Number(r.agendamento_id)})));
    if(!data || data.length<1000)break;
  }
  return realMapRows(rows);
}

export function imcDe(metricas: Record<string, unknown> | null | undefined): number | null {
  if (!metricas) return null;
  const raw = (metricas as any).imc;
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
