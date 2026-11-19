export type ItemRegime = "pagamento" | "competencia";
export const DRE_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export type Summary = { grupo_chave: string; grupo_linha: string; secao: string; ordem_dre: number | null; categoria_id: number | null; categoria_nome: string | null; posicao: string | null; procedimento_grupo: string; receita_procedimento: boolean; mes: number; valor: number; receitas: number; despesas: number; ajustes: number; qtd: number };
export type Account = { id: number; nome: string; posicao: string | null; parent_id: number | null };
export type Scope = { group?: string; categories?: number[]; procedure?: string; total?: "receitas" | "despesas" | "resultado" | "operacional" };
export type TreeRow = { id: string; name: string; months: number[]; children: TreeRow[]; scope: Scope; section: string; total?: Scope["total"] };
const blank = () => Array<number>(12).fill(0);
const row = (id: string, name: string, scope: Scope, section: string): TreeRow => ({ id, name, scope, section, months: blank(), children: [] });
export const annual = (r: TreeRow) => r.months.reduce((s, v) => s + v, 0);
export const revenuePercent = (value: number, revenue: number) => revenue ? value / revenue * 100 : null;
export function buildDreTree(data: Summary[], accounts: Account[]): TreeRow[] {
  const roots = new Map<string, TreeRow>();
  const order = new Map<string, number>();
  const totals = { receitas: blank(), despesas: blank(), ajustes: blank() };
  for (const d of data) {
    const m = d.mes - 1;
    if (m < 0 || m > 11) continue;
    totals.receitas[m] += Number(d.receitas); totals.despesas[m] += Number(d.despesas); totals.ajustes[m] += Number(d.ajustes);
    let root = roots.get(d.grupo_chave);
    if (!root) { root = row(d.grupo_chave, d.grupo_linha, { group: d.grupo_chave }, d.secao); roots.set(d.grupo_chave, root); }
    root.months[m] += Number(d.valor);
    order.set(root.id, d.grupo_chave === "proc:particular" ? -3 : d.grupo_chave === "proc:convenio" ? -2 : d.grupo_chave === "proc:sem-vinculo" ? -1 : d.ordem_dre ?? 9999);
    if (d.receita_procedimento) {
      const id = `${root.id}/proc/${d.procedimento_grupo}`;
      let child = root.children.find(c => c.id === id);
      if (!child) { child = row(id, d.procedimento_grupo, { group: root.id, procedure: d.procedimento_grupo }, root.section); root.children.push(child); }
      child.months[m] += Number(d.valor);
      continue;
    }
    const matched = accounts.find(c => c.id === d.categoria_id);
    const ancestors: Account[] = [];
    let current = matched;
    const seen = new Set<number>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.posicao === d.grupo_chave) break;
      ancestors.unshift(current);
      current = accounts.find(c => c.id === current?.parent_id);
      if (current?.posicao && d.grupo_chave.includes(".") && !current.posicao.startsWith(d.grupo_chave)) break;
    }
    if (!ancestors.length) {
      // Direct postings remain a separate child so their siblings still reconcile to the parent.
      ancestors.push({ id: d.categoria_id ?? 0, nome: d.categoria_nome ? `${d.categoria_nome} · lançamentos diretos` : "SEM CATEGORIA", posicao: d.posicao, parent_id: null });
    }
    let parent = root;
    for (const category of ancestors) {
      const id = `${parent.id}/cat/${category.id}`;
      let child = parent.children.find(c => c.id === id);
      if (!child) { child = row(id, category.nome, { group: root.id, categories: [] }, root.section); parent.children.push(child); }
      if (d.categoria_id !== null && !child.scope.categories?.includes(d.categoria_id)) child.scope.categories?.push(d.categoria_id);
      child.months[m] += Number(d.valor);
      parent = child;
    }
  }
  for (const [id, name] of [["proc:particular", "RECEITA PARTICULAR"], ["proc:convenio", "RECEITA CONVÊNIO"]]) {
    if (!roots.has(id)) { roots.set(id, row(id, name, { group: id }, "income")); order.set(id, id === "proc:particular" ? -3 : -2); }
  }
  const sortChildren = (r: TreeRow) => {
    if (r.children.length && r.id.includes("/cat/")) {
      const direct = r.months.map((v, i) => v - r.children.reduce((s, c) => s + c.months[i], 0));
      if (direct.some(v => Math.abs(v) > 0.000001)) {
        const category = Number(r.id.split("/cat/").at(-1));
        r.children.push({ ...row(`${r.id}/direct`, `${r.name} · lançamentos diretos`, { group: r.scope.group, categories: [category] }, r.section), months: direct });
      }
    }
    const position = (c: TreeRow) => accounts.find(a => a.id === Number(c.id.split("/cat/").at(-1)))?.posicao ?? c.name;
    r.children.sort((a, b) => position(a).localeCompare(position(b), "pt-BR", { numeric: true }));
    r.children.forEach(sortChildren);
  };
  const groups = [...roots.values()].sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  groups.forEach(sortChildren);
  const totalRow = (id: NonNullable<Scope["total"]>, name: string, months: number[]) => ({ ...row(`total:${id}`, name, { total: id }, "total"), months, total: id });
  return [
    ...groups.filter(g => g.section === "income"), totalRow("receitas", "TOTAL DE RECEITAS", totals.receitas),
    ...groups.filter(g => g.section !== "income"), totalRow("despesas", "TOTAL DE DESPESAS", totals.despesas),
    totalRow("resultado", "RESULTADO", totals.receitas.map((v, i) => v - totals.despesas[i])),
    totalRow("operacional", "RESULTADO OPERACIONAL", totals.receitas.map((v, i) => v - totals.despesas[i] + totals.ajustes[i])),
  ];
}
export function flattenTree(rows: TreeRow[], depth = 0): { row: TreeRow; depth: number }[] {
  return rows.flatMap(r => [{ row: r, depth }, ...flattenTree(r.children, depth + 1)]);
}
export function itemContribution(item: { tipo_transacao: string | null; valor_item: number | null; valor_linha: number | null; ajustar_operacional: boolean | null }, scope: Scope): number {
  const value = Number(item.valor_item ?? 0);
  if (scope.total === "receitas") return item.tipo_transacao === "C" ? value : 0;
  if (scope.total === "despesas") return item.tipo_transacao === "D" ? value : 0;
  if (scope.total) return item.tipo_transacao === "C" ? value : scope.total === "operacional" && item.ajustar_operacional ? 0 : -value;
  return Number(item.valor_linha ?? 0);
}