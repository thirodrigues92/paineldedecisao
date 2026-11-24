import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { feegowIntegerId } from "./feegow-identifiers";
import { gravarProducao } from "./lab-producao-write.server";
import { PAUSE_HOURS, RETRY_DELAY_MS, appointmentWindow, pauseExpired, isolatedStage } from "./sync-policy";
import { syncAgendamentosRange, fetchAppointments } from "./agendamentos-sync.server";

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
    acc[acc.length - 1]?.push(v);
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

async function syncProducaoAttempt(start: string, end: string) {
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

  if (!res.ok) {
    const responseBody = await res.text();
    await supabaseAdmin.from("lab_sync_log").insert({ endpoint: "reports/generate:erro", parametros: { inicio:start, fim:end }, http_status:res.status, api_success:false, registros:0, erro:`HTTP ${res.status}`, amostra_raw:{body:responseBody.slice(0,16000)} });
    throw Object.assign(new Error(`Feegow HTTP ${res.status} em reports/generate (${ds} a ${de})`), {status:res.status});
  }
  const body = await res.json();
  // A Feegow responde success:true com data:false quando o período não tem
  // nenhum atendimento (dias sem movimento). Isso não é erro: é zero registros.
  if (body?.success && !Array.isArray(body.data)) {
    return resumo;
  }
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
      convenio_id: feegowIntegerId(r.ConvenioID),
      convenio_nome: (r.ConvenioID && Number(r.ConvenioID) > 0)
        ? (r.NomeConvenio || null)
        : (r.TipoGuia === "Particular" ? "Particular" : (r.TipoGuia || null)),
      situacao: r.Situacao || null,
      situacao_conta: r.SituacaoConta || null,
      grupo_id: feegowIntegerId(r.GrupoID),
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

  const gravacao = await gravarProducao(records);
  resumo.erros.push(...gravacao.erros);
  resumo.gravados = gravacao.gravados;

  return resumo;
}

export async function syncProducaoRange(start: string, end: string) {
  try { return await syncProducaoAttempt(start,end); }
  catch(error: any) {
    if (error.status !== 403 && error.status !== 429) throw error;
    const result = {total:0,gravados:0,erros:[] as string[]};
    for(let day=start;day<=end;day=addDaysISO(day,1)) {
      await new Promise(resolve=>setTimeout(resolve,RETRY_DELAY_MS));
      try {
        const r=await syncProducaoAttempt(day,day);
        result.total+=r.total; result.gravados+=r.gravados; result.erros.push(...r.erros);
      } catch(e:any) { result.erros.push(`${day}: ${e.message}`); }
    }
    return result;
  }
}

// --- REPASSE MÉDICO (reports/generate: medical-transfer) ---

/** Busca o relatório de Repasse em uma janela pequena (a Feegow falha em janelas grandes). */
async function fetchRepasseJanela(start: string, end: string): Promise<any[]> {
  const res = await fetch(`${FEEGOW_BASE}/reports/generate`, {
    method: "POST",
    headers: { "x-access-token": FEEGOW_TOKEN(), "Content-Type": "application/json" },
    body: JSON.stringify({
      report: "medical-transfer",
      DATA_INICIO: toFeegowDate(start, "/"),
      DATA_FIM: toFeegowDate(end, "/"),
      UNIDADE_IDS: [0],
    }),
  });
  if (!res.ok) throw new Error(`Feegow HTTP ${res.status} em medical-transfer (${start} a ${end})`);
  const body = await res.json();
  if (!body?.success) throw new Error(`Feegow recusou medical-transfer: ${JSON.stringify(body).slice(0, 200)}`);
  return Array.isArray(body.data) ? body.data : [];
}

function mapRepasse(r: any) {
  const toBig = (v: any) => {
    if (v === undefined || v === null || v === "") return null;
    try { return BigInt(v); } catch { return null; }
  };
  const idTransacao = String(r.IDTransacao ?? "");
  const itemId = String(r.ItemID ?? r.ItemInvoiceID ?? r.ItemGuiaID ?? "");
  return {
    id_transacao: idTransacao,
    item_id: itemId,
    profissional_id: r.ProfissionalID != null ? Number(r.ProfissionalID) : -1,
    procedimento_id: r.ProcedimentoID != null ? Number(r.ProcedimentoID) : -1,
    data_repasse: parseDataFeegow(r.Data ?? r.DataReferencia),
    profissional_nome: (r.NomeProfissional || r.Executante || null),
    paciente_id: toBig(r.PacienteID),
    paciente_nome: r.NomePaciente || null,
    procedimento_nome: r.NomeProcedimento || null,
    grupo_id: feegowIntegerId(r.GrupoID),
    especialidade_id: feegowIntegerId(r.EspecialidadeID),
    convenio_id: feegowIntegerId(r.ConvenioID),
    convenio_nome: r.NomeConvenio || null,
    unidade_id: toBig(r.UnidadeID),
    unidade_nome: r.NomeUnidade || null,
    tipo_lancamento: r.TipoLancamento || null,
    forma_pagamento: r.PaymentMethod || null,
    valor: parseValorBR(r.Valor),
    valor_liquido: parseValorBR(r.ValorLiquido),
    valor_repassado: parseValorBR(r.ValorRepassado),
    percentual: r.Percentual != null && r.Percentual !== "" ? parseValorBR(r.Percentual) : null,
    regra_repasse: r.RegraRepasse || null,
    situacao_repasse: r.SituacaoRepasse || null,
    quantidade: r.Quantidade != null && r.Quantidade !== "" ? parseValorBR(r.Quantidade) : null,
    payload_raw: r,
  };
}

/** Sincroniza repasse em fatias de 3 dias, com retry diário quando a Feegow falha. */
export async function syncRepasseRange(start: string, end: string) {
  const resumo = { total: 0, gravados: 0, erros: [] as string[] };
  const janelas: Array<[string, string]> = [];
  for (let d = start; d <= end; d = addDaysISO(d, 3)) {
    const b = addDaysISO(d, 2);
    janelas.push([d, b > end ? end : b]);
  }

  for (const [a, b] of janelas) {
    let rows: any[] = [];
    try {
      rows = await fetchRepasseJanela(a, b);
    } catch (e: any) {
      // refatia em dias individuais
      for (let dd = a; dd <= b; dd = addDaysISO(dd, 1)) {
        try {
          rows.push(...(await fetchRepasseJanela(dd, dd)));
        } catch (e2: any) {
          resumo.erros.push(`${dd}: ${e2.message}`);
        }
      }
      if (rows.length === 0) continue;
    }

    resumo.total += rows.length;
    const dedup = new Map<string, any>();
    for (const r of rows) {
      const m = mapRepasse(r);
      dedup.set(`${m.id_transacao}|${m.item_id}|${m.profissional_id}|${m.procedimento_id}`, m);
    }
    for (const bloco of chunk([...dedup.values()], 200)) {
      const { error } = await supabaseAdmin
        .from("lab_repasse_feegow")
        .upsert(bloco as any, { onConflict: "id_transacao,item_id,profissional_id,procedimento_id" });
      if (error) resumo.erros.push(error.message);
      else resumo.gravados += bloco.length;
    }
  }

  return resumo;
}

// --- REDE DE SEGURANÇA (appoints/search) ---


export async function syncSafetyNetRange(start: string, end: string) {
  const resumo = { dias: 0, preenchidos: 0, erros: [] as string[] };
  for (let dia = start; dia <= end; dia = addDaysISO(dia, 1)) {
    resumo.dias++;
    try {
      const agendamentos = await fetchAppointments(dia,dia);
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
        id_transacao: `ATEFALLBACK-${b.agendamento_id}`,
        n_guia_prestador: "",
        agendamento_id: BigInt(b.agendamento_id),
        paciente_id: b.paciente_id ? BigInt(b.paciente_id) : null,
        paciente_nome: pacienteNomeMap.get(Number(b.paciente_id)) || null,
        procedimento_id: b.procedimento_id ? BigInt(b.procedimento_id) : null,
        procedimento_nome: procNomeMap.get(Number(b.procedimento_id)) || null,
        profissional_id: b.profissional_id ? BigInt(b.profissional_id) : null,
        data_execucao: dia,
        hora_inicio: b.horario || null,
        valor: parseValorAppoints(b.valor_total_agendamento || b.valor),
        situacao: "Não Faturado",
        convenio_nome: "Não faturado",
        convenio_id: b.convenio_id ? Number(b.convenio_id) : null,
        unidade_id: b.unidade_id ? BigInt(b.unidade_id) : null,
        tipo_procedimento: "Fallback appoints/search",
        payload_raw: { ...b, _fonte: "appoints_search_fallback" },
      }));

      const gravacao = await gravarProducao(toInsert);
      resumo.erros.push(...gravacao.erros.map(erro => `${dia}: ${erro}`));
      resumo.preenchidos += gravacao.gravados;
    } catch (e: any) {
      resumo.erros.push(`${dia}: ${e.message}`);
    }
  }
  return resumo;
}

export async function enriquecer() {
  try {
    await supabaseAdmin.rpc("lab_refresh_grupo_catalogo");
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
  if (state.paused && !pauseExpired(state.paused_until ?? null)) return { ok:false, reason:"pausado", state };
  if(state.paused) await supabaseAdmin.from("lab_sync_lock").update({paused:false,paused_until:null,consecutive_failures:0,pause_reason:null}).eq("id",id);
  const leaseAtivo = state.running && state.lease_until && new Date(state.lease_until) > new Date();
  if (leaseAtivo) return { ok: false, reason: "em_execucao", state };

  const leaseUntil = new Date(Date.now() + LEASE_MINUTES * 60 * 1000).toISOString();
  const { error, data: claimed } = await supabaseAdmin
    .from("lab_sync_lock")
    .update({ running: true, lease_until: leaseUntil, last_run_at: new Date().toISOString() } as any)
    .eq("id", id).or(`running.eq.false,lease_until.lt.${new Date().toISOString()},lease_until.is.null`).select("id");
  if (error) return { ok: false, reason: error.message };
  if (!claimed?.length) return {ok:false,reason:"em_execucao"};
  return { ok: true, state: {...state,consecutive_failures:state.paused?0:state.consecutive_failures} };
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
      paused_until: pausar ? new Date(Date.now()+PAUSE_HOURS*3600000).toISOString() : null,
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
  if (!lock.ok) return { skipped: true as const, reason: lock.reason };

  const falhasAnteriores = lock.state?.consecutive_failures ?? 0;
  const fim = todayISO();
  const inicio = addDaysISO(fim, -Math.max(0, diasJanela - 1));

  const run = async (etapa:string,a:string,b:string,task:()=>Promise<any>) => {
    const outcome = await isolatedStage(async()=>{
      const r=await task();
      if(r.erros?.length) throw new Error(r.erros.join(" | "));
      return r;
    });
    await logSync(`sync:${etapa}`,{inicio:a,fim:b},outcome.ok,outcome.ok?(outcome.result.gravados ?? outcome.result.preenchidos ?? outcome.result.pagamentos ?? 0):0,outcome.ok?undefined:outcome.erro);
    return outcome.ok?{...outcome.result,ok:true}:{ok:false,erro:outcome.erro};
  };
  try {
    const producao=await run("producao",inicio,fim,()=>syncProducaoRange(inicio,fim));
    const safety=await run("safety",inicio,fim,()=>syncSafetyNetRange(inicio,fim));
    const repasse=await run("repasse",inicio,fim,()=>syncRepasseRange(inicio,fim));
    const receita=await run("receita",addDaysISO(fim,-30),fim,async()=>{
      const {syncReceitaBaixada}=await import("./financeiro-receita.server");
      return syncReceitaBaixada(addDaysISO(fim,-30),fim);
    });
    const itens=await run("itens",addDaysISO(fim,-6),fim,async()=>{
      const {syncFinItens}=await import("./fin-itens.server");
      return syncFinItens(addDaysISO(fim,-6),fim);
    });
    const window=appointmentWindow(fim);
    const agendamentos=await run("agendamentos",window.inicio,window.fim,()=>syncAgendamentosRange(window.inicio,window.fim));
    const pacientes=await run("pacientes",inicio,fim,async()=>{
      const {syncPatientRegistrations}=await import('./patient-registration.server');
      return syncPatientRegistrations(300);
    });
    const geocode=await isolatedStage(async()=>{const {processPatientGeocodes}=await import('./patient-geocode.server');return processPatientGeocodes(150,10);});
    await enriquecer();
    const result={inicio,fim,producao,safety,repasse,receita,itens,agendamentos,pacientes,geocode};
    const stages=[producao,safety,repasse,receita,itens,agendamentos,pacientes];
    const ok=stages.some(s=>s.ok);
    const errors=stages.filter(s=>!s.ok).map(s=>s.erro).join(" | ");
    await logSync("auto-sync:30min",{inicio,fim},stages.every(s=>s.ok),producao.gravados ?? 0,errors || undefined);
    // Only a cycle with no successful stage pauses the global worker.
    await releaseLock("auto_sync",{ok,result,error:errors,falhasAnteriores});
    const backfill=await isolatedStage(()=>processBackfillQueue(2));
    return {skipped:false as const,...result,backfill};
  } catch(e:any) {
    await releaseLock("auto_sync",{ok:false,error:e.message,falhasAnteriores});
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
      .order("created_at", { ascending: true })
      .limit(maxBlocos);

    for (const job of (pendentes ?? []) as any[]) {
      await supabaseAdmin.from("lab_backfill_jobs")
        .update({ status: "processando", tentativas: job.tentativas + 1 } as any).eq("id", job.id);
      try {
        const registros = await processarBlocoFatiado(job.data_inicio, job.data_fim, job.etapa);
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

    await logSync("backfill:lote", resumo, resumo.falhas === 0, resumo.registros, resumo.falhas ? `${resumo.falhas} blocos com falha` : undefined);
    await releaseLock("backfill", { ok: true, result: resumo, falhasAnteriores });
    return { skipped: false, ...resumo };
  } catch (e: any) {
    await releaseLock("backfill", { ok: false, error: e.message, falhasAnteriores });
    throw e;
  }
}

/** A failed sub-day is never marked completed, even when other days succeeded. */
async function processarBlocoFatiado(inicio:string,fim:string,etapa="producao_repasse"):Promise<number> {
  const run = async (stage:string,a:string,b:string,task:()=>Promise<any>)=>{
    try {
      const r=await task();
      if(r.erros?.length) throw new Error(r.erros.join(" | "));
      await logSync(`sync:${stage}`,{inicio:a,fim:b,backfill:true},true,r.gravados ?? 0);
      return r.gravados ?? 0;
    } catch(e:any) {
      await logSync(`sync:${stage}`,{inicio:a,fim:b,backfill:true},false,0,e.message);
      throw e;
    }
  };
  const attempt=async(a:string,b:string)=>{
    if(etapa==="agendamentos") return run("agendamentos",a,b,()=>syncAgendamentosRange(a,b));
    if(etapa==="repasse") return run("repasse",a,b,()=>syncRepasseRange(a,b));
    if(etapa==="producao") return run("producao",a,b,()=>syncProducaoRange(a,b));
    const p=await isolatedStage(()=>run("producao",a,b,()=>syncProducaoRange(a,b)));
    const r=await isolatedStage(()=>run("repasse",a,b,()=>syncRepasseRange(a,b)));
    if(!p.ok || !r.ok) throw new Error([!p.ok?p.erro:'',!r.ok?r.erro:''].filter(Boolean).join(" | "));
    return p.result+r.result;
  };
  try {return await attempt(inicio,fim);} catch(e) {
    if(inicio===fim) throw e;
    let total=0; const errors:string[]=[];
    for(let day=inicio;day<=fim;day=addDaysISO(day,1)) {
      await new Promise(resolve=>setTimeout(resolve,RETRY_DELAY_MS));
      try {total+=await attempt(day,day);} catch(err:any) {errors.push(`${day}: ${err.message}`);}
    }
    if(errors.length) throw new Error(errors.join(" | "));
    return total;
  }
}

export async function criarBackfill(inicio: string, fim: string, blocoDias = 3, etapa = "producao_repasse") {
  const batchId = crypto.randomUUID();
  const blocos: any[] = [];
  for (let d = inicio; d <= fim; d = addDaysISO(d, blocoDias)) {
    const b = addDaysISO(d, blocoDias - 1);
    blocos.push({ etapa, batch_id: batchId, data_inicio: d, data_fim: b > fim ? fim : b });
  }
  const { error } = await supabaseAdmin.from("lab_backfill_jobs").insert(blocos as any);
  if (error) throw new Error(error.message);
  return { batch_id: batchId, blocos: blocos.length };
}
