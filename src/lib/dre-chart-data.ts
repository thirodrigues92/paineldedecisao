import { annual, DRE_MONTHS, type TreeRow } from "./dre-tree";

const normalize = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/ · LANCAMENTOS DIRETOS$/, "");
const excludedGroup = (r: TreeRow) =>
  ["SOCIOS", "AQUISICAO DE PATRIMONIO"].includes(normalize(r.name));
const categoryIds = (r: TreeRow): number[] => [
  ...new Set([...(r.scope.categories ?? []), ...r.children.flatMap(categoryIds)]),
];
const expansionIds = (r: TreeRow): number[] =>
  normalize(r.name) === "AMPLIACAO" ? categoryIds(r) : r.children.flatMap(expansionIds);
function withoutExpansion(r: TreeRow): TreeRow {
  if (normalize(r.name) === "AMPLIACAO")
    return { ...r, months: r.months.map(() => 0), children: [] };
  const children = r.children.map(withoutExpansion);
  const excluded = new Set(expansionIds(r));
  const scope = excluded.size
    ? { ...r.scope, categories: categoryIds(r).filter((id) => !excluded.has(id)) }
    : r.scope;
  return {
    ...r,
    scope,
    children,
    months: r.months.map(
      (v, i) =>
        v -
        r.children.reduce(
          (s, c, index) => s + (c.months[i] ?? 0) - (children[index]?.months[i] ?? 0),
          0,
        ),
    ),
  };
}
export const focusValue = (r: TreeRow, month: number | null) =>
  month === null ? annual(r) : (r.months[month - 1] ?? 0);
export function latestDreMonth(tree: TreeRow[]): number {
  for (let i = 11; i >= 0; i--) if (tree.some((r) => (r.months[i] ?? 0) !== 0)) return i + 1;
  return 1;
}
export function dreChartData(tree: TreeRow[], operational: boolean) {
  const groups = tree.filter((r) => r.section !== "income" && !r.total);
  const visibleGroups = operational
    ? groups.filter((r) => !excludedGroup(r)).map(withoutExpansion)
    : groups;
  const months = DRE_MONTHS.map((name, i) => {
    const revenue = tree.find((r) => r.total === "receitas")?.months[i] ?? 0;
    const originalExpense = tree.find((r) => r.total === "despesas")?.months[i] ?? 0;
    const excluded = operational
      ? groups.reduce((s, r) => s + (r.months[i] ?? 0), 0) -
        visibleGroups.reduce((s, r) => s + (r.months[i] ?? 0), 0)
      : 0;
    const expense = originalExpense - excluded;
    const result = operational
      ? revenue - expense
      : (tree.find((r) => r.total === "resultado")?.months[i] ?? revenue - expense);
    return {
      month: i + 1,
      name,
      revenue,
      expense,
      result,
      margin: revenue ? (result / revenue) * 100 : null,
    };
  });
  return { groups: visibleGroups, months };
}
export function focusTotals(
  months: ReturnType<typeof dreChartData>["months"],
  month: number | null,
) {
  const selected = month === null ? months : months.filter((m) => m.month === month);
  const totals = selected.reduce(
    (s, m) => ({
      revenue: s.revenue + m.revenue,
      expense: s.expense + m.expense,
      result: s.result + m.result,
    }),
    { revenue: 0, expense: 0, result: 0 },
  );
  return { ...totals, margin: totals.revenue ? (totals.result / totals.revenue) * 100 : null };
}
export function chartChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return null;
  return {
    amount: current - previous,
    percent: previous ? ((current - previous) / Math.abs(previous)) * 100 : null,
  };
}
export function expenseSlices(groups: TreeRow[], month: number | null) {
  const sorted = groups
    .map((row) => ({ row, value: focusValue(row, month) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.row.id.localeCompare(b.row.id));
  const slices = sorted
    .slice(0, 7)
    .map((g) => ({ id: g.row.id, name: g.row.name, value: g.value, rows: [g.row] }));
  const others = sorted.slice(7);
  if (others.length)
    slices.push({
      id: "other",
      name: "Outros",
      value: others.reduce((s, g) => s + g.value, 0),
      rows: others.map((g) => g.row),
    });
  return slices;
}
