import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { recebimentosBaixados } from "./financeiro-receita";

describe("Receita financeira: baixas reais de contas a receber", () => {
  it("uses actual partial payment amount and payment date, not invoice amount or production date", () => {
    const { rows } = recebimentosBaixados([{ detalhes: [{ invoice_id: 9, valor: 100000, data: "01-10-2026" }], pagamentos: [{ pagamento_id: 1, valor: 15000, data: "03-11-2026" }] }]);
    assert.equal(rows[0]?.valor, 150);
    assert.equal(rows[0]?.data_baixa, "2026-11-03");
  });
  it("counts a repeated pagamento_id once", () => {
    const i = { pagamentos: [{ pagamento_id: 1, valor: 15000, data: "03-11-2026" }] };
    const { rows } = recebimentosBaixados([i, i]);
    assert.equal(rows.length, 1);
    assert.equal(rows.reduce((s, r) => s + r.valor, 0), 150);
  });
  it("does not treat unpaid invoices as revenue", () => {
    assert.equal(recebimentosBaixados([{ detalhes: [{ valor: 100000 }], pagamentos: [] }]).rows.length, 0);
  });
  it("keeps multiple payments on their own dates", () => {
    const { rows } = recebimentosBaixados([{ pagamentos: [{ pagamento_id: 1, valor: 15000, data: "03-11-2026" }, { pagamento_id: 2, valor: 25000, data: "04-11-2026" }] }]);
    assert.deepEqual(rows.map(r => [r.valor, r.data_baixa]), [[150, "2026-11-03"], [250, "2026-11-04"]]);
  });
});