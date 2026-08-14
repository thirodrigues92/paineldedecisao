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

    // Convênios — a Feegow expõe esse catálogo em caminhos diferentes conforme a conta.
    // Tenta em cascata e registra em sync_logs qual respondeu (ou todos os erros).
    {
      const candidatos = [
        "/insurance/list",
        "/insurance/list-insurance",
        "/insurance/list-insurance-plans",
        "/insurance/search",
      ];
      const convId = await logStart(supabase, "convenios");
      const falhas: string[] = [];
      let gravados = 0;
      let usado = "";
      for (const path of candidatos) {
        try {
          const rows = await feegow(path);
          const mapped = asArray(rows).map((r: any) => ({
            convenio_id: Number(r.id ?? r.insurance_id ?? r.convenio_id),
            nome: String(r.name ?? r.nome ?? r.insurance_name ?? r.descricao ?? "").trim() || `Convênio ${r.id}`,
            planos: r.plans ?? r.planos ?? [],
          })).filter((r: any) => Number.isFinite(r.convenio_id) && r.convenio_id > 0);
          const seenConv = new Set<number>();
          const uniq = mapped.filter((r: any) => !seenConv.has(r.convenio_id) && seenConv.add(r.convenio_id));
          if (!uniq.length) { falhas.push(`${path}: 0 registros`); continue; }
          const { error } = await supabase.from("convenios").upsert(uniq, { onConflict: "convenio_id" });
          if (error) { falhas.push(`${path}: ${error.message}`); continue; }
          gravados = uniq.length;
          usado = path;
          total += gravados;
          break;
        } catch (e) {
          falhas.push(`${path}: ${String(e).slice(0, 200)}`);
        }
      }
      // Fallback: garante que todo convenio_id visto na agenda exista no catálogo,
      // para os filtros e gráficos não ficarem sem rótulo.
      try {
        const agendaConv = await selectAllColumn(
          supabase, "agendamentos", "convenio_id", (q: any) => q.not("convenio_id", "is", null),
        );
        const { data: existentes } = await supabase.from("convenios").select("convenio_id");
        const jaTem = new Set((existentes ?? []).map((r: any) => Number(r.convenio_id)));
        const faltando = [...new Set(agendaConv.map((r: any) => Number(r.convenio_id)))]
          .filter((cid) => Number.isFinite(cid) && cid > 0 && !jaTem.has(cid))
          .map((cid) => ({ convenio_id: cid, nome: `Convênio ${cid}`, planos: [] }));
        if (faltando.length) {
          await supabase.from("convenios").upsert(faltando, { onConflict: "convenio_id" });
          gravados += faltando.length;
        }
      } catch (e) {
        falhas.push(`fallback agenda: ${String(e).slice(0, 200)}`);
      }
      await logEnd(
        supabase, convId, gravados > 0, gravados,
        gravados > 0 && !falhas.length ? undefined : `usado=${usado || "nenhum"} | ${falhas.join(" | ")}`,
      );
    }


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

      if (uniqueProc.length) {
        const { error } = await supabase.from("procedimentos").upsert(uniqueProc, { onConflict: "procedimento_id" });
        if (error) throw new Error(`procedimentos upsert: ${error.message}`);
        total += uniqueProc.length;
      }

    } catch (e) { console.warn("procedimentos", e); }

    await logEnd(supabase, id, true, total);
  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

// ===== Tabela de preços de referência =====
// /procedures/list devolve { procedimento_id, valor } com valor em CENTAVOS.
// ATENÇÃO: a API IGNORA tabela_id/convenio_id — sempre devolve a MESMA tabela (particular).
// Por isso esse preço nunca entra em valor_total; serve só como ESTIMATIVA (valor_estimado)
// para os atendimentos de convênio, em que a Feegow não devolve preço nenhum.
let precoRefCache: Map<number, number> | null = null;

async function getTabelaPrecos(): Promise<Map<number, number>> {
  if (precoRefCache) return precoRefCache;
  const map = new Map<number, number>();
  try {
    const rows = asArray(await feegow("/procedures/list"));
    for (const r of rows) {
      const pid = Number(r.procedimento_id ?? r.id);
      const bruto = r.valor ?? r.value;
      if (!Number.isFinite(pid) || bruto == null) continue;
      // Inteiro sem separador → centavos. Com "R$"/vírgula → parseCurrency.
      const v = typeof bruto === "number" || /^-?\d+$/.test(String(bruto).trim())
        ? Number(bruto) / 100
        : parseCurrency(bruto);
      if (Number.isFinite(v)) map.set(pid, v);
    }
  } catch (e) {
    console.warn("tabela de preços de referência", e);
  }
  precoRefCache = map;
  return map;
}

/**
 * Valor do agendamento.
 * valor    = somente o que a Feegow informou (soma dos procedimentos ou total do topo).
 * estimado = referência da tabela particular para os itens sem preço (não entra na receita).
 */
async function calcularValorAgendamento(r: any): Promise<{
  valor: number; estimado: number; origem: string; qtd: number; detalhe: Array<Record<string, unknown>>;
}> {
  const procs = asArray(r.procedimentos ?? r.procedures ?? r.itens ?? r.items ?? []);
  const detalhe: Array<Record<string, unknown>> = [];
  const topo = parseCurrency(r.valor_total_agendamento ?? r.valor_total ?? r.total_value ?? 0);
  let soma = 0;
  let estimado = 0;
  let semPreco = 0;

  for (const p of procs) {
    const pid = Number(p.procedimentoID ?? p.procedimento_id ?? p.id ?? 0) || null;
    const bruto = p.valor ?? p.value;
    const v = bruto == null ? 0 : parseCurrency(bruto);
    let ref = v;
    let origem = "feegow";
    if (v === 0) {
      semPreco += 1;
      origem = "sem_valor";
      ref = pid ? ((await getTabelaPrecos()).get(pid) ?? 0) : 0;
    }
    soma += v;
    estimado += ref;
    detalhe.push({ procedimento_id: pid, valor: v, valor_referencia: ref, origem });
  }

  if (!procs.length) {
    const t = topo || parseCurrency(r.valor ?? 0);
    return { valor: t, estimado: t, origem: t > 0 ? "feegow_topo" : "sem_valor", qtd: 0, detalhe: [] };
  }

  if (soma === 0 && topo > 0) {
    return { valor: topo, estimado: Math.max(topo, estimado), origem: "feegow_topo", qtd: procs.length, detalhe };
  }

  const origem = soma === 0 ? "sem_valor" : (semPreco > 0 ? "parcial" : "feegow");
  return { valor: soma, estimado: Math.max(soma, estimado), origem, qtd: procs.length, detalhe };
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
      const mapped: any[] = [];
      for (const r of rows as any[]) {
        const v = await calcularValorAgendamento(r);
        mapped.push({
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
          tabela_id: r.tabela_id ? Number(r.tabela_id) : null,
          valor_total: v.valor,
          valor_estimado: v.estimado,

          valor_origem: v.origem,
          qtd_procedimentos: v.qtd,
          procedimentos_detalhe: v.detalhe,
          telemedicina: Boolean(r.telemedicina),
          encaixe: Boolean(r.encaixe),
          retorno: Boolean(r.retorno),
          primeiro_agendamento: Boolean(r.primeiro_agendamento ?? r.first_time),
          agendado_em: r.agendado_em ?? null,
          agendado_por: r.agendado_por ?? null,
          notas: r.notas ?? r.observacoes ?? null,
          // Duração: Feegow devolve 0 na maioria dos slots → cai no default de 30 min.
          duracao_min: (() => { const d = Number(r.duracao ?? r.duration ?? 0); return d > 0 ? d : 30; })(),
        });
      }
      {
        const validos = mapped.filter((r: any) => r.agendamento_id && r.data);
        mapped.length = 0; mapped.push(...validos);
      }

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

/** POST em endpoints "core" do Feegow (paginação {data,count,pages}) */
async function feegowCore(path: string, body: Record<string, unknown>): Promise<any[]> {
  const res = await withRetry(() =>
    fetch(FEEGOW_BASE + path, {
      method: "POST",
      headers: { "x-access-token": FEEGOW_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  if (!res.ok) throw new Error(`Feegow ${path} → HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

/** Plano de contas (categoria_id → nome) e centros de custo (centro_custo_id → nome) */
async function loadFinancialLookups() {
  const categorias = new Map<number, string>();
  const centros = new Map<number, string>();
  try {
    const rows = await feegowCore("/core/financial/base/financial-category", { page: 1, perPage: 1000 });
    for (const r of rows) {
      const cid = Number(r.id);
      if (Number.isFinite(cid) && r.name) categorias.set(cid, String(r.name).trim());
    }
    console.log(`[SYNC] categorias financeiras: ${categorias.size}`);
  } catch (e) { console.warn("financial-category", e); }
  try {
    const rows = await feegowCore("/core/financial/base/cost-center", { page: 1, perPage: 500 });
    for (const r of rows) {
      const cid = Number(r.id);
      if (Number.isFinite(cid) && r.name) centros.set(cid, String(r.name).trim());
    }
    console.log(`[SYNC] centros de custo: ${centros.size}`);
  } catch (e) { console.warn("cost-center", e); }
  return { categorias, centros };
}

/**
 * A Feegow espalha o convênio em nomes/níveis diferentes conforme o tipo de fatura.
 * Varre todos os candidatos e devolve o primeiro id válido (>0). Particular = null.
 */
function pickConvenioId(...sources: any[]): number | null {
  const chaves = [
    "convenio_id", "insurance_id", "convenioId", "id_convenio",
    "plano_convenio_id", "health_plan_id", "payer_id",
  ];
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    for (const k of chaves) {
      const v = Number(src[k]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    for (const nested of ["convenio", "insurance", "payer", "plano"]) {
      const obj = src[nested];
      if (obj && typeof obj === "object") {
        const v = Number(obj.id ?? obj.convenio_id ?? obj.insurance_id);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
  }
  return null;
}

/**
 * A fatura da Feegow não traz convênio em nenhum nível, mas os itens trazem
 * agendamento_id. Usamos esse vínculo real para herdar convênio, unidade e
 * procedimento do atendimento que originou a receita.
 * Retorna quantos lançamentos foram enriquecidos e quantos ficaram sem vínculo.
 */
async function enriquecerPelaAgenda(supabase: any, rows: any[]) {
  const agenda = await selectAllColumn(
    supabase, "agendamentos", "agendamento_id, convenio_id, unidade_id, procedimento_id",
  );
  const porId = new Map<number, any>();
  for (const a of agenda) porId.set(Number(a.agendamento_id), a);

  let comVinculo = 0, semVinculo = 0, convenioAplicado = 0;
  for (const r of rows) {
    if (r.tipo !== "receita") continue;
    const a = r.agendamento_id ? porId.get(Number(r.agendamento_id)) : null;
    if (!a) { semVinculo++; continue; }
    comVinculo++;
    if (r.convenio_id == null && a.convenio_id != null) { r.convenio_id = Number(a.convenio_id); convenioAplicado++; }
    if (r.unidade_id == null && a.unidade_id != null) r.unidade_id = Number(a.unidade_id);
    if (r.procedimento_id == null && a.procedimento_id != null) r.procedimento_id = Number(a.procedimento_id);
  }
  console.log(`[SYNC] receitas com agendamento=${comVinculo} sem=${semVinculo} convenio herdado=${convenioAplicado}`);
  return { comVinculo, semVinculo, convenioAplicado };
}

/** Normaliza nome de convênio para comparação (sem acento, sem espaço, minúsculo). */
function normNome(s: string) {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A Feegow grava o nome do convênio na CATEGORIA do lançamento
 * (ex.: "Medprev", "Iparv", "Cassi"). Casa esse texto com o catálogo de convênios.
 */
async function mapearConvenioPorCategoria(supabase: any, rows: any[]) {
  const { data: convs } = await supabase.from("convenios").select("convenio_id, nome");
  if (!convs?.length) return 0;
  const catalogo = convs.map((c: any) => ({ id: Number(c.convenio_id), n: normNome(c.nome) }))
    .filter((c: any) => c.n.length >= 3);
  let aplicados = 0;
  for (const r of rows) {
    if (r.tipo !== "receita" || r.convenio_id != null) continue;
    const alvo = normNome(r.categoria);
    if (alvo.length < 3) continue;
    const hit = catalogo.find((c: any) => c.n === alvo)
      ?? catalogo.find((c: any) => c.n.includes(alvo) || alvo.includes(c.n));
    if (hit) { r.convenio_id = hit.id; aplicados++; }
  }
  console.log(`[SYNC] convenio pela categoria: ${aplicados}`);
  return aplicados;
}



/**
 * Contas a receber / faturamento em lote de convênio. Os caminhos variam por conta:
 * tenta em cascata e devolve as linhas do primeiro que responder, além do diagnóstico.
 */
async function fetchRecebiveis(from: Date, to: Date) {
  const candidatos: Array<[string, Record<string, string>]> = [
    ["/financial/list-account-receivable", { data_start: toFeegowDate(from), data_end: toFeegowDate(to) }],
    ["/financial/list-receivable", { data_start: toFeegowDate(from), data_end: toFeegowDate(to) }],
    ["/financial/list-billing", { data_start: toFeegowDate(from), data_end: toFeegowDate(to) }],
    ["/financial/list-batch", { data_start: toFeegowDate(from), data_end: toFeegowDate(to) }],
  ];
  const diagnostico: string[] = [];
  for (const [path, params] of candidatos) {
    try {
      const content = await feegow(path, params);
      const rows = asArray(content);
      diagnostico.push(`${path}: ${rows.length} registros`);
      if (rows.length) return { path, rows, diagnostico };
    } catch (e) {
      diagnostico.push(`${path}: ${String(e).slice(0, 160)}`);
    }
  }
  return { path: "", rows: [] as any[], diagnostico };
}

async function syncFinancial(supabase: any, from: Date, to: Date) {

  const id = await logStart(supabase, `financeiro ${toFeegowDate(from)}→${toFeegowDate(to)}`);
  let total = 0;
  const errors: string[] = [];
  let diagnosticoReceb = "";

  try {
    const { categorias, centros } = await loadFinancialLookups();
    const mapped: any[] = [];
    for (const tipoTransacao of ["C", "D"] as const) {
      const content = await feegow("/financial/list-invoice", {
        data_start: toFeegowDate(from),
        data_end: toFeegowDate(to),
        tipo_transacao: tipoTransacao,
      });
      const invoices = asArray(content);
      invoices.forEach((invoice: any, invoiceIndex: number) => {
        const detalhes = asArray(invoice.detalhes ?? invoice.details ?? invoice);
        const pagamentos = asArray(invoice.pagamentos ?? invoice.payments ?? []);
        const itens = asArray(invoice.itens ?? invoice.items ?? []);
        // A categoria/centro de custo vive nos itens da fatura, não em detalhes.
        const itemComCategoria = itens.find((i: any) => Number(i?.categoria_id) > 0) ?? itens[0] ?? {};
        const categoriaId = Number(itemComCategoria.categoria_id ?? 0);
        const centroId = Number(itemComCategoria.centro_custo_id ?? 0);
        const categoriaNome =
          categorias.get(categoriaId) ??
          (categoriaId > 0 ? `Categoria ${categoriaId}` : null) ??
          (String(itemComCategoria.descricao ?? "").trim() || null) ??
          "Não classificado";
        const centroNome = centros.get(centroId) ?? (centroId > 0 ? `Centro ${centroId}` : null);
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
          // Item da fatura correspondente (quando houver 1:1 com os detalhes)
          const item = itens[detailIndex] ?? (itens.length === 1 ? itens[0] : undefined) ?? itemComCategoria ?? {};
          // ATENÇÃO: item_id é o id da linha da fatura, NÃO o procedimento — não usar como fallback.
          const procId = Number(
            det.procedimento_id ?? det.procedure_id ?? item?.procedimento_id ?? item?.procedure_id ?? 0,
          );
          const agendaId = Number(item?.agendamento_id ?? det.agendamento_id ?? 0);
          const descricaoItem =
            String(item?.descricao ?? item?.description ?? item?.nome ?? det.descricao ?? det.historico ?? "").trim() || null;
          mapped.push({
            id: makeFinancialId(tipoTransacao, movementId || invoiceId, invoiceIndex * 1000 + detailIndex),
            tipo: tipoTransacao === "C" ? "receita" : "despesa",
            categoria: categoriaNome,
            centro_custo: centroNome,
            unidade_id: Number(det.unidade_id ?? invoice.unidade_id ?? 0) > 0 ? Number(det.unidade_id ?? invoice.unidade_id) : null,
            convenio_id: pickConvenioId(det, item, invoice, itemComCategoria),
            agendamento_id: Number.isFinite(agendaId) && agendaId > 0 ? agendaId : null,
            procedimento_id: Number.isFinite(procId) && procId > 0 ? procId : null,
            descricao_item: descricaoItem,
            valor,
            data_vencimento: dataVencimento,
            data_pagamento: dataPagamento,
            status: financialStatus(valor, pagamentos, det),
          });

        });

      });
    }

    // Contas a receber / faturamento em lote de convênio (fora do caixa de /list-invoice)
    const receb = await fetchRecebiveis(from, to);
    console.log(`[SYNC] recebíveis: ${receb.diagnostico.join(" | ")}`);
    if (receb.rows.length) {
      receb.rows.forEach((r: any, i: number) => {
        const valor = parseFinancialCurrency(r.valor ?? r.value ?? r.valor_total);
        const dataVencimento = parseFeegowDate(r.data_vencimento ?? r.vencimento ?? r.data);
        if (!valor || !dataVencimento) return;
        const srcId = Number(r.id ?? r.receivable_id ?? r.invoice_id ?? 0);
        mapped.push({
          id: 3 * 1_000_000_000_000 + (srcId > 0 ? srcId : i + 1),
          tipo: "receita",
          categoria: String(r.categoria ?? r.category ?? "").trim() || "Faturamento convênio",
          centro_custo: null,
          unidade_id: Number(r.unidade_id) > 0 ? Number(r.unidade_id) : null,
          convenio_id: pickConvenioId(r),
          procedimento_id: Number(r.procedimento_id) > 0 ? Number(r.procedimento_id) : null,
          descricao_item: String(r.descricao ?? r.description ?? r.historico ?? "").trim() || null,
          valor,
          data_vencimento: dataVencimento,
          data_pagamento: parseFeegowDate(r.data_pagamento ?? r.pagamento),
          status: financialStatus(valor, asArray(r.pagamentos ?? r.payments ?? []), r),
        });
      });
    } else {
      diagnosticoReceb = `recebíveis indisponíveis → ${receb.diagnostico.join(" | ")}`;
    }

    // Convênio ausente na fatura → herda do agendamento vinculado ao item
    let vinculo = { comVinculo: 0, semVinculo: 0, convenioAplicado: 0 };
    try {
      vinculo = await enriquecerPelaAgenda(supabase, mapped);
    } catch (e) {
      console.warn("enriquecer pela agenda", String(e).slice(0, 200));
    }
    let porCategoria = 0;
    try {
      porCategoria = await mapearConvenioPorCategoria(supabase, mapped);
    } catch (e) {
      console.warn("convenio por categoria", String(e).slice(0, 200));
    }
    diagnosticoReceb = [
      diagnosticoReceb,
      `vinculo agenda: ${vinculo.comVinculo} com / ${vinculo.semVinculo} sem, convênio herdado ${vinculo.convenioAplicado}, por categoria ${porCategoria}`,
    ].filter(Boolean).join(" || ");




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

    if (errors.length) await logEnd(supabase, id, false, total, `Upsert errors: ${errors.slice(0, 3).join(" | ")} ${diagnosticoReceb}`);
    else await logEnd(supabase, id, true, total, diagnosticoReceb || undefined);

  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

// ============ PACIENTES (geo) ============

/** Lê todas as páginas de uma coluna (PostgREST limita a 1000 linhas). */
async function selectAllColumn(supabase: any, table: string, columns: string, apply?: (q: any) => any, cap = 40_000) {
  const out: any[] = [];
  for (let from = 0; from < cap; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Normaliza texto livre (bairro/cidade) para Title Case, evitando duplicatas por caixa. */
const cleanText = (v: unknown) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const minor = new Set(["de", "da", "do", "das", "dos", "e"]);
  return s.toLocaleLowerCase("pt-BR").split(" ").map((w, i) => {
    if (i > 0 && minor.has(w)) return w;
    return w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1);
  }).join(" ");
};


/**
 * Sincroniza pacientes que aparecem na agenda, buscando o detalhe (/patient/search),
 * que é o único endpoint com nome/CEP/cidade/estado. Gravamos nome + campos agregáveis
 * (sexo, ano de nascimento, CEP, bairro, cidade, estado, convênio) — nunca CPF/telefone.
 * Processa em lotes para caber no tempo da função; devolve quantos ainda faltam.
 */
async function syncPacientes(supabase: any, limit: number, recarregar = false) {
  const id = await logStart(supabase, `pacientes (lote ${limit})`);
  let total = 0;
  try {
    const [existentes, agenda] = await Promise.all([
      selectAllColumn(supabase, "pacientes", "paciente_id, nome, celular, contato_sincronizado_em"),
      selectAllColumn(supabase, "agendamentos", "paciente_id", (q: any) => q.not("paciente_id", "is", null)),
    ]);
    // Resolvido = já tem nome e já passou pela busca de contato (celular pode ser vazio de verdade).
    const resolvido = (r: any) =>
      Boolean(cleanText(r.nome)) && (recarregar ? Boolean(r.contato_sincronizado_em) : true);
    const jaTem = new Set(
      existentes.filter(resolvido).map((r: any) => Number(r.paciente_id)),
    );
    const faltando = existentes
      .filter((r: any) => !resolvido(r))
      .map((r: any) => Number(r.paciente_id))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    const pendentesSet = new Set<number>(faltando);
    for (const r of agenda) {
      const pid = Number(r.paciente_id);
      if (Number.isFinite(pid) && pid > 0 && !jaTem.has(pid)) pendentesSet.add(pid);
    }


    const pendentes = [...pendentesSet];
    const lote = pendentes.slice(0, limit);
    console.log(`[SYNC] pacientes pendentes=${pendentes.length} lote=${lote.length}`);

    const mapped: any[] = [];
    const CONCURRENCY = 8;
    for (let i = 0; i < lote.length; i += CONCURRENCY) {
      const slice = lote.slice(i, i + CONCURRENCY);
      const results = await Promise.all(slice.map(async (pid) => {
        try {
          const c = await feegow("/patient/search", { paciente_id: String(pid) });
          const p: any = Array.isArray(c) ? c[0] : c;
          if (!p) return null;
          const nasc = parseFeegowDate(p.nascimento ?? p.birthDate);
          const ano = nasc ? Number(nasc.slice(0, 4)) : null;
          const cep = String(p.cep ?? "").replace(/\D/g, "");
          const sexoRaw = String(p.sexo ?? "").toLowerCase();
          // celulares/telefones vêm como array com DDD solto e números incompletos.
          const fones = [...asArray(p.celulares), ...asArray(p.telefones)]
            .map((t: unknown) => String(t ?? "").replace(/\D/g, ""))
            .filter((t: string) => t.length >= 10);
          const celular = fones[0]
            ? fones[0].length === 11
              ? `(${fones[0].slice(0, 2)}) ${fones[0].slice(2, 7)}-${fones[0].slice(7)}`
              : `(${fones[0].slice(0, 2)}) ${fones[0].slice(2, 6)}-${fones[0].slice(6)}`
            : null;
          return {
            paciente_id: pid,
            nome: cleanText(p.nome ?? p.name ?? p.paciente ?? p.nome_completo ?? p.fullName),
            celular,
            contato_sincronizado_em: new Date().toISOString(),


            sexo: sexoRaw.startsWith("m") ? "M" : sexoRaw.startsWith("f") ? "F" : null,
            ano_nascimento: ano && ano > 1900 && ano <= new Date().getFullYear() ? ano : null,
            cep: cep.length === 8 ? cep : null,
            bairro: cleanText(p.bairro),
            cidade: cleanText(p.cidade),
            estado: String(p.estado ?? "").trim().toUpperCase() || null,
            convenio_id: Number(p.convenio_id) > 0 ? Number(p.convenio_id) : null,
            origem_id: Number(p.origem_id) > 0 ? Number(p.origem_id) : null,
            updated_at: new Date().toISOString(),
          };
        } catch (e) {
          console.warn(`paciente ${pid}`, String(e).slice(0, 120));
          return null;
        }
      }));
      mapped.push(...results.filter(Boolean));
    }

    for (let i = 0; i < mapped.length; i += 500) {
      const slice = mapped.slice(i, i + 500);
      const { error } = await supabase.from("pacientes").upsert(slice, { onConflict: "paciente_id" });
      if (error) throw new Error(`upsert pacientes: ${error.message}`);
      total += slice.length;
    }

    const restantes = Math.max(0, pendentes.length - lote.length);
    await logEnd(supabase, id, true, total);
    return { processados: total, restantes };
  } catch (e) {
    await logEnd(supabase, id, false, total, String(e));
    throw e;
  }
}

/** Geocodifica bairros (cache em geo_bairros) e propaga lat/lng para os pacientes. */
async function geocodeBairros(supabase: any, limit: number) {
  const id = await logStart(supabase, `geocode bairros (lote ${limit})`);
  let atualizados = 0;
  try {
    const semGeo = await selectAllColumn(
      supabase, "pacientes", "bairro, cidade, estado",
      (q: any) => q.is("latitude", null).not("bairro", "is", null).not("cidade", "is", null),
    );
    const keyOf = (b: string, c: string, e: string) => `${b}|${c}|${e ?? ""}`;
    const pendentes = new Map<string, { bairro: string; cidade: string; estado: string }>();
    for (const r of semGeo) {
      const bairro = cleanText(r.bairro), cidade = cleanText(r.cidade);
      if (!bairro || !cidade) continue;
      const estado = String(r.estado ?? "").trim().toUpperCase();
      pendentes.set(keyOf(bairro, cidade, estado), { bairro, cidade, estado });
    }

    const { data: cacheRows } = await supabase.from("geo_bairros").select("bairro, cidade, estado, latitude, longitude");
    const cache = new Map<string, { latitude: number | null; longitude: number | null }>();
    for (const r of cacheRows ?? []) cache.set(keyOf(r.bairro, r.cidade, r.estado ?? ""), r);

    let novos = 0;
    for (const [key, loc] of pendentes) {
      let geo = cache.get(key);
      if (!geo) {
        if (novos >= limit) break;
        novos++;
        const nominatim = async (q: string) => {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
            { headers: { "User-Agent": "painel-decisao-clinica/1.0" } },
          );
          const arr = await res.json();
          return Array.isArray(arr) && arr.length
            ? { latitude: Number(arr[0].lat), longitude: Number(arr[0].lon) }
            : null;
        };
        try {
          geo = await nominatim(`${loc.bairro}, ${loc.cidade}, ${loc.estado}, Brazil`)
            ?? { latitude: null, longitude: null };
          if (geo.latitude == null) {
            // Fallback: centro da cidade — melhor aproximação que descartar o paciente.
            await new Promise((r) => setTimeout(r, 1100));
            geo = await nominatim(`${loc.cidade}, ${loc.estado}, Brazil`) ?? { latitude: null, longitude: null };
          }
        } catch (e) {
          console.warn("nominatim", String(e).slice(0, 120));
          geo = { latitude: null, longitude: null };
        }
        await supabase.from("geo_bairros").upsert(
          { bairro: loc.bairro, cidade: loc.cidade, estado: loc.estado, ...geo, geocoded_at: new Date().toISOString() },
          { onConflict: "bairro,cidade,estado" },
        );
        cache.set(key, geo);
        await new Promise((r) => setTimeout(r, 1100)); // ToS Nominatim: 1 req/s

      }
      if (geo.latitude != null && geo.longitude != null) {
        let upd = supabase.from("pacientes")
          .update({ latitude: geo.latitude, longitude: geo.longitude })
          .is("latitude", null)
          .eq("bairro", loc.bairro)
          .eq("cidade", loc.cidade);
        if (loc.estado) upd = upd.eq("estado", loc.estado);
        const { error } = await upd;
        if (error) console.warn("update pacientes geo", error.message);
        else atualizados++;
      }
    }

    const restantes = Math.max(0, pendentes.size - [...pendentes.keys()].filter((k) => cache.has(k)).length);
    console.log(`[GEOCODE] bairros novos=${novos} aplicados=${atualizados} restantes=${restantes}`);
    await logEnd(supabase, id, true, atualizados);
    return { bairros_geocodificados: novos, restantes };
  } catch (e) {
    await logEnd(supabase, id, false, atualizados, String(e));
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
  let limit = Number(url.searchParams.get("limit") ?? 0) || 0;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.mode === "string") mode = body.mode;
      if (body && Number(body.limit) > 0) limit = Number(body.limit);
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

    let extra: Record<string, unknown> = {};
    if (mode === "pacientes") extra = { ...extra, pacientes: await syncPacientes(supabase, limit || 400) };
    if (mode === "probe") {
      // Diagnóstico bruto: descobre quais endpoints financeiros existem nesta conta Feegow.
      const to = new Date(); to.setDate(to.getDate() + 30);
      const fromD = new Date(); fromD.setDate(fromD.getDate() - 90);
      const ds = toFeegowDate(fromD), de = toFeegowDate(to);
      const gets: Array<[string, Record<string, string>]> = [
        ["/financial/list-account-receivable", { data_start: ds, data_end: de }],
        ["/financial/list-account-receivable", { data_inicio: ds, data_fim: de }],
        ["/financial/list-invoice", { data_start: ds, data_end: de, tipo_transacao: "C", status: "0" }],
        ["/financial/list-bank-account", {}],
        ["/financial/list-payment-method", {}],
        ["/insurance/list-tiss-batch", { data_start: ds, data_end: de }],
        ["/insurance/list-guides", { data_start: ds, data_end: de }],
      ];
      const posts: Array<[string, Record<string, unknown>]> = [
        ["/core/financial/base/account-receivable", { page: 1, perPage: 5 }],
        ["/core/financial/receivable", { page: 1, perPage: 5 }],
        ["/core/financial/movement", { page: 1, perPage: 5 }],
        ["/core/insurance/base/insurance", { page: 1, perPage: 5 }],
      ];
      const results: Record<string, string> = {};
      for (const [p, params] of gets) {
        try {
          const c = await feegow(p, params);
          const rows = asArray(c);
          results[`GET ${p} ${JSON.stringify(params)}`] = `${rows.length} registros | amostra: ${JSON.stringify(rows[0] ?? null).slice(0, 400)}`;
        } catch (e) { results[`GET ${p} ${JSON.stringify(params)}`] = String(e).slice(0, 200); }
      }
      for (const [p, body] of posts) {
        try {
          const rows = await feegowCore(p, body);
          results[`POST ${p}`] = `${rows.length} registros | amostra: ${JSON.stringify(rows[0] ?? null).slice(0, 400)}`;
        } catch (e) { results[`POST ${p}`] = String(e).slice(0, 200); }
      }
      extra = { ...extra, probe: results };
    }
    if (mode === "probe-paciente") {
      // Descobre campos crus do paciente (celular/origem) e catálogos de origem/local.
      const results: Record<string, unknown> = {};
      const { data: algum } = await supabase.from("pacientes").select("paciente_id").limit(1);
      const pid = Number(url.searchParams.get("paciente_id") ?? algum?.[0]?.paciente_id ?? 0);
      try {
        const c = await feegow("/patient/search", { paciente_id: String(pid) });
        const p: any = Array.isArray(c) ? c[0] : c;
        results["paciente_chaves"] = Object.keys(p ?? {});
        results["paciente_amostra"] = JSON.stringify(p ?? null).slice(0, 1500);
      } catch (e) { results["paciente"] = String(e).slice(0, 200); }
      for (const p of ["/patient/list-origin", "/patient/origin", "/patient/list-origins", "/company/list-locals", "/company/list-rooms", "/company/list-unity"]) {
        try {
          const rows = asArray(await feegow(p));
          results[`GET ${p}`] = `${rows.length} registros | ${JSON.stringify(rows[0] ?? null).slice(0, 300)}`;
        } catch (e) { results[`GET ${p}`] = String(e).slice(0, 160); }
      }
      extra = { ...extra, probe_paciente: results };
    }

    if (mode === "probe-invoice") {
      const to = new Date(); to.setDate(to.getDate() + 30);
      const fromD = new Date(); fromD.setDate(fromD.getDate() - 30);
      const c = await feegow("/financial/list-invoice", {
        data_start: toFeegowDate(fromD), data_end: toFeegowDate(to), tipo_transacao: "C",
      });
      const rows = asArray(c);
      extra = {
        ...extra,
        totalFaturas: rows.length,
        amostras: rows.slice(0, 2).map((r) => JSON.stringify(r).slice(0, 2500)),
        chaves: [...new Set(rows.flatMap((r: any) => Object.keys(r ?? {})))],
        chavesItens: [...new Set(rows.flatMap((r: any) => asArray(r.itens ?? r.items ?? []).flatMap((i: any) => Object.keys(i ?? {}))))],
        chavesDetalhes: [...new Set(rows.flatMap((r: any) => asArray(r.detalhes ?? r.details ?? []).flatMap((i: any) => Object.keys(i ?? {}))))],
      };

    }
    if (mode === "probe-appoint") {
      // Diagnóstico bruto dos agendamentos de um dia: mostra o JSON cru dos que vêm com valor 0.
      const dia = url.searchParams.get("data") ?? toFeegowDate(new Date());
      const rows = await feegowPaginated("/appoints/search", {
        data_start: dia, data_end: dia, list_procedures: "1",
      });
      const topo = (r: any) => parseCurrency(r.valor_total ?? r.valor_total_agendamento ?? r.total_value ?? r.valor ?? 0);
      const zerados = rows.filter((r: any) => topo(r) === 0);
      // Candidatos de total do dia, para conferir com o relatório da Feegow.
      let candPrincipal = 0;   // apenas r.valor (procedimento principal)
      let candReal = 0;        // soma dos procedimentos com preço informado
      let candEstimado = 0;    // idem, completando os sem preço pela tabela de referência
      let candTopo = 0;        // valor_total_agendamento
      for (const r of rows as any[]) {
        const v = await calcularValorAgendamento(r);
        candReal += v.valor;
        candEstimado += v.estimado;
        candTopo += parseCurrency(r.valor_total_agendamento ?? 0);
        candPrincipal += parseCurrency(r.valor ?? 0);
      }
      extra = {
        ...extra,
        dia,
        totalAgendamentos: rows.length,
        comValorTopo: rows.length - zerados.length,
        semValorTopo: zerados.length,
        candidatos: {
          somaProcedimentosInformados: candReal,
          somaComEstimativa: candEstimado,
          valorTotalAgendamento: candTopo,
          procedimentoPrincipal: candPrincipal,
        },

        chaves: [...new Set(rows.flatMap((r: any) => Object.keys(r ?? {})))],
        chavesProcedimentos: [...new Set(rows.flatMap((r: any) =>
          asArray(r.procedimentos ?? r.procedures ?? r.itens ?? r.items ?? []).flatMap((i: any) => Object.keys(i ?? {}))))],
        amostrasZeradas: zerados.slice(0, 1).map((r: any) => JSON.stringify(r).slice(0, 1200)),
      };
    }

    if (mode === "probe-tabelas") {
      // Compara o preço do mesmo procedimento em tabelas diferentes: o parâmetro é respeitado?
      const pid = Number(url.searchParams.get("procedimento") ?? 377);
      const out: Record<string, unknown> = {};
      for (const t of ["1", "2", "13", "14", "99"]) {
        try {
          const rows = asArray(await feegow("/procedures/list", { tabela_id: t }));
          const alvo = rows.find((r: any) => Number(r.procedimento_id ?? r.id) === pid);
          out[`tabela_id=${t}`] = { registros: rows.length, valorProcedimento: alvo?.valor ?? null };
        } catch (e) { out[`tabela_id=${t}`] = String(e).slice(0, 160); }
      }
      for (const params of [{ convenio_id: "2" }, { convenio_id: "2", tabela_id: "13" }, { plano_id: "0", convenio_id: "2" }]) {
        try {
          const rows = asArray(await feegow("/procedures/list", params as Record<string, string>));
          const alvo = rows.find((r: any) => Number(r.procedimento_id ?? r.id) === pid);
          out[JSON.stringify(params)] = { registros: rows.length, valorProcedimento: alvo?.valor ?? null };
        } catch (e) { out[JSON.stringify(params)] = String(e).slice(0, 160); }
      }
      extra = { ...extra, procedimento: pid, probeTabelas: out };
    }


    if (mode === "probe-precos") {
      // Diagnóstico bruto: procura tabelas de preço por procedimento/convênio.
      const gets: Array<[string, Record<string, string>]> = [
        ["/procedures/list-values", {}],
        ["/procedures/values", {}],
        ["/procedures/list-price", {}],
        ["/procedures/price-table", {}],
        ["/procedures/list", { tabela_id: "13" }],
        ["/procedures/list-procedure-value", { tabela_id: "13" }],
        ["/settings/list-price-table", {}],
        ["/company/list-price-table", {}],
        ["/insurance/list-price-table", {}],
        ["/insurance/list-plans", {}],
        ["/procedures/list-table", {}],
      ];
      const results: Record<string, string> = {};
      for (const [p, params] of gets) {
        try {
          const c = await feegow(p, params);
          const rows = asArray(c);
          results[`GET ${p} ${JSON.stringify(params)}`] = `${rows.length} registros | amostra: ${JSON.stringify(rows[0] ?? null).slice(0, 500)}`;
        } catch (e) { results[`GET ${p} ${JSON.stringify(params)}`] = String(e).slice(0, 180); }
      }
      extra = { ...extra, probePrecos: results };
    }


    if (mode === "geocode") extra = { ...extra, geocode: await geocodeBairros(supabase, limit || 30) };

    await refreshViews(supabase);

    return new Response(JSON.stringify({ ok: true, mode, ms: Date.now() - started, ...extra }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e), mode }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
