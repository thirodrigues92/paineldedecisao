import { supabase } from "@/integrations/supabase/client";
import type { DashboardFilters } from "@/lib/filters-context";

export type DashboardAppointment = {
  agendamento_id: number;
  data: string;
  horario: string | null;
  paciente_id: number | null;
  valor_total: number | string | null;

  especialidade_id: number | null;
  profissional_id: number | null;
  procedimento_id: number | null;
  unidade_id: number | null;
  convenio_id: number | null;
  primeiro_agendamento: boolean | null;
  status_id: number | null;
  especialidades: { especialidade_id: number; nome: string } | null;
  procedimentos: { procedimento_id: number; nome: string } | null;
  profissionais: { profissional_id: number; nome: string } | null;
  unidades: { unidade_id: number; nome_fantasia: string } | null;
  status_agendamento: { status_id: number; categoria: string; descricao: string | null } | null;
};

export type FinancialRow = {
  tipo: string | null;
  valor: number | string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string | null;
  categoria: string | null;
  unidade_id: number | null;
  convenio_id: number | null;
  procedimento_id: number | null;
  descricao_item: string | null;
  agendamento_id: number | null;
};



function toISO(d: Date) {
  return d.toISOString().substring(0, 10);
}

export function dashboardQueryKey(scope: string, f: DashboardFilters) {
  return [
    scope,
    f.from.toISOString(),
    f.to.toISOString(),
    f.unidadeIds,
    f.profissionalIds,
    f.especialidadeIds,
    f.convenioTipo,
  ];
}

export const financialQueryKey = (scope: string, f: DashboardFilters) => dashboardQueryKey(scope, f);

export type PacienteRegiao = { paciente_id: number; bairro: string | null; cidade: string | null };

/** Mapa paciente_id → bairro/cidade, usado nas análises regionais. */
export async function fetchPacientesRegioes(limit = 20_000): Promise<Map<number, PacienteRegiao>> {
  const pageSize = 1_000;
  const map = new Map<number, PacienteRegiao>();

  for (let from = 0; from < limit; from += pageSize) {
    const { data, error } = await supabase
      .from("pacientes")
      .select("paciente_id, bairro, cidade")
      .order("paciente_id", { ascending: true })
      .range(from, Math.min(from + pageSize - 1, limit - 1));

    if (error) throw error;
    for (const p of data ?? []) map.set(p.paciente_id, p as PacienteRegiao);
    if (!data || data.length < pageSize) break;
  }

  return map;
}

/** Mapa procedimento_id → nome (catálogo completo). */
export async function fetchProcedimentoNomes(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const pageSize = 1_000;
  for (let from = 0; from < 10_000; from += pageSize) {
    const { data, error } = await supabase
      .from("procedimentos")
      .select("procedimento_id, nome")
      .order("procedimento_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const p of data ?? []) map.set(p.procedimento_id, p.nome);
    if (!data || data.length < pageSize) break;
  }
  return map;
}

export async function fetchFinancialRows(f: DashboardFilters, limit = 20_000): Promise<FinancialRow[]> {


  const pageSize = 1_000;
  const all: FinancialRow[] = [];

  for (let from = 0; from < limit; from += pageSize) {
    let q = supabase
      .from("financeiro_lancamentos")
      .select("tipo, valor, data_vencimento, data_pagamento, status, categoria, unidade_id, convenio_id, procedimento_id, descricao_item")
      .gte("data_vencimento", toISO(f.from))
      .lte("data_vencimento", toISO(f.to))
      .order("data_vencimento", { ascending: true })
      .range(from, Math.min(from + pageSize - 1, limit - 1));

    if (f.unidadeIds.length) q = q.in("unidade_id", f.unidadeIds);
    if (f.convenioTipo === "particular") q = q.is("convenio_id", null);
    if (f.convenioTipo === "convenio") q = q.not("convenio_id", "is", null);

    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data ?? []) as FinancialRow[]));
    if (!data || data.length < pageSize) break;
  }

  return all;
}

export async function fetchDashboardAppointments(
  f: DashboardFilters,
  limit = 30_000,
): Promise<DashboardAppointment[]> {
  const pageSize = 1_000;
  const fetchAppointments = async () => {
    const all: any[] = [];
    for (let from = 0; from < limit; from += pageSize) {
      let q = supabase
        .from("agendamentos")
        .select("agendamento_id, data, horario, paciente_id, valor_total, especialidade_id, profissional_id, procedimento_id, unidade_id, convenio_id, primeiro_agendamento, status_id")
        .gte("data", toISO(f.from))
        .lte("data", toISO(f.to))
        .order("data", { ascending: true })
        .range(from, Math.min(from + pageSize - 1, limit - 1));

      if (f.unidadeIds.length) q = q.in("unidade_id", f.unidadeIds);
      if (f.profissionalIds.length) q = q.in("profissional_id", f.profissionalIds);
      if (f.especialidadeIds.length) q = q.in("especialidade_id", f.especialidadeIds);
      if (f.convenioTipo === "particular") q = q.is("convenio_id", null);
      if (f.convenioTipo === "convenio") q = q.not("convenio_id", "is", null);

      const { data, error } = await q;
      if (error) throw error;
      all.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    return all;
  };

  const [appointments, esps, profs, units, statuses, procs] = await Promise.all([
    fetchAppointments(),
    supabase.from("especialidades").select("especialidade_id, nome"),
    supabase.from("profissionais").select("profissional_id, nome"),
    supabase.from("unidades").select("unidade_id, nome_fantasia"),
    supabase.from("status_agendamento").select("status_id, categoria, descricao"),
    supabase.from("procedimentos").select("procedimento_id, nome").limit(5000),
  ]);

  if (esps.error) throw esps.error;
  if (profs.error) throw profs.error;
  if (units.error) throw units.error;
  if (statuses.error) throw statuses.error;
  if (procs.error) throw procs.error;

  const espMap = new Map((esps.data ?? []).map((e) => [e.especialidade_id, e]));
  const profMap = new Map((profs.data ?? []).map((p) => [p.profissional_id, p]));
  const unitMap = new Map((units.data ?? []).map((u) => [u.unidade_id, u]));
  const statusMap = new Map((statuses.data ?? []).map((s) => [s.status_id, s]));
  const procMap = new Map((procs.data ?? []).map((p) => [p.procedimento_id, p]));

  return appointments.map((r: any) => ({
    ...r,
    especialidades: espMap.get(r.especialidade_id) ?? null,
    profissionais: profMap.get(r.profissional_id) ?? null,
    unidades: unitMap.get(r.unidade_id) ?? null,
    status_agendamento: statusMap.get(r.status_id) ?? null,
    procedimentos: procMap.get(r.procedimento_id) ?? null,
  }));
}