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

/** Paginação start/offset até vazio (usada em /appoints/search com list_procedures=1) */
async function feegowPaginated(path: string, baseParams: Record<string, string>): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  const offset = 50;
  for (let i = 0; i < 200; i++) { // hard cap 10k reg/janela
    const page = await feegow(path, { ...baseParams, start: String(start), offset: String(offset) });
    const rows = Array.isArray(page) ? page : (page?.appointments ?? page?.data ?? []);
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
      const mapped = (rows as any[]).map((r) => ({
        status_id: Number(r.id ?? r.status_id),
        descricao: String(r.description ?? r.nome ?? r.name ?? ""),
        categoria: "outro",
      })).filter((r) => r.status_id);
      if (mapped.length) {
        await supabase.from("status_agendamento").upsert(mapped, { onConflict: "status_id", ignoreDuplicates: false });
        total += mapped.length;
      }
    } catch (e) { console.warn("status", e); }

    // Especialidades
    try {
      const rows = await feegow("/specialties/list");
      const mapped = (rows as any[]).map((r) => ({
        especialidade_id: Number(r.id ?? r.especialidade_id),
        nome: String(r.name ?? r.nome ?? ""),
        codigo_tiss: r.tiss_code ?? r.codigo_tiss ?? null,
      })).filter((r) => r.especialidade_id);
      if (mapped.length) { await supabase.from("especialidades").upsert(mapped, { onConflict: "especialidade_id" }); total += mapped.length; }
    } catch (e) { console.warn("especialidades", e); }

    // Profissionais
    try {
      const rows = await feegow("/professional/list");
      const mapped = (rows as any[]).map((r) => ({
        profissional_id: Number(r.id ?? r.professional_id),
        nome: String(r.name ?? r.nome ?? ""),
        especialidades: r.specialties ?? r.especialidades ?? [],
        ativo: r.active !== false,
      })).filter((r) => r.profissional_id);
      if (mapped.length) { await supabase.from("profissionais").upsert(mapped, { onConflict: "profissional_id" }); total += mapped.length; }
    } catch (e) { console.warn("profissionais", e); }

    // Convênios
    try {
      const rows = await feegow("/insurance/list");
      const mapped = (rows as any[]).map((r) => ({
        convenio_id: Number(r.id ?? r.insurance_id),
        nome: String(r.name ?? r.nome ?? ""),
        planos: r.plans ?? r.planos ?? [],
      })).filter((r) => r.convenio_id);
      if (mapped.length) { await supabase.from("convenios").upsert(mapped, { onConflict: "convenio_id" }); total += mapped.length; }
    } catch (e) { console.warn("convenios", e); }

    // Unidades
    try {
      const rows = await feegow("/company/list-unity");
      const mapped = (rows as any[]).map((r) => ({
        unidade_id: Number(r.id ?? r.unit_id),
        nome_fantasia: String(r.name ?? r.fantasy_name ?? r.nome_fantasia ?? ""),
        cidade: r.city ?? r.cidade ?? null,
        estado: r.state ?? r.estado ?? null,
        bairro: r.neighborhood ?? r.bairro ?? null,
        cep: r.zip ?? r.cep ?? null,
      })).filter((r) => r.unidade_id);
      if (mapped.length) { await supabase.from("unidades").upsert(mapped, { onConflict: "unidade_id" }); total += mapped.length; }
    } catch (e) { console.warn("unidades", e); }

    // Procedimentos
    try {
      const rows = await feegow("/procedures/list");
      const mapped = (rows as any[]).map((r) => ({
        procedimento_id: Number(r.id ?? r.procedure_id),
        nome: String(r.name ?? r.nome ?? ""),
        tipo: r.type ?? r.tipo ?? null,
        grupo: r.group ?? r.grupo ?? null,
      })).filter((r) => r.procedimento_id);
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
        valor_total: parseCurrency(r.valor_total ?? r.total_value ?? 0),
        telemedicina: Boolean(r.telemedicina),
        encaixe: Boolean(r.encaixe),
        retorno: Boolean(r.retorno),
        primeiro_agendamento: Boolean(r.primeiro_agendamento ?? r.first_time),
        agendado_em: r.agendado_em ?? null,
        agendado_por: r.agendado_por ?? null,
        notas: r.notas ?? r.observacoes ?? null,
      })).filter((r: any) => r.agendamento_id && r.data);
      // Batch upsert em chunks de 500
      for (let i = 0; i < mapped.length; i += 500) {
        await supabase.from("agendamentos").upsert(mapped.slice(i, i + 500), { onConflict: "agendamento_id" });
      }
      total += mapped.length;
    }
    await logEnd(supabase, id, true, total);
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
  const mode = url.searchParams.get("mode") ?? "today";
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const started = Date.now();
  try {
    if (mode === "support" || mode === "full") await syncSupport(supabase);

    if (mode === "today" || mode === "full") {
      const now = new Date();
      const in7 = new Date(); in7.setDate(now.getDate() + 7);
      await syncAgendamentos(supabase, now, in7);
    }

    if (mode === "historical" || mode === "full") {
      const to = new Date();
      const from = new Date(); from.setDate(from.getDate() - 90);
      await syncAgendamentos(supabase, from, to);
    }

    // financial: placeholder — endpoints financeiros do Feegow variam por conta;
    // deixamos preparado para implementação incremental sem quebrar a sync.

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
