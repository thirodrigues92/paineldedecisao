import { supabase } from "@/integrations/supabase/client";

export type Regime = "competencia" | "caixa";
export type DreRow = { mes: string; grupo_dre: string; tipo: string; valor: number };

export const GRUPOS_VARIAVEIS = ["Repasses médicos", "Insumos e apoio", "Impostos"];
export const GRUPOS_FIXOS = ["Pessoal", "Ocupação", "Marketing", "Administrativo e outras", "Pró-labore"];
export const GRUPOS_FORA = ["Investimento", "Distribuição a sócios"];
export const GRUPOS_PENDENTES = ["Revisar", "Não classificado"];
export const MARGEM = "Margem de contribuição";
export const RESULTADO = "Resultado operacional";
export const FIXAS = "__fixas";

export const ORDEM_DRE = [
  "Receita", ...GRUPOS_VARIAVEIS, MARGEM, ...GRUPOS_FIXOS, RESULTADO, ...GRUPOS_FORA, ...GRUPOS_PENDENTES,
];

export const dreQueryKey = (regime: Regime) => ["dre-mensal", regime];

export async function fetchDre(regime: Regime): Promise<DreRow[]> {
  const view = regime === "caixa" ? "vw_dre_mensal_caixa" : "vw_dre_mensal";
  const { data, error } = await (supabase as any).from(view).select("*");
  if (error) throw error;
  return ((data ?? []) as DreRow[]).map((r) => ({ ...r, valor: Number(r.valor || 0) }));
}

export const mesKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function mesesEntre(from: Date, to: Date): string[] {
  const out: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (d <= end) { out.push(mesKey(d)); d.setMonth(d.getMonth() + 1); }
  return out;
}

export function mesesAnteriores(meses: string[]): string[] {
  const [y, m] = meses[0].split("-").map(Number);
  const out: string[] = [];
  for (let i = meses.length; i >= 1; i--) out.push(mesKey(new Date(y, m - 1 - i, 1)));
  return out;
}

export function mesLabel(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

/** Soma por grupo nos meses informados; inclui chave FIXAS. */
export function totais(rows: DreRow[], meses: string[]): Record<string, number> {
  const set = new Set(meses);
  const t: Record<string, number> = {};
  for (const r of rows) {
    if (!set.has(r.mes)) continue;
    t[r.grupo_dre] = (t[r.grupo_dre] ?? 0) + r.valor;
    if (r.tipo === "fixa") t[FIXAS] = (t[FIXAS] ?? 0) + r.valor;
  }
  return t;
}

export function mesRange(meses: string[]): { from: string; to: string } {
  const [y, m] = meses[meses.length - 1].split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${meses[0]}-01`, to: `${meses[meses.length - 1]}-${String(last).padStart(2, "0")}` };
}

export type Lancamento = { data: string | null; descricao: string; categoria: string; valor: number };

/** Lançamentos que compõem um grupo do DRE no intervalo (datas AAAA-MM-DD). */
export async function fetchLancamentosGrupo(grupo: string, from: string, to: string, regime: Regime): Promise<Lancamento[]> {
  const sb = supabase as any;
  if (grupo === "Receita" && regime === "competencia") {
    const { data, error } = await sb.from("lab_producao_feegow")
      .select("data_execucao, paciente_nome, procedimento_nome, profissional_nome, grupo_nome, valor")
      .eq("situacao", "Faturado").gte("data_execucao", from).lte("data_execucao", to)
      .order("valor", { ascending: false }).limit(1000);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      data: r.data_execucao,
      descricao: [r.paciente_nome, r.procedimento_nome, r.profissional_nome].filter(Boolean).join(" · "),
      categoria: r.grupo_nome ?? "—",
      valor: Number(r.valor || 0),
    }));
  }
  const dateCol = regime === "caixa" ? "data_pagamento" : "data_vencimento";
  let q = sb.from("financeiro_lancamentos")
    .select("data_vencimento, data_pagamento, categoria, descricao_item, valor, status")
    .gte(dateCol, from).lte(dateCol, to).order("valor", { ascending: false }).limit(1000);
  if (grupo === "Receita") {
    q = q.eq("tipo", "receita");
  } else {
    q = q.eq("tipo", "despesa");
    const { data: cats, error: e1 } = await sb.from("vw_dre_categorias").select("categoria_origem, grupo_dre, tipo");
    if (e1) throw e1;
    const alvo = (cats ?? []).filter((c: any) =>
      grupo === FIXAS || grupo === RESULTADO ? c.tipo === "fixa" || (grupo === RESULTADO && c.tipo === "variavel")
      : grupo === MARGEM ? c.tipo === "variavel"
      : c.grupo_dre === grupo,
    ).map((c: any) => c.categoria_origem as string);
    if (!alvo.length) return [];
    const temNulo = alvo.includes("Não classificado");
    const lista = alvo.map((c: string) => `"${c.replace(/"/g, '\\"')}"`).join(",");
    q = temNulo ? q.or(`categoria.is.null,categoria.in.(${lista})`) : q.in("categoria", alvo);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    data: r[dateCol],
    descricao: r.descricao_item ?? "—",
    categoria: r.categoria ?? "Não classificado",
    valor: Number(r.valor || 0),
  }));
}
