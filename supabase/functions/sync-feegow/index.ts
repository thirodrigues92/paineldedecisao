// Edge Function: sync-feegow
// Consome a API REST do Feegow Clinic e faz upsert no banco do Lovable Cloud.
// Token lido de FEEGOW_API_TOKEN (nunca aparece no frontend).
// Modos: ?mode=today | historical | support | financial | full

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FEEGOW_BASE = "https://api.feegow.com/v1/api";
const FEEGOW_TOKEN = Deno.env.get("FEEGOW_API_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ============ UTILITÁRIOS DE PARSING (seção 3.3 do brief) ============

/** Converte "DD-MM-YYYY" ou "YYYY-MM-DD" → Date ISO (YYYY-MM-DD) */
export function parseFeegowDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  // Já ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

/** Formata Date → "DD-MM-YYYY" para filtros do Feegow */
export function toFeegowDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/** Converte "R$ 1.234,56" / "1234.56" / number → number */
export function parseCurrency(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  // Se tem vírgula E ponto → ponto é milhar, vírgula é decimal
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  // Só vírgula → decimal
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseFinancialCurrency(v: unknown): number {
  const n = parseCurrency(v);
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) >= 1000) return n / 100;
  const s = String(v ?? "").trim();
  if (/^-?\d+$/.test(s) && Math.abs(n) >= 1000) return n / 100;
  return n;
}

function statusCategory(statusId: number, description: string) {
  const known: Record<number, string> = {
    1: "agendado",
    2: "em_atendimento",
    3: "realizado",
    4: "em_atendimento",
    5: "em_atendimento",
    6: "no_show",
    7: "agendado",
    11: "cancelado",
    15: "remarcado",
    16: "cancelado",
    101: "triagem",
    103: "triagem",
    105: "triagem",
  };
  if (known[statusId]) return known[statusId];
  const text = description.toLowerCase();
  if (text.includes("realiz") || text.includes("atendid") || text.includes("execut")) return "realizado";
  if (text.includes("no-show") || text.includes("no show") || text.includes("falt")) return "no_show";
  if (text.includes("cancel")) return "cancelado";
  if (text.includes("confirm") || text.includes("agend")) return "agendado";
  if (text.includes("triagem")) return "triagem";
  return "outro";
}

/** Retry com backoff exponencial (3 tentativas). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

// ============ HTTP client do Feegow ============

async function feegow(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(FEEGOW_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await withRetry(() =>
    fetch(url.toString(), { headers: { "x-access-token": FEEGOW_TOKEN } })
  );
  if (!res.ok) throw new Error(`Feegow ${path} → HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.success !== true) {
    throw new Error(`Feegow ${path} → success=false: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.content ?? [];
}

/** Normaliza content do Feegow em Array — endpoints diferentes retornam formatos distintos. */
function asArray(content: any): any[] {
  if (Array.isArray(content)) return content;
  if (!content || typeof content !== "object") return [];
  // Formatos comuns: { list: [...] }, { data: [...] }, { items: [...] }, { rows: [...] }
  for (const k of ["list", "data", "items", "rows", "units", "professionals", "specialties", "procedures", "insurances"]) {
    if (Array.isArray(content[k])) return content[k];
  }
  // Objeto único → envolve
  return [content];
}

/** Paginação start/offset até vazio (usada em /appoints/search com list_procedures=1) */
async function feegowPaginated(path: string, baseParams: Record<string, string>): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  const offset = 50;
  for (let i = 0; i < 400; i++) { // hard cap
    const page = await feegow(path, { ...baseParams, start: String(start), offset: String(offset) });
    const rows = Array.isArray(page) ? page : asArray(page?.appointments ?? page?.data ?? page);
    if (!rows.length) break;
    results.push(...rows);
    if (rows.length < offset) break;
    start += offset;
  }
  return results;
}

// ============ SYNC BLOCKS ============

async function logStart(supabase: any, endpoint: string) {
  const { data } = await supabase.from("sync_logs").insert({ endpoint }).select("id").single();
  return data?.id as number | undefined;
}
async function logEnd(supabase: any, id: number | undefined, sucesso: boolean, registros = 0, erro?: string) {
  if (!id) return;
  await supabase.from("sync_logs").update({
    finalizado_em: new Date().toISOString(), sucesso, registros, erro: erro?.slice(0, 2000)
  }).eq("id", id);
}

async function syncSupport(supabase: any) {
  const id = await logStart(supabase, "support");
  let total = 0;
  try {
    // Status
    try {
      const rows = await feegow("/appoints/status");
      const mapped = asArray(rows).map((r) => ({
        status_id: Number(r.id ?? r.status_id),
        descricao: String(r.description ?? r.nome ?? r.name ?? ""),
        categoria: "outro",
      })).filter((r) => r.status_id)
        .map((r) => ({ ...r, categoria: statusCategory(r.status_id, r.descricao) }));
      if (mapped.length) {
        await supabase.from("status_agendamento").upsert(mapped, { onConflict: "status_id", ignoreDuplicates: false });
        total += mapped.length;
      }
    } catch (e) { console.warn("status", e); }

    // Especialidades
    try {
      const rows = await feegow("/specialties/list");
      const mapped = asArray(rows).map((r) => ({
        especialidade_id: Number(r.id ?? r.especialidade_id),
        nome: String(r.name ?? r.nome ?? ""),
        codigo_tiss: r.tiss_code ?? r.codigo_tiss ?? null,
      })).filter((r) => r.especialidade_id);
      if (mapped.length) { await supabase.from("especialidades").upsert(mapped, { onConflict: "especialidade_id" }); total += mapped.length; }
    } catch (e) { console.warn("especialidades", e); }

    // Profissionais
    try {
      const rows = await feegow("/professional/list");
      console.log("DEBUG profissionais raw:", JSON.stringify(rows).slice(0, 500));
      const mapped = asArray(rows).map((r) => ({
        profissional_id: Number(r.id ?? r.professional_id ?? r.profissional_id),
        nome: String(r.name ?? r.nome ?? r.full_name ?? ""),
        especialidades: r.specialties ?? r.especialidades ?? [],
        ativo: r.active !== false && r.ativo !== false,
      })).filter((r) => r.profissional_id);
      if (mapped.length) { await supabase.from("profissionais").upsert(mapped, { onConflict: "profissional_id" }); total += mapped.length; }
    } catch (e) { console.warn("profissionais", e); }

    // Convênios
    try {
      const rows = await feegow("/insurance/list");
      const mapped = asArray(rows).map((r) => ({
        convenio_id: Number(r.id ?? r.insurance_id),
        nome: String(r.name ?? r.nome ?? ""),
        planos: r.plans ?? r.planos ?? [],
      })).filter((r) => r.convenio_id);
      if (mapped.length) { await supabase.from("convenios").upsert(mapped, { onConflict: "convenio_id" }); total += mapped.length; }
    } catch (e) { console.warn("convenios", e); }

    // Unidades — endpoint retorna { matriz: [...], unidades: [...] }
    try {
      const rows = await feegow("/company/list-unity");
      const combined: any[] = [];
      if (rows && typeof rows === "object" && !Array.isArray(rows)) {
        if (Array.isArray((rows as any).matriz)) combined.push(...(rows as any).matriz);
        if (Array.isArray((rows as any).unidades)) combined.push(...(rows as any).unidades);
      }
      const source = combined.length ? combined : asArray(rows);
      const mapped = source.map((r: any) => ({
        unidade_id: Number(r.unidade_id ?? r.id ?? r.unit_id),
        nome_fantasia: String(r.nome_fantasia ?? r.name ?? r.fantasy_name ?? r.fantasia ?? ""),
        cidade: r.cidade ?? r.city ?? null,
        estado: r.estado ?? r.state ?? null,
        bairro: r.bairro ?? r.neighborhood ?? null,
        cep: r.cep ?? r.zip ?? null,
      })).filter((r: any) => Number.isFinite(r.unidade_id) && r.nome_fantasia);
      // Dedupe por unidade_id
      const seen = new Set<number>();
      const unique = mapped.filter((r) => { if (seen.has(r.unidade_id)) return false; seen.add(r.unidade_id); return true; });
      if (unique.length) { await supabase.from("unidades").upsert(unique, { onConflict: "unidade_id" }); total += unique.length; }
    } catch (e) { console.warn("unidades", e); }

    // Procedimentos
    try {
      const rows = await feegow("/procedures/list");
      const mapped = asArray(rows).map((r) => ({
        procedimento_id: Number(r.procedimento_id ?? r.id ?? r.procedure_id),
        nome: String(r.nome ?? r.name ?? "").trim() || "Sem nome",
        tipo: r.tipo ?? r.type ?? (r.tipo_procedimento != null ? String(r.tipo_procedimento) : null),
        grupo: r.grupo ?? r.group ?? (r.grupo_procedimento != null ? String(r.grupo_procedimento) : null),
      })).filter((r) => Number.isFinite(r.procedimento_id) && r.procedimento_id > 0);
      // Dedupe por procedimento_id
      const seenProc = new Set<number>();
      const uniqueProc = mapped.filter((r) => { if (seenProc.has(r.procedimento_id)) return false; seenProc.add(r.procedimento_id); return true; });
      console.log(`[SYNC] procedimentos: ${uniqueProc.length} mapeados`);

      if (mapped.length) { await supabase.from("procedimentos").upsert(mapped, { onConflict: "procedimento_id" }); total += mapped.length; }
    } catch (e) { console.warn("procedimentos", e); }

    await logEnd(supabase, id, true, total);
  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

async function syncAgendamentos(supabase: any, from: Date, to: Date) {
  // Chunks de 30 dias
  const chunks: Array<[Date, Date]> = [];
  let cur = new Date(from);
  while (cur <= to) {
    const end = new Date(cur); end.setDate(end.getDate() + 30);
    chunks.push([new Date(cur), end > to ? to : end]);
    cur = new Date(end); cur.setDate(cur.getDate() + 1);
  }
  const id = await logStart(supabase, `agendamentos ${toFeegowDate(from)}→${toFeegowDate(to)}`);
  let total = 0;
  const errors: string[] = [];
  try {
    for (const [a, b] of chunks) {
      const rows = await feegowPaginated("/appoints/search", {
        data_start: toFeegowDate(a),
        data_end: toFeegowDate(b),
        list_procedures: "1",
      });
      if (!rows.length) continue;
      const mapped = rows.map((r: any) => ({
        agendamento_id: Number(r.agendamento_id ?? r.id),
        data: parseFeegowDate(r.data ?? r.date),
        horario: r.horario ?? r.time ?? null,
        paciente_id: r.paciente_id ? Number(r.paciente_id) : null,
        profissional_id: r.profissional_id ? Number(r.profissional_id) : null,
        especialidade_id: r.especialidade_id ? Number(r.especialidade_id) : null,
        procedimento_id: r.procedimento_id ? Number(r.procedimento_id) : null,
        status_id: r.status_id ? Number(r.status_id) : null,
        unidade_id: r.unidade_id ? Number(r.unidade_id) : null,
        local_id: r.local_id ? Number(r.local_id) : null,
        canal_id: r.canal_id ? Number(r.canal_id) : null,
        convenio_id: r.convenio_id ? Number(r.convenio_id) : null,
        plano_id: r.plano_id ? Number(r.plano_id) : null,
        valor_total: parseCurrency(r.valor_total ?? r.valor_total_agendamento ?? r.total_value ?? r.valor ?? 0),
        telemedicina: Boolean(r.telemedicina),
        encaixe: Boolean(r.encaixe),
        retorno: Boolean(r.retorno),
        primeiro_agendamento: Boolean(r.primeiro_agendamento ?? r.first_time),
        agendado_em: r.agendado_em ?? null,
        agendado_por: r.agendado_por ?? null,
        notas: r.notas ?? r.observacoes ?? null,
        // Duração: Feegow devolve 0 na maioria dos slots → cai no default de 30 min.
        duracao_min: (() => { const d = Number(r.duracao ?? r.duration ?? 0); return d > 0 ? d : 30; })(),
      })).filter((r: any) => r.agendamento_id && r.data);
      // Dedupe por agendamento_id (evita "ON CONFLICT ... cannot affect row a second time")
      const seen = new Set<number>();
      const unique = mapped.filter((r: any) => {
        if (seen.has(r.agendamento_id)) return false;
        seen.add(r.agendamento_id); return true;
      });
      mapped.length = 0; mapped.push(...unique);
      // Batch upsert em chunks de 500 — checando erros
      for (let i = 0; i < mapped.length; i += 500) {
        const slice = mapped.slice(i, i + 500);
        const { error, count } = await supabase
          .from("agendamentos")
          .upsert(slice, { onConflict: "agendamento_id", count: "exact" });
        if (error) {
          console.error(`upsert agendamentos falhou (chunk ${i}):`, error.message);
          errors.push(error.message);
        } else {
          total += count ?? slice.length;
        }
      }
    }
    if (errors.length) {
      await logEnd(supabase, id, false, total, `Upsert errors: ${errors.slice(0, 3).join(" | ")}`);
    } else {
      await logEnd(supabase, id, true, total);
    }
  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

function makeFinancialId(tipoTransacao: "C" | "D", sourceId: number, fallbackIndex: number) {
  const prefix = tipoTransacao === "C" ? 1 : 2;
  const safeId = Number.isFinite(sourceId) && sourceId > 0 ? sourceId : fallbackIndex + 1;
  return prefix * 1_000_000_000_000 + safeId;
}

function financialStatus(valor: number, pagamentos: any[], fallback: any) {
  const explicit = String(fallback.status ?? fallback.situacao ?? "").toLowerCase();
  if (explicit.includes("pago") || explicit.includes("quit")) return "pago";
  if (explicit.includes("cancel")) return "cancelado";
  const pago = pagamentos.reduce((sum, p) => sum + parseCurrency(p.valor ?? p.value), 0);
  if (valor > 0 && pago >= valor) return "pago";
  if (pago > 0) return "parcial";
  return "em_aberto";
}

async function syncFinancial(supabase: any, from: Date, to: Date) {
  const id = await logStart(supabase, `financeiro ${toFeegowDate(from)}→${toFeegowDate(to)}`);
  let total = 0;
  const errors: string[] = [];
  try {
    const mapped: any[] = [];
    for (const tipoTransacao of ["C", "D"] as const) {
      const content = await feegow("/financial/list-invoice", {
        data_start: toFeegowDate(from),
        data_end: toFeegowDate(to),
        tipo_transacao: tipoTransacao,
      });
      const invoices = asArray(content);
      invoices.forEach((invoice: any, invoiceIndex: number) => {
        const detalhes = asArray(invoice.detalhes ?? invoice.details ?? invoice.itens ?? invoice.items ?? invoice);
        const pagamentos = asArray(invoice.pagamentos ?? invoice.payments ?? []);
        const base = detalhes.length ? detalhes : [invoice];
        base.forEach((det: any, detailIndex: number) => {
          const valor = parseFinancialCurrency(det.valor ?? det.value ?? invoice.valor ?? invoice.value);
          const movementId = Number(det.movement_id ?? det.movimentacao_id ?? det.id ?? det.invoice_id ?? invoice.invoice_id ?? invoice.id);
          const invoiceId = Number(det.invoice_id ?? invoice.invoice_id ?? invoice.id);
          const dataVencimento = parseFeegowDate(det.data_vencimento ?? det.vencimento ?? det.data ?? invoice.data_vencimento ?? invoice.vencimento ?? invoice.data);
          const dataPagamento = parseFeegowDate(
            det.data_pagamento ?? det.pagamento_em ?? pagamentos[0]?.data ?? pagamentos[0]?.data_pagamento ?? invoice.data_pagamento,
          );
          if (!valor || !dataVencimento) return;
          mapped.push({
            id: makeFinancialId(tipoTransacao, movementId || invoiceId, invoiceIndex * 1000 + detailIndex),
            tipo: tipoTransacao === "C" ? "receita" : "despesa",
            categoria: det.descricao ?? invoice.descricao ?? det.categoria ?? invoice.categoria ?? null,
            centro_custo: det.centro_custo ?? invoice.centro_custo ?? null,
            unidade_id: det.unidade_id || invoice.unidade_id ? Number(det.unidade_id ?? invoice.unidade_id) : null,
            convenio_id: det.convenio_id || invoice.convenio_id ? Number(det.convenio_id ?? invoice.convenio_id) : null,
            valor,
            data_vencimento: dataVencimento,
            data_pagamento: dataPagamento,
            status: financialStatus(valor, pagamentos, det),
          });
        });
      });
    }

    const seen = new Set<number>();
    const unique = mapped.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    for (let i = 0; i < unique.length; i += 500) {
      const slice = unique.slice(i, i + 500);
      const { error, count } = await supabase
        .from("financeiro_lancamentos")
        .upsert(slice, { onConflict: "id", count: "exact" });
      if (error) {
        console.error(`upsert financeiro falhou (chunk ${i}):`, error.message);
        errors.push(error.message);
      } else {
        total += count ?? slice.length;
      }
    }

    if (errors.length) await logEnd(supabase, id, false, total, `Upsert errors: ${errors.slice(0, 3).join(" | ")}`);
    else await logEnd(supabase, id, true, total);
  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

async function refreshViews(supabase: any) {
  try { await supabase.rpc("refresh_dashboard_views"); } catch (e) { console.warn("refresh", e); }
}

// ============ HANDLER ============

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!FEEGOW_TOKEN) {
    return new Response(JSON.stringify({ error: "FEEGOW_API_TOKEN não configurado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  // Aceita mode via query string (GET/cron) OU body JSON (POST via supabase.functions.invoke)
  let mode = url.searchParams.get("mode") ?? "today";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.mode === "string") mode = body.mode;
    } catch {
      // body vazio/não-JSON — mantém default
    }
  }
  console.log(`[sync-feegow] mode=${mode}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const started = Date.now();
  try {
    // Ordem correta: support (tabelas-pai) antes de agendamentos (FKs)
    if (mode === "support" || mode === "full") await syncSupport(supabase);

    if (mode === "historical" || mode === "full") {
      const to = new Date();
      const from = new Date(); from.setDate(from.getDate() - 90);
      await syncAgendamentos(supabase, from, to);
    }

    if (mode === "today" || mode === "full") {
      const now = new Date();
      const in7 = new Date(); in7.setDate(now.getDate() + 7);
      await syncAgendamentos(supabase, now, in7);
    }

    if (mode === "financial" || mode === "full") {
      const to = new Date(); to.setDate(to.getDate() + 30);
      const from = new Date(); from.setDate(from.getDate() - 90);
      await syncFinancial(supabase, from, to);
    }

    await refreshViews(supabase);

    return new Response(JSON.stringify({ ok: true, mode, ms: Date.now() - started }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e), mode }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
