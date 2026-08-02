import { supabase } from "@/integrations/supabase/client";

export type PacienteGeo = {
  paciente_id: number;
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
export async function fetchPacientesGeo(limit = 40_000): Promise<PacienteGeo[]> {
  const pageSize = 1_000;
  const all: PacienteGeo[] = [];
  for (let from = 0; from < limit; from += pageSize) {
    const { data, error } = await supabase
      .from("pacientes")
      .select("paciente_id, sexo, ano_nascimento, bairro, cidade, estado, latitude, longitude, convenio_id, metricas")
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

export function imcDe(metricas: Record<string, unknown> | null | undefined): number | null {
  if (!metricas) return null;
  const raw = (metricas as any).imc;
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
