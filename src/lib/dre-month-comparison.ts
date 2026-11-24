import { chartChange, dreChartData, focusValue } from "./dre-chart-data";
import type { TreeRow } from "./dre-tree";

export type MonthPeriod = { year: number; month: number };
export const previousMonth = (p: MonthPeriod): MonthPeriod =>
  p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: p.month - 1 };
export type ComparedRow = {
  id: string;
  name: string;
  a: number;
  b: number;
  difference: number;
  percent: number | null;
  impact: number;
  rowA?: TreeRow;
  rowB?: TreeRow;
  children: ComparedRow[];
};
function mergeRows(a: TreeRow[], b: TreeRow[], monthA: number, monthB: number): ComparedRow[] {
  const ids = [...new Set([...a.map((r) => r.id), ...b.map((r) => r.id)])];
  return ids
    .map((id) => {
      const rowA = a.find((r) => r.id === id),
        rowB = b.find((r) => r.id === id);
      const valueA = rowA ? focusValue(rowA, monthA) : 0,
        valueB = rowB ? focusValue(rowB, monthB) : 0;
      const change = chartChange(valueB, valueA);
      const income = (rowB ?? rowA)?.section === "income";
      return {
        id,
        name: rowB?.name ?? rowA?.name ?? id,
        a: valueA,
        b: valueB,
        difference: valueB - valueA,
        percent: change?.percent ?? null,
        impact: (valueB - valueA) * (income ? 1 : -1),
        ...(rowA ? { rowA } : {}),
        ...(rowB ? { rowB } : {}),
        children: mergeRows(rowA?.children ?? [], rowB?.children ?? [], monthA, monthB),
      };
    })
    .sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact) || x.id.localeCompare(y.id));
}
export function compareDreMonths(
  treeA: TreeRow[],
  treeB: TreeRow[],
  monthA: number,
  monthB: number,
  operational: boolean,
): ComparedRow[] {
  const groups = (tree: TreeRow[]) => [
    ...tree.filter((r) => r.section === "income" && !r.total),
    ...dreChartData(tree, operational).groups,
  ];
  return mergeRows(groups(treeA), groups(treeB), monthA, monthB);
}
export function comparisonExportRows(groups: ComparedRow[], periodA: string, periodB: string) {
  const leafRows = (r: ComparedRow): ComparedRow[] =>
    r.children.length ? r.children.flatMap(leafRows) : [r];
  return groups.flatMap((group) =>
    leafRows(group)
      .filter((r) => r.a !== 0 || r.b !== 0)
      .map((r) => ({
        Grupo: group.name,
        Categoria: r === group ? "Lançamentos diretos" : r.name,
        "Mês A": r.a,
        "Mês B": r.b,
        "Diferença R$": r.difference,
        "Diferença %": r.percent === null ? null : r.percent / 100,
        "Período A": periodA,
        "Período B": periodB,
      })),
  );
}
