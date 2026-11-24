import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  chartChange,
  dreChartData,
  expenseSlices,
  focusTotals,
  latestDreMonth,
} from "./dre-chart-data";
import type { TreeRow } from "./dre-tree";
const row = (id: string, name: string, value: number, children: TreeRow[] = []): TreeRow => ({
  id,
  name,
  months: [value, ...Array<number>(11).fill(0)],
  children,
  section: "expense",
  scope: { group: id },
});
const total = (kind: "receitas" | "despesas" | "resultado", value: number): TreeRow => ({
  ...row(kind, kind, value),
  total: kind,
  section: "total",
});
const tree = [
  row("1", "Operação", 100, [row("c", "Custos", 70), row("a", "Ampliação", 30)]),
  row("2", "SÓCIOS", 20),
  row("3", "AQUISIÇÃO DE PATRIMÔNIO", 40),
  total("receitas", 200),
  total("despesas", 160),
  total("resultado", 40),
];
describe("DRE chart presentation rules", () => {
  it("defaults to the last month with any data", () => {
    const r = row("a", "Dados", 0);
    r.months[10] = 25;
    assert.equal(latestDreMonth([r]), 11);
  });
  it("keeps original total rows and no operational exclusion by default", () => {
    assert.deepEqual(focusTotals(dreChartData(tree, false).months, 1), {
      revenue: 200,
      expense: 160,
      result: 40,
      margin: 20,
    });
  });
  it("excludes SÓCIOS from operational charts", () => {
    const filtered = dreChartData(
      [row("2", "SÓCIOS", 20), total("receitas", 100), total("despesas", 50)],
      true,
    );
    assert.equal(filtered.months[0]?.expense, 30);
    assert.equal(filtered.groups.length, 0);
  });
  it("excludes AQUISIÇÃO DE PATRIMÔNIO from operational charts", () => {
    const filtered = dreChartData(
      [row("3", "AQUISIÇÃO DE PATRIMÔNIO", 40), total("receitas", 100), total("despesas", 50)],
      true,
    );
    assert.equal(filtered.months[0]?.expense, 10);
  });
  it("subtracts Ampliação once across nested ancestors without mutating table data", () => {
    const original = JSON.stringify(tree);
    const data = dreChartData(tree, true);
    assert.equal(data.months[0]?.expense, 70);
    assert.equal(data.months[0]?.result, 130);
    assert.equal(data.groups[0]?.months[0], 70);
    assert.equal(JSON.stringify(tree), original);
  });
  it("narrows chart group drawer scope to exclude Ampliação while retaining other categories", () => {
    const cost = row("c", "Custos", 70);
    cost.scope.categories = [4];
    const expansion = row("a", "Ampliação", 30);
    expansion.scope.categories = [5];
    const root = row("r", "Operação", 100, [cost, expansion]);
    assert.deepEqual(dreChartData([root], true).groups[0]?.scope.categories, [4]);
    assert.equal(root.scope.categories, undefined);
  });
  it("compares current focus to the prior month and handles zero bases", () => {
    assert.deepEqual(chartChange(120, 100), { amount: 20, percent: 20 });
    assert.deepEqual(chartChange(10, 0), { amount: 10, percent: null });
    assert.equal(chartChange(10, null), null);
  });
  it("annual focus sums all twelve months instead of hierarchical children", () => {
    const data = dreChartData(tree, false);
    assert.equal(focusTotals(data.months, null).expense, 160);
  });
  it("uses the seven largest groups plus Others without losing any group", () => {
    const slices = expenseSlices(
      Array.from({ length: 10 }, (_, i) => row(String(i), `Grupo ${i}`, i + 1)),
      1,
    );
    assert.equal(slices.length, 8);
    assert.equal(slices.at(-1)?.name, "Outros");
    assert.equal(slices.at(-1)?.value, 6);
    assert.equal(
      slices.reduce((s, g) => s + g.value, 0),
      55,
    );
  });
});
