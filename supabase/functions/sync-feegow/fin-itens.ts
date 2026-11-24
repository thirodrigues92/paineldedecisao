import { feegowIntegerId } from "./plano-contas.ts";
import { completeAccountPeople } from "./conta-pessoa.ts";

type Raw = Record<string, any>;
export function itemDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function itemWindows(from: string, to: string) {
  if (!itemDate(from) || !itemDate(to) || from > to) throw new Error("Período de itens inválido");
  const windows: { from: string; to: string }[] = [];
  for (let day = new Date(`${from}T12:00:00Z`); day.toISOString().slice(0, 10) <= to;) {
    const end = new Date(day); end.setUTCDate(end.getUTCDate() + 6);
    const fim = end.toISOString().slice(0, 10) > to ? to : end.toISOString().slice(0, 10);
    windows.push({ from: day.toISOString().slice(0, 10), to: fim });
    day = new Date(`${fim}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1);
  }
  return windows;
}

function cents(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error("Valor de item Feegow inválido");
  return number / 100;
}
function flag(value: unknown) { return value === true || value === 1 || value === "1" || value === "true"; }

export function invoiceItems(invoices: Raw[], tipo_transacao: "C" | "D") {
  const rows = new Map<number, Raw>();
  let invalidos = 0;
  for (const invoice of invoices) {
    const detalhe = invoice.detalhes?.[0] ?? {};
    const pagamentos: Raw[] = Array.isArray(invoice.pagamentos) ? invoice.pagamentos : [];
    const datas = pagamentos.map(p => itemDate(p.data)).filter((d): d is string => d !== null).sort();
    const valor_pago = pagamentos.reduce((sum, p) => sum + cents(p.valor), 0);
    for (const item of Array.isArray(invoice.itens) ? invoice.itens : []) {
      const item_id = feegowIntegerId(item.item_id);
      if (item_id === null) { invalidos++; continue; }
      rows.set(item_id, {
        item_id, invoice_id: feegowIntegerId(detalhe.invoice_id), tipo_transacao,
        categoria_id: feegowIntegerId(item.categoria_id), centro_custo_id: feegowIntegerId(item.centro_custo_id),
        procedimento_id: feegowIntegerId(item.procedimento_id), agendamento_id: feegowIntegerId(item.agendamento_id),
        quantidade: Number(item.quantidade ?? 0), valor: cents(item.valor), desconto: cents(item.desconto),
        acrescimo: cents(item.acrescimo), is_cancelado: flag(item.is_cancelado),
        data_competencia: itemDate(detalhe.data), data_pagamento: datas.at(-1) ?? null, valor_pago,
        unidade_id: feegowIntegerId(detalhe.unidade_id),
        payload_raw: { item, detalhes: invoice.detalhes ?? [], pagamentos }, atualizado_em: new Date().toISOString(),
      });
    }
  }
  return { rows: [...rows.values()], invalidos };
}

/** Payment totals belong to the invoice and are repeated on its items, never additive revenue. */
export async function syncInvoiceItems(client: any, token: string, from: string, to: string) {
  let gravados = 0, invalidos = 0;
  for (const window of itemWindows(from, to)) {
    for (const tipo_transacao of ["C", "D"] as const) {
      const url = new URL("https://api.feegow.com/v1/api/financial/list-invoice");
      url.searchParams.set("data_start", window.from.split("-").reverse().join("-"));
      url.searchParams.set("data_end", window.to.split("-").reverse().join("-"));
      url.searchParams.set("tipo_transacao", tipo_transacao);
      let list: Raw[] | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, { headers: { "x-access-token": token }, signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(`Feegow itens HTTP ${response.status}`);
          const body = await response.json();
          if (body.success !== true) throw new Error("Feegow não confirmou a consulta dos itens");
          if (body.content === false || body.content === null) list = [];
          else if (Array.isArray(body.content)) list = body.content;
          else throw new Error("Resposta de itens sem lista de contas");
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        }
      }
      if (!list) throw new Error("Consulta dos itens não concluída");
      const parsed = invoiceItems(list, tipo_transacao);
      invalidos += parsed.invalidos;
      for (let i = 0; i < parsed.rows.length; i += 500) {
        const batch = parsed.rows.slice(i, i + 500);
        const { error } = await client.from("fin_itens").upsert(batch, { onConflict: "item_id" });
        if (error) throw new Error(`Gravação de itens: ${error.message}`);
        gravados += batch.length;
      }
    }
  }
  // Enrichment must never turn a successful invoice load into a failed sync.
  let pessoas;
  try { pessoas = await completeAccountPeople(client, token); }
  catch { pessoas = { erro: "Não foi possível completar nomes nesta execução" }; }
  return { from, to, gravados, invalidos, pessoas };
}