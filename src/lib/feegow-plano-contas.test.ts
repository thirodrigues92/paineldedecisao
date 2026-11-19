import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { collectPlanoContas, mapPlanoContas } from "./feegow-plano-contas";

describe("Feegow account tree", () => {
  it("keeps text positions and counts every level", () => {
    const [row] = mapPlanoContas([{ id: 21, name: "Pró-Labore", type: "expense", position: "10.10.2.4.2", parentId: 19 }], "2026-11-19");
    assert.equal(row?.posicao, "10.10.2.4.2");
    assert.equal(row?.nivel, 5);
    assert.equal(row?.parent_id, 19);
  });
  it("reads all declared pages with perPage 1000", async () => {
    const calls: number[][] = [];
    const rows = await collectPlanoContas(async (page, size) => {
      calls.push([page, size]);
      return { pages: 2, data: [{ id: page, name: `Conta ${page}`, type: "income", position: `1.${page}` }] };
    });
    assert.deepEqual(calls, [[1, 1000], [2, 1000]]);
    assert.equal(rows.length, 2);
  });
  it("retains invalid original parent IDs without rounding", () => {
    const [row] = mapPlanoContas([{ id: 21, name: "Conta", type: "expense", parentId: "35.70000076293945" }], "2026-11-19");
    assert.equal(row?.parent_id, null);
    assert.equal(row?.payload_raw.parentId, "35.70000076293945");
  });
  it("updates renamed or moved categories by the same id", async () => {
    const rows = await collectPlanoContas(async (page) => ({ pages: 2, data: [{ id: 21, name: page === 1 ? "Antiga" : "Nova", type: "expense", position: page === 1 ? "10.2" : "10.14" }] }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.nome, "Nova");
    assert.equal(rows[0]?.posicao, "10.14");
  });
});