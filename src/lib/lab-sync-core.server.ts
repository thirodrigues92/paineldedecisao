import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FEEGOW_BASE = "https://api.feegow.com/v1/api";
const FEEGOW_TOKEN = () => process.env['FEEGOW_API_TOKEN'] ?? "";

export const LEASE_MINUTES = 15;
export const MAX_ITENS_POR_EXECUCAO = 20000;
export const MAX_FALHAS_ANTES_DE_PAUSAR = 5;

function parseValorBR(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseValorAppoints(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const limpo = String(v).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(limpo) || 0;
}

function parseDataFeegow(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function toFeegowDate(iso: string, separator = "-"): string {
  const [y, m, d] = iso.split("-");
  return `${d}${separator}${m}${separator}${y}`;
}

function hashToBigInt(s: string): bigint {
  let h = 5381n;
  for (let i = 0; i < s.length; i++) h = ((h * 33n) + BigInt(s.charCodeAt(i))) & 0xFFFFFFFFFFFFn;
  return h;
}

function chunk<T>(arr: T[], n: number): T[][] {
  return arr.reduce<T[][]>((acc, v, i) => {
    if (i % n === 0) acc.push([]);
    acc[acc.length - 1]!.push(v);
    return acc;
  }, []);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  // Horário de Brasília (UTC-3)
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// --- PRODUÇÃO (reports/generate) ---

export async function syncProducaoRange(start: string, end: string) {
  const resumo = { total: 0, gravados: 0, erros: [] as string[] };
  const ds = toFeegowDate(start, "/");
  const de = toFeegowDate(end, "/");

  const res = await fetch(`${FEEGOW_BASE}/reports/generate`, {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN(), "Content-Type": "application/json" },
    body: JSON.stringify({
      report: "production",
      DATA_INICIO: ds,
      DATA_FIM: de,
      UNIDADE_IDS: [0],
      TIPO_DATA_PRODUCAO: ["EXECUCAO"],
      EXECUCAO_ITEM: ["S", "N"],
    }),
  });

  if (!res.ok) throw new Error(`Feegow HTTP ${res.status} em reports/generate (${ds} a ${de})`);
  const body = await res.json();
  if (!body?.success || !Array.isArray(body.data)) {
    throw new Error(`Feegow retornou resposta inválida: ${JSON.stringify(body).slice(0, 300)}`);
  }

  const rows: any[] = body.data;
  resumo.total = rows.length;
  if (rows.length > MAX_ITENS_POR_EXECUCAO) {
    throw new Error(`Janela grande demais (${rows.length} itens). Reduza o período.`);
  }

  const toBigInt = (val: any) => {
    if (val === undefined || val === null || val === "") return null;
    try { return BigInt(val); } catch { return null; }
  };

  const records = rows.map((r) => {
    const idTransacao = String(r.IDTransacao ?? "");
    const nGuia = String(r.NGuiaPrestador ?? "");
    const chave = `${idTransacao}|${nGuia}|${r.ProcedimentoID ?? ""}|${r.AgendamentoID ?? ""}`;
    const item: any = {
      feegow_id: hashToBigInt(chave),
      id_transacao: idTransacao,
      n_guia_prestador: nGuia,
      paciente_id: toBigInt(r.PacienteID),
      paciente_nome: r.NomePaciente || null,
      prontuario: r.Prontuario || r.ProntuarioPaciente || null,
      agendamento_id: toBigInt(r.AgendamentoID) ?? -1,
      data_execucao: parseDataFeegow(r.Data),
      hora_inicio: r.HoraInicio || r.Hora || null,
      profissional_id: toBigInt(r.ProfissionalID),
      profissional_nome: r.NomeProfissional || null,
      procedimento_id: toBigInt(r.ProcedimentoID) ?? -1,
      procedimento_nome: r.NomeProcedimento || null,
      valor: parseValorBR(r.Valor),
      valor_pago: parseValorBR(r.ValorPago),
      convenio_id: r.ConvenioID != null ? Number(r.ConvenioID) : null,
      convenio_nome: (r.ConvenioID && Number(r.ConvenioID) > 0)
        ? (r.NomeConvenio || null)
        : (r.TipoGuia === "Particular" ? "Particular" : (r.TipoGuia || null)),
      situacao: r.Situacao || null,
      situacao_conta: r.SituacaoConta || null,
      grupo_id: r.GrupoID != null ? Number(r.GrupoID) : null,
      grupo_nome: r.NomeGrupo || null,
      tipo_procedimento: r.TipoProcedimento || null,
      forma_pagamento: r.FormaPagamento || null,
      tipo_guia: r.TipoGuia || null,
      unidade_id: toBigInt(r.UnidadeID),
      payload_raw: r,
    };
    if (item.situacao === "Não Faturado" && item.valor === 0 && Number(r.ValorPlano) > 0) {
      item.valor = Number(r.ValorPlano);
    }
    return item;
  });

  for (const bloco of chunk(records, 50)) {
    const { error } = await supabaseAdmin
      .from("lab_producao_feegow")
      .upsert(bloco as any, { onConflict: "id_transacao,n_guia_prestador,procedimento_id,agendamento_id" });
    if (error) resumo.erros.push(error.message);
    else resumo.gravados += bloco.length;
  }

  return resumo;
}

// --- REDE DE SEGURANÇA (appoints/search) ---

export async function syncSafetyNetRange(start: string, end: string) {
  const resumo = { dias: 0, preenchidos: 0, erros: [] as string[] };
  for (let dia = start; dia <= end; dia = addDaysISO(dia, 1)) {
    resumo.dias++;
    try {
      const diaFeegow = toFeegowDate(dia, "-");
      const url = new URL(`${FEEGOW_BASE}/appoints/search`);
      url.searchParams.set("data_start", diaFeegow);
      url.searchParams.set("data_end", diaFeegow);
      const res = await fetch(url.toString(), { headers: { "x-access-token": FEEGOW_TOKEN() } });
      const body = await res.json();
      const agendamentos = body?.content?.appointments || body?.content || [];
      if (!Array.isArray(agendamentos) || agendamentos.length === 0) continue;

      const { data: existentes } = await supabaseAdmin
        .from("lab_producao_feegow")
        .select("agendamento_id")
        .eq("data_execucao", dia);
      const existentesSet = new Set((existentes || []).map((e: any) => Number(e.agendamento_id)));

      const buracos = agendamentos.filter(
        (a: any) => !existentesSet.has(Number(a.agendamento_id)) && Number(a.status_id) === 3,
      );
      if (buracos.length === 0) continue;

      const pacienteIds = [...new Set(buracos.map((b: any) => Number(b.paciente_id)))];
      const procedimentoIds = [...new Set(buracos.map((b: any) => Number(b.procedimento_id)))];

      const { data: pacientesData } = await supabaseAdmin
        .from("pacientes").select("paciente_id, nome").in("paciente_id", pacienteIds);
      const pacienteNomeMap = new Map((pacientesData || []).map((p: any) => [Number(p.paciente_id), p.nome]));

      const { data: procData } = await supabaseAdmin
        .from("procedimentos").select("procedimento_id, nome").in("procedimento_id", procedimentoIds);
      const procNomeMap = new Map((procData || []).map((p: any) => [Number(p.procedimento_id), p.nome]));

      const toInsert = buracos.map((b: any) => ({
        feegow_id: hashToBigInt(`FALLBACK-${b.agendamento_id}`),
        agendamento_id: BigInt(b.agendamento_id),
        paciente_id: b.paciente_id ? BigInt(b.paciente_id) : null,
        paciente_nome: pacienteNomeMap.get(Number(b.paciente_id)) || null,
        procedimento_id: b.procedimento_id ? BigInt(b.procedimento_id) : null,
        procedimento_nome: procNomeMap.get(Number(b.procedimento_id)) || null,
        profissional_id: b.profissional_id ? BigInt(b.profissional_id) : null,
        data_execucao: dia,
        hora_inicio: b.horario || null,
        valor: parseValorAppoints(b.valor_total_agendamento || b.valor),
        situacao: "Faturado",
        convenio_id: b.convenio_id ? Number(b.convenio_id) : null,
        unidade_id: b.unidade_id ? BigInt(b.unidade_id) : null,
        tipo_procedimento: "Fallback appoints/search",
        payload_raw: { ...b, _fonte: "appoints_search_fallback" },
      }));

      const { error } = await supabaseAdmin
        .from("lab_producao_feegow")
        .upsert(toInsert as any, { onConflict: "id_transacao,n_guia_prestador,procedimento_id,agendamento_id" });
      if (error) resumo.erros.push(`${dia}: ${error.message}`);
      else resumo.preenchidos += toInsert.length;
    } catch (e: any) {
      resumo.erros.push(`${dia}: ${e.message}`);
    }
  }
  return resumo;
}

export async function enriquecer() {
  try {
    await supabaseAdmin.rpc("lab_enriquecer_faturamento" as any);
  } catch {
    /* enriquecimento é best-effort */
  }
}

// --- TRAVA DE EXECUÇÃO ÚNICA ---

export async function getJobState(id: string) {
  const { data } = await supabaseAdmin.from("lab_sync_lock").select("*").eq("id", id).maybeSingle();
  return data as any;
}

export async function acquireLock(id: string): Promise<{ ok: boolean; reason?: string; state?: any }> {
  const state = await getJobState(id);
  if (!state) return { ok: false, reason: "job_inexistente" };
  if (state.paused) return { ok: false, reason: "pausado", state };
  const leaseAtivo = state.running && state.lease_until && new Date(state.lease_until) > new Date();
  if (leaseAtivo) return { ok: false, reason: "em_execucao", state };

  const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("lab_sync_lock")
    .update({ running: true, lease_until: leaseUntil, last_run_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, state };
}

export async function releaseLock(
  id: string,
  outcome: { ok: boolean; result?: any; error?: string; falhasAnteriores: number },
) {
  const falhas = outcome.ok ? 0 : outcome.falhasAnteriores + 1;
  const pausar = falhas >= MAX_FALHAS_ANTES_DE_PAUSAR;
  await supabaseAdmin
    .from("lab_sync_lock")
    .update({
      running: false,
      lease_until: null,
      consecutive_failures: falhas,
      paused: pausar,
      pause_reason: pausar ? `Pausado após ${falhas} falhas seguidas: ${outcome.error ?? ""}`.slice(0, 500) : null,
      last_success_at: outcome.ok ? new Date().toISOString() : undefined,
      last_result: outcome.result ?? null,
      last_error: outcome.error ?? null,
    } as any)
    .eq("id", id);
}

async function logSync(endpoint: string, params: any, ok: boolean, registros: number, erro?: string) {
  await supabaseAdmin.from("lab_sync_log").insert({
    endpoint,
    parametros: params,
    api_success: ok,
    registros,
    erro: erro ?? (ok ? "concluido" : "erro"),
  } as any);
}

// --- SINCRONIZAÇÃO INCREMENTAL (a cada 30 min) ---

export async function runIncrementalSync(diasJanela = 3) {
  const lock = await acquireLock("auto_sync");
  if (!lock.ok) return { skipped: true, reason: lock.reason };

  const falhasAnteriores = lock.state?.consecutive_failures ?? 0;
  const fim = todayISO();
  const inicio = addDaysISO(fim, -Math.max(0, diasJanela - 1));

  try {
    const producao = await syncProducaoRange(inicio, fim);
    const safety = await syncSafetyNetRange(inicio, fim);
    await enriquecer();
    const result = { inicio, fim, producao, safety };
    await logSync("auto-sync:30min", { inicio, fim }, true, producao.gravados + safety.preenchidos);
    await releaseLock("auto_sync", { ok: true, result, falhasAnteriores });
    return { skipped: false, ...result };
  } catch (e: any) {
    await logSync("auto-sync:30min", { inicio, fim }, false, 0, e.message);
    await releaseLock("auto_sync", { ok: false, error: e.message, falhasAnteriores });
    throw e;
  }
}

// --- CARGA HISTÓRICA (fila de blocos) ---

export async function processBackfillQueue(maxBlocos = 3) {
  const lock = await acquireLock("backfill");
  if (!lock.ok) return { skipped: true, reason: lock.reason };
  const falhasAnteriores = lock.state?.consecutive_failures ?? 0;

  const resumo = { processados: 0, registros: 0, falhas: 0, restantes: 0 };
  try {
    const { data: pendentes } = await supabaseAdmin
      .from("lab_backfill_jobs")
      .select("*")
      .in("status", ["pendente", "erro"])
      .lt("tentativas", 3)
      .order("data_inicio", { ascending: false })
      .limit(maxBlocos);

    for (const job of (pendentes ?? []) as any[]) {
      await supabaseAdmin.from("lab_backfill_jobs")
        .update({ status: "processando", tentativas: job.tentativas + 1 } as any).eq("id", job.id);
      try {
        const registros = await processarBlocoFatiado(job.data_inicio, job.data_fim);
        await supabaseAdmin.from("lab_backfill_jobs").update({
          status: "concluido", registros, erro: null, processado_em: new Date().toISOString(),
        } as any).eq("id", job.id);
        resumo.processados++;
        resumo.registros += registros;
      } catch (e: any) {
        resumo.falhas++;
        await supabaseAdmin.from("lab_backfill_jobs")
          .update({ status: "erro", erro: String(e.message).slice(0, 500) } as any).eq("id", job.id);
      }
    }

    await enriquecer();

    const { count } = await supabaseAdmin
      .from("lab_backfill_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["pendente", "erro"])
      .lt("tentativas", 3);
    resumo.restantes = count ?? 0;

    await logSync("backfill:lote", resumo, true, resumo.registros);
    await releaseLock("backfill", { ok: true, result: resumo, falhasAnteriores });
    return { skipped: false, ...resumo };
  } catch (e: any) {
    await releaseLock("backfill", { ok: false, error: e.message, falhasAnteriores });
    throw e;
  }
}

/** Tenta o bloco inteiro; se a Feegow falhar, refatia em 3 dias e depois 1 dia. */
async function processarBlocoFatiado(inicio: string, fim: string): Promise<number> {
  const tentar = async (a: string, b: string) => (await syncProducaoRange(a, b)).gravados;
  try {
    return await tentar(inicio, fim);
  } catch {
    let total = 0;
    const erros: string[] = [];
    for (let d = inicio; d <= fim; d = addDaysISO(d, 3)) {
      const sub = addDaysISO(d, 2) > fim ? fim : addDaysISO(d, 2);
      try {
        total += await tentar(d, sub);
      } catch {
        for (let dd = d; dd <= sub; dd = addDaysISO(dd, 1)) {
          try { total += await tentar(dd, dd); } catch (e: any) { erros.push(`${dd}: ${e.message}`); }
        }
      }
    }
    if (erros.length > 0 && total === 0) throw new Error(erros.slice(0, 3).join(" | "));
    return total;
  }
}

export async function criarBackfill(inicio: string, fim: string, blocoDias = 7) {
  const batchId = crypto.randomUUID();
  const blocos: any[] = [];
  for (let d = inicio; d <= fim; d = addDaysISO(d, blocoDias)) {
    const b = addDaysISO(d, blocoDias - 1);
    blocos.push({ batch_id: batchId, data_inicio: d, data_fim: b > fim ? fim : b });
  }
  const { error } = await supabaseAdmin.from("lab_backfill_jobs").insert(blocos as any);
  if (error) throw new Error(error.message);
  return { batch_id: batchId, blocos: blocos.length };
}
