export type ProducaoOrigem = "Particular" | "Convênio" | "Não faturado";
type OrigemRow = { convenio_nome: string | null; convenio_id?: number | null };

export function origemProducao(row: OrigemRow): ProducaoOrigem {
  const nome = (row.convenio_nome ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (nome === "nao faturado") return "Não faturado";
  if (nome === "particular" || (!nome && (row.convenio_id ?? 0) <= 0)) return "Particular";
  return "Convênio";
}

export function nomeConvenioProducao(row: OrigemRow): string {
  if (origemProducao(row) === "Não faturado") return "Não faturado";
  return row.convenio_nome?.trim() || origemProducao(row);
}

export function resumoOrigensProducao(rows: (OrigemRow & { valor: number | string | null })[]) {
  const totais: Record<ProducaoOrigem, number> = { Particular: 0, "Convênio": 0, "Não faturado": 0 };
  for (const row of rows) totais[origemProducao(row)] += Number(row.valor ?? 0);
  return Object.entries(totais).map(([name, value]) => ({ name, value }));
}

type TransacaoRow = { id_transacao?: string | null; agendamento_id: number | bigint; procedimento_id: number | bigint | null; n_guia_prestador?: string };

/** Deduplicate a batch, reject blank IDs and process billing before stale ATEs. The DB trigger handles stored rows and races. */
export function prepararProducao<T extends TransacaoRow>(rows: T[]): T[] {
  const validos = rows.filter(r => (r.id_transacao ?? "").trim() !== "");
  const par = (r: T) => `${r.agendamento_id}|${r.procedimento_id}`;
  const faturados = new Set(validos.filter(r => !r.id_transacao?.startsWith("ATE")).map(par));
  const unicos = new Map<string, T>();
  for (const r of validos) {
    if (r.id_transacao?.startsWith("ATE") && faturados.has(par(r))) continue;
    unicos.set(`${par(r)}|${r.id_transacao}|${r.n_guia_prestador ?? ""}`, r);
  }
  return [...unicos.values()].sort((a, b) => par(a).localeCompare(par(b)));
}