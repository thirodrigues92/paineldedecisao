import { recebimentosBaixados } from "./financeiro-receita";

export async function syncReceitaBaixada(from: string, to: string) {
  const token = process.env['FEEGOW_API_TOKEN'];
  if (!token) throw new Error("Token Feegow não configurado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = new Map<string, Record<string, any>>();
  let invoices = 0;
  // The invoice endpoint filters invoice dates, not payment dates. Preserve every
  // returned payment date, including payments outside the requested invoice window.
  for (let day = new Date(`${from}T12:00:00Z`); day.toISOString().slice(0,10) <= to;) {
    const end = new Date(day); end.setUTCDate(end.getUTCDate() + 6);
    const inicio = day.toISOString().slice(0,10), fim = end.toISOString().slice(0,10) > to ? to : end.toISOString().slice(0,10);
    const url = new URL("https://api.feegow.com/v1/api/financial/list-invoice");
    url.searchParams.set("data_start", inicio.split("-").reverse().join("-"));
    url.searchParams.set("data_end", fim.split("-").reverse().join("-"));
    url.searchParams.set("tipo_transacao", "C");
    const res = await fetch(url, { headers: { "x-access-token": token }, signal: AbortSignal.timeout(45000) });
    if (!res.ok) throw new Error(`Feegow HTTP ${res.status}`);
    const body = await res.json() as any;
    if (body.success !== true) throw new Error("Feegow não confirmou a consulta de contas a receber");
    const list = Array.isArray(body.content) ? body.content : body.content?.list;
    if (!Array.isArray(list)) throw new Error("Resposta de contas a receber sem lista de faturas");
    invoices += list.length;
    const parsed = recebimentosBaixados(list);
    if (parsed.invalidos) throw new Error(`${parsed.invalidos} baixas inválidas: carga interrompida para conferência`);
    for (const row of parsed.rows) rows.set(row.pagamento_id, row);
    day = new Date(`${fim}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + 1);
  }
  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await supabaseAdmin.from("financeiro_recebimentos_baixados").upsert(all.slice(i,i+500) as any, { onConflict: "pagamento_id" });
    if (error) throw new Error(error.message);
  }
  return { invoices, pagamentos: all.length, valor: all.reduce((s,r) => s + r.valor,0), origem: "financial/list-invoice?tipo_transacao=C → pagamentos.valor / 100; pagamentos.data; único por pagamento_id" };
}