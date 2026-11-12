import { feegowIntegerId } from "./feegow-identifiers";

type Source = Record<string, any>;

export function baixaDate(value: unknown): string | null {
  const s = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function recebimentosBaixados(invoices: Source[]) {
  const unique = new Map<string, Source>();
  let invalidos = 0;
  for (const invoice of invoices) {
    const detalhes: Source[] = invoice.detalhes ?? [];
    const itens: Source[] = invoice.itens ?? [];
    for (const pag of invoice.pagamentos ?? []) {
      const id = String(pag.pagamento_id ?? "");
      const data = baixaDate(pag.data);
      const centavos = Number(pag.valor);
      if (!/^\d+$/.test(id) || id === "0" || !data || !Number.isFinite(centavos)) {
        invalidos++;
        continue;
      }
      const row = {
        pagamento_id: id, invoice_id: detalhes[0]?.invoice_id ? String(detalhes[0].invoice_id) : null,
        data_baixa: data, valor: Math.round(centavos) / 100,
        descricao: [detalhes[0]?.responsavel, pag.descricao || detalhes[0]?.descricao, ...itens.map(i => i.descricao)].filter(Boolean).join(" · "),
        categoria: pag.tipo_conta === 6 ? "Convênio" : "Contas a receber",
        tipo_conta: feegowIntegerId(pag.tipo_conta), conta_id: pag.conta_id ? String(pag.conta_id) : null,
        forma_pagamento: feegowIntegerId(pag.forma_pagamento),
        payload_raw: { ...pag, _invoice_id: detalhes[0]?.invoice_id, _source: "financial/list-invoice", _tipo_transacao: "C" },
        synced_at: new Date().toISOString(),
      };
      const previous = unique.get(id);
      if (previous && (previous.valor !== row.valor || previous.data_baixa !== row.data_baixa)) {
        throw new Error(`Baixa ${id} com valores ou datas conflitantes na Feegow`);
      }
      unique.set(id, row);
    }
  }
  return { rows: [...unique.values()], invalidos };
}