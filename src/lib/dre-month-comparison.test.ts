import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { compareDreMonths, comparisonExportRows, previousMonth } from "./dre-month-comparison";
import type { TreeRow } from "./dre-tree";
const row = (
  id: string,
  section: string,
  jan: number,
  feb: number,
  children: TreeRow[] = [],
): TreeRow => ({
  id,
  name: id,
  section,
  scope: { group: id },
  children,
  months: [jan, feb, ...Array<number>(10).fill(0)],
});
describe("DRE month comparison", () => {
  it("defaults month B to previous month, including January year rollover", () => {
    assert.deepEqual(previousMonth({ year: 2026, month: 1 }), { year: 2025, month: 12 });
    assert.deepEqual(previousMonth({ year: 2026, month: 11 }), { year: 2026, month: 10 });
  });
  it("uses B minus A for amount and percent", () => {
    const r = compareDreMonths(
      [row("income", "income", 100, 150)],
      [row("income", "income", 100, 150)],
      1,
      2,
      false,
    )[0];
    assert.equal(r?.difference, 50);
    assert.equal(r?.percent, 50);
  });
  it("marks rising income and falling expenses as positive result effects", () => {
    const tree = [row("income", "income", 100, 150), row("expense", "expense", 80, 50)];
    const r = compareDreMonths(tree, tree, 1, 2, false);
    assert.equal(r.find((x) => x.id === "income")?.impact, 50);
    assert.equal(r.find((x) => x.id === "expense")?.impact, 30);
  });
  it("marks falling income and rising expenses as negative result effects", () => {
    const tree = [row("income", "income", 150, 100), row("expense", "expense", 50, 80)];
    const r = compareDreMonths(tree, tree, 1, 2, false);
    assert.equal(r.find((x) => x.id === "income")?.impact, -50);
    assert.equal(r.find((x) => x.id === "expense")?.impact, -30);
  });
  it("unions groups and categories missing from either year and retains B scope", () => {
    const a = [row("old", "expense", 20, 0)],
      b = [row("new", "expense", 0, 30)];
    const r = compareDreMonths(a, b, 1, 2, false);
    assert.equal(r.find((x) => x.id === "old")?.b, 0);
    assert.equal(r.find((x) => x.id === "new")?.a, 0);
    assert.equal(r.find((x) => x.id === "new")?.rowB, b[0]);
  });
  it("sorts groups by absolute impact and does not count children as root impacts", () => {
    const tree = [
      row("small", "expense", 10, 15),
      row("large", "income", 10, 100, [row("child", "income", 10, 100)]),
    ];
    const r = compareDreMonths(tree, tree, 1, 2, false);
    assert.equal(r.length, 2);
    assert.equal(r[0]?.id, "large");
  });
  it("exports all leaf categories once with numeric Excel percentages", () => {
    const tree = [row("group", "income", 100, 150, [row("child", "income", 100, 150)])];
    const rows = comparisonExportRows(
      compareDreMonths(tree, tree, 1, 2, false),
      "Jan/2026",
      "Fev/2026",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.["Diferença R$"], 50);
    assert.equal(rows[0]?.["Diferença %"], 0.5);
  });
  it("does not invent percentages when A is zero", () => {
    assert.equal(
      compareDreMonths([], [row("new", "income", 0, 30)], 1, 2, false)[0]?.percent,
      null,
    );
  });
});
