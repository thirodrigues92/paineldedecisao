import { supabase } from "@/integrations/supabase/client";
import { categoriaServico } from "@/lib/service-categories";

export type HojeRow = {
  agendamento_id: number;
  horario: string | null;
  duracao_min: number | null;
  tempo_permanencia_min: number | null;
  hora_inicio_real: string | null;
  hora_fim_real: string | null;
  categoria: string;
  statusDescricao: string;
  pacienteNome: string;
  profissionalNome: string;
  procedimentoNome: string;
  convenioNome: string;
};

export type HojeSnapshot = {
  data: string;
  rows: HojeRow[];
  temTempoReal: boolean;
};

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LABORATORIO = "Laboratório";

/** Snapshot cru dos agendamentos do dia corrente (CURRENT_DATE), com joins resolvidos. */
export async function fetchHojeSnapshot(): Promise<HojeSnapshot> {
  const data = hojeISO();
  const pageSize = 1_000;
  const raw: any[] = [];

  for (let from = 0; from < 20_000; from += pageSize) {
    const { data: page, error } = await supabase
      .from("agendamentos")
      .select(
        "agendamento_id, horario, duracao_min, paciente_id, profissional_id, procedimento_id, convenio_id, status_id, procedimentos_detalhe",
      )
      .eq("data", data)
      .order("horario", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    raw.push(...(page ?? []));
    if (!page || page.length < pageSize) break;
  }

  const pacienteIds = [...new Set(raw.map((r) => r.paciente_id).filter(Boolean))] as number[];
  const pacienteMap = new Map<number, string>();
  for (let i = 0; i < pacienteIds.length; i += 500) {
    const { data: pacs } = await supabase
      .from("pacientes")
      .select("paciente_id, nome")
      .in("paciente_id", pacienteIds.slice(i, i + 500));
    for (const p of pacs ?? []) if (p.nome) pacienteMap.set(p.paciente_id, p.nome);
  }

  const [profs, procs, status, convs] = await Promise.all([
    supabase.from("profissionais").select("profissional_id, nome"),
    supabase.from("procedimentos").select("procedimento_id, nome").limit(5000),
    supabase.from("status_agendamento").select("status_id, categoria, descricao"),
    supabase.from("convenios").select("convenio_id, nome"),
  ]);

  const profMap = new Map((profs.data ?? []).map((p) => [p.profissional_id, p.nome]));
  const procMap = new Map((procs.data ?? []).map((p) => [p.procedimento_id, p.nome]));
  const statusMap = new Map((status.data ?? []).map((s) => [s.status_id, s]));
  const convMap = new Map((convs.data ?? []).map((c) => [c.convenio_id, c.nome]));

  const rows: HojeRow[] = raw.map((r) => {
    const st = r.status_id ? statusMap.get(r.status_id) : null;
    let procedimentoNome = (r.procedimento_id ? procMap.get(r.procedimento_id) : null) ?? "";
    if (!procedimentoNome && Array.isArray(r.procedimentos_detalhe) && r.procedimentos_detalhe.length) {
      const d0: any = r.procedimentos_detalhe[0];
      procedimentoNome = d0?.nome ?? d0?.procedimento_nome ?? "";
    }
    if (!procedimentoNome) procedimentoNome = "Não informado";

    let profissionalNome = (r.profissional_id ? profMap.get(r.profissional_id) : null) ?? "";
    if (categoriaServico(procedimentoNome) === "Exames laboratoriais") profissionalNome = LABORATORIO;
    if (!profissionalNome) profissionalNome = "Não informado";

    return {
      agendamento_id: r.agendamento_id,
      horario: r.horario ?? null,
      duracao_min: r.duracao_min ?? null,
      tempo_permanencia_min: (r as any).tempo_permanencia_min ?? null,
      hora_inicio_real: (r as any).hora_inicio_real ?? null,
      hora_fim_real: (r as any).hora_fim_real ?? null,
      categoria: st?.categoria ?? "outro",
      statusDescricao: st?.descricao ?? st?.categoria ?? "Sem status",
      pacienteNome: (r.paciente_id ? pacienteMap.get(r.paciente_id) : null) ?? "Paciente não identificado",
      profissionalNome,
      procedimentoNome,
      convenioNome: (r.convenio_id ? convMap.get(r.convenio_id) : null) ?? "Particular",
    };
  });

  return {
    data,
    rows,
    temTempoReal: rows.some((r) => (r.tempo_permanencia_min ?? 0) > 0),
  };
}
