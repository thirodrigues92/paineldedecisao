import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { productionMetrics, unbilledWarning, missingGroupWarning } from "./production-metrics";

describe("Production monetary rules", () => {
  it("produced includes all items, billed and unbilled use their exact statuses, received sums item payments", () => {
    assert.deepEqual(productionMetrics([
      { valor: 200, valor_pago: 80, situacao: "Faturado" },
      { valor: 50, valor_pago: null, situacao: "Não Faturado" },
      { valor: 20, valor_pago: 5, situacao: null },
    ]), { produzido: 270, faturado: 200, nao_faturado: 50, recebido: 85 });
  });
  it("warns only above 10% unbilled, not at 10% or zero produced", () => {
    assert.equal(unbilledWarning(1000,100), false);
    assert.equal(unbilledWarning(1000,100.01), true);
    assert.equal(unbilledWarning(0,0), false);
  });
  it("missing-group warning starts above R$ 1.000 in the month", () => {
    assert.equal(missingGroupWarning(1000), false);
    assert.equal(missingGroupWarning(1000.01), true);
  });
});