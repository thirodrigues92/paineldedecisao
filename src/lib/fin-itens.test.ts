import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { invoiceItems, itemWindows } from "../../supabase/functions/sync-feegow/fin-itens.ts";

const conta = {
  detalhes: [{ invoice_id: 100084, data: "18-11-2026", unidade_id: 0 }],
  itens: [{ item_id: 247547, categoria_id: 138, centro_custo_id: 23, valor: 37000, desconto: 100, acrescimo: 250, quantidade: 2 }],
  pagamentos: [{ data: "19-11-2026", valor: 20000 }, { data: "18-11-2026", valor: 10000 }],
};
describe("Invoice item sync", () => {
  it("uses each item's category rather than the first item's category", () => {
    const { rows } = invoiceItems([{ ...conta, itens: [...conta.itens, { item_id: 247548, categoria_id: 0, valor: 500 }] }], "D");
    assert.deepEqual(rows.map(r => r.categoria_id), [138, 0]);
  });
  it("converts item cents without scaling quantity", () => {
    const [row] = invoiceItems([conta], "D").rows;
    assert.equal(row?.valor, 370); assert.equal(row?.desconto, 1); assert.equal(row?.acrescimo, 2.5); assert.equal(row?.quantidade, 2);
  });
  it("uses first detail competency, latest payment date and summed payment cents", () => {
    const [row] = invoiceItems([conta], "C").rows;
    assert.equal(row?.data_competencia, "2026-11-18"); assert.equal(row?.data_pagamento, "2026-11-19"); assert.equal(row?.valor_pago, 300);
  });
  it("leaves unpaid accounts without a payment date", () => {
    const [row] = invoiceItems([{ ...conta, pagamentos: [] }], "C").rows;
    assert.equal(row?.data_pagamento, null); assert.equal(row?.valor_pago, 0);
  });
  it("splits dates into inclusive seven-day windows", () => {
    assert.deepEqual(itemWindows("2026-01-01", "2026-01-15"), [{ from: "2026-01-01", to: "2026-01-07" }, { from: "2026-01-08", to: "2026-01-14" }, { from: "2026-01-15", to: "2026-01-15" }]);
  });
  it("deduplicates by item id and preserves invalid category originals", () => {
    const result = invoiceItems([conta, { ...conta, itens: [{ ...conta.itens[0], categoria_id: "35.70000076293945", is_cancelado: "1" }] }], "D");
    assert.equal(result.rows.length, 1); assert.equal(result.rows[0]?.categoria_id, null);
    assert.equal(result.rows[0]?.payload_raw.item.categoria_id, "35.70000076293945"); assert.equal(result.rows[0]?.is_cancelado, true);
  });
});