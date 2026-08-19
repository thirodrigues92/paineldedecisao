import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- UTILITÁRIOS ---

function parseValorCentavos(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v / 100;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  // Se for uma string formatada como "1.234,56", convertemos para número e mantemos reais (pois o Feegow as vezes manda formatado ou centavos puros)
  // REGRA CONSOLIDADA: API manda centavos puros (inteiro) na maioria dos campos de list-invoice
  const num = Number(s.replace(/\./g, "").replace(",", "."));
  return (num || 0) / 100;
}

function parseDataFeegow(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Formato ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Formato Feegow: DD-MM-YYYY
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function toFeegowDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

const FEEGOW_BASE = "https://api.feegow.com/v1/api";
const FEEGOW_TOKEN = () => process.env.FEEGOW_API_TOKEN ?? "";

// --- PROCEDIMENTOS ---

export const labSyncDimensoes = createServerFn({ method: "POST" }).handler(async () => {
  const headers = { "x-access-token": FEEGOW_TOKEN() };
  
  // 1. Grupos
  const groupsRes = await fetch(`${FEEGOW_BASE}/procedures/groups`, { headers });
  const groupsBody = await groupsRes.json();
  const groups = groupsBody.content || [];
  const groupsMap = new Map(groups.map((g: any) => [Number(g.id), g.nome]));

  // 2. Procedimentos
  const procRes = await fetch(`${FEEGOW_BASE}/procedures/list`, { headers });
  const procBody = await procRes.json();
  const list = procBody.content || [];

  const dimProcs = list.map((p: any) => ({
    procedimento_id: Number(p.id),
    nome: p.nome,
    grupo_id: Number(p.procedimento_grupo_id),
    grupo_nome: groupsMap.get(Number(p.procedimento_grupo_id)) || 'Não classificado',
    tipo: p.tipo
  }));

  if (dimProcs.length) {
    await supabaseAdmin.from("lab_dim_procedimento").upsert(dimProcs, { onConflict: "procedimento_id" });
  }

  return { ok: true, count: dimProcs.length };
});

// --- AGENDA ---

async function syncAgendaPeriodo(start: string, end: string) {
  const headers = { "x-access-token": FEEGOW_TOKEN() };
  let offset = 0;
  const limit = 50;
  const agendamentos: any[] = [];

  while (true) {
    const url = new URL(`${FEEGOW_BASE}/appoints/search`);
    url.searchParams.set("data_start", toFeegowDate(start));
    url.searchParams.set("data_end", toFeegowDate(end));
    url.searchParams.set("list_procedures", "1");
    url.searchParams.set("start", String(offset));
    url.searchParams.set("offset", String(limit));

    const res = await fetch(url.toString(), { headers });
    const body = await res.json();
    const list = body.content?.appointments || body.content || [];
    
    if (!Array.isArray(list) || list.length === 0) break;

    for (const a of list) {
      agendamentos.push({
        agendamento_id: Number(a.id),
        convenio_id: a.convenio_id ? Number(a.convenio_id) : null,
        plano_id: a.plano_id ? Number(a.plano_id) : null,
        paciente_id: a.paciente_id ? Number(a.paciente_id) : null,
        profissional_id: a.profissional_id ? Number(a.profissional_id) : null,
        unidade_id: a.unidade_id ? Number(a.unidade_id) : null,
        status_id: a.status_id ? Number(a.status_id) : null,
        data: parseDataFeegow(a.data),
        canal_id: a.canal_id ? Number(a.canal_id) : null,
        especialidade_id: a.especialidade_id ? Number(a.especialidade_id) : null
      });
    }

    if (list.length < limit) break;
    offset += limit;
  }

  if (agendamentos.length) {
    await supabaseAdmin.from("lab_dim_agendamento").upsert(agendamentos, { onConflict: "agendamento_id" });
  }
  return agendamentos.length;
}

// --- SYNC PRINCIPAL ---

export const labSyncParticular = createServerFn({ method: "POST" })
  .inputValidator((data: { 
    data_inicio: string; 
    data_fim: string; 
    tipo_transacao?: string; 
    tamanho_janela?: number;
    dry_run?: boolean;
    limpar_antes?: boolean;
  }) => data)
  .handler(async ({ data }) => {
    const { data_inicio, data_fim, tipo_transacao = 'C', tamanho_janela = 7, dry_run = false, limpar_antes = false } = data;
    
    if (limpar_antes && !dry_run) {
      await supabaseAdmin.from("lab_faturamento").delete().gte("data_competencia", data_inicio).lte("data_competencia", data_fim).eq("tipo_transacao", tipo_transacao);
    }

    // 1. Sincronizar Agenda do período primeiro para o JOIN funcionar
    if (!dry_run) {
      await syncAgendaPeriodo(data_inicio, data_fim);
    }

    const startTotal = new Date(data_inicio);
    const endTotal = new Date(data_fim);
    let currentStart = new Date(startTotal);
    
    const resumo = {
      janelas: [] as any[],
      total_contas: 0,
      total_itens: 0,
      total_pagamentos: 0,
      soma_faturada: 0,
      soma_recebida: 0,
      com_agendamento: 0,
      com_procedimento: 0,
      cancelados: 0,
      divergencias: 0
    };

    // Fila de janelas (permite split recursivo em caso de cod_erro=1)
    const fila: Array<{ ini: Date; fim: Date }> = [];
    while (currentStart <= endTotal) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + (tamanho_janela - 1));
      if (currentEnd > endTotal) currentEnd.setTime(endTotal.getTime());
      fila.push({ ini: new Date(currentStart), fim: new Date(currentEnd) });
      currentStart.setDate(currentStart.getDate() + tamanho_janela);
    }

    const iso = (d: Date) => d.toISOString().split('T')[0];

    while (fila.length) {
      const janela = fila.shift()!;
      const spanDias = Math.round((janela.fim.getTime() - janela.ini.getTime()) / 86400000) + 1;
      const ds = toFeegowDate(iso(janela.ini));
      const de = toFeegowDate(iso(janela.fim));

      let windowItemsCount = 0;
      let windowContasCount = 0;
      let windowPagamentosCount = 0;
      let windowValorFaturado = 0;
      let windowValorRecebido = 0;
      let windowAmostra: any[] = [];

      // 1. Log de INÍCIO obrigatório
      if (!dry_run) {
        await supabaseAdmin.from("lab_sync_log").insert({
          endpoint: "financial/list-invoice",
          parametros: { ds, de, tipo_transacao, janela: spanDias, dry_run },
          api_success: false,
          registros: 0,
          erro: "iniciado"
        });
      }

      try {
        // O endpoint IGNORA start/offset: devolve o período inteiro em uma única resposta.
        // Por isso fazemos UMA chamada por janela de data (paginar causava laço infinito).
        const url = new URL(`${FEEGOW_BASE}/financial/list-invoice`);
        url.searchParams.set("data_start", ds);
        url.searchParams.set("data_end", de);
        url.searchParams.set("tipo_transacao", tipo_transacao);
        url.searchParams.set("unidade_id", "0");
        url.searchParams.set("billing", "1");
        url.searchParams.set("show_items", "1");
        url.searchParams.set("show_payments", "1");



        // 2. Try/catch + 3. Timeout explícito (20s)
        let body: any;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);

          const res = await fetch(url.toString(), {
            headers: { "x-access-token": FEEGOW_TOKEN() },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`HTTP ${res.status}: ${errText}`);
          }

          body = await res.json();
        } catch (fetchErr: any) {
          const errorMsg = fetchErr.name === 'AbortError' ? 'timeout' : fetchErr.message;
          if (!dry_run) {
            await supabaseAdmin.from("lab_sync_log").insert({
              endpoint: "financial/list-invoice",
              parametros: { ds, de, tipo_transacao },
              api_success: false,
              registros: 0,
              erro: `Erro fetch: ${errorMsg}`,
              http_status: null
            });
          }
          throw fetchErr; // Propaga para o catch externo lidar com split
        }

        // Caso a API retorne erro de memória ou limite, forçar split
        if (!body.success && body.cod_erro === 1 && spanDias > 1) {
          throw new Error("RETRY_SPLIT");
        }

        const listItems = body.content?.list || body.content || [];
        const lista: any[] = Array.isArray(listItems) ? listItems : [];

        if (lista.length) {
          windowAmostra = lista.slice(0, 2);
        }

        const faturamentos: any[] = [];
        const headers: any[] = [];
        const recebimentos: any[] = [];
        const vistos = new Set<number>();
        let duplicados = 0;

        for (const invoice of lista) {
          const invoice_id = Number(invoice.invoice_id);
          // Guarda anti-duplicidade dentro da mesma resposta (mesmo sem laço while, mantemos por segurança)
          if (vistos.has(invoice_id)) { 
            duplicados++; 
            continue; 
          }
          vistos.add(invoice_id);

          const headerVal = parseValorCentavos(invoice.detalhes?.[0]?.valor);

          headers.push({
            invoice_id,
            data: parseDataFeegow(invoice.detalhes?.[0]?.data),
            valor_total: headerVal,
            paciente_id: invoice.paciente_id ? Number(invoice.paciente_id) : null,
            unidade_id: invoice.unidade_id ? Number(invoice.unidade_id) : null
          });

          let somaItensInvoice = 0;
          for (const item of (invoice.itens || [])) {
            const val = parseValorCentavos(item.valor);
            const desc = parseValorCentavos(item.desconto);
            const acre = parseValorCentavos(item.acrescimo);
            const finalVal = val - desc + acre;
            const isCancelado = item.is_cancelado === true || item.is_cancelado === 1;

            if (isCancelado) resumo.cancelados++;
            if (item.agendamento_id) resumo.com_agendamento++;
            if (item.procedimento_id) resumo.com_procedimento++;

            faturamentos.push({
              origem: 'particular',
              documento_id: invoice_id,
              item_id: Number(item.item_id),
              agendamento_id: item.agendamento_id ? Number(item.agendamento_id) : null,
              // Fallback importante: a API no list-invoice as vezes não manda o paciente_id no topo, 
              // mas a agenda (syncAgendaPeriodo) tem esse dado. O lab_enriquecer_faturamento vai completar via agendamento_id.
              paciente_id: invoice.paciente_id ? Number(invoice.paciente_id) : null,
              profissional_id: item.executante_id ? Number(item.executante_id) : null,
              unidade_id: invoice.unidade_id ? Number(invoice.unidade_id) : null,
              procedimento_id: item.procedimento_id ? Number(item.procedimento_id) : null,
              data_atendimento: parseDataFeegow(item.data_execucao),
              data_competencia: parseDataFeegow(invoice.detalhes?.[0]?.data || item.data_execucao),
              valor_bruto: val,
              desconto: desc,
              acrescimo: acre,
              valor_faturado: finalVal,
              is_cancelado: isCancelado,
               tipo_transacao: tipo_transacao,
               payload_raw: {
                 ...item,
                 _debug_invoice_header: invoice.detalhes?.[0],
                 _debug_sync_at: new Date().toISOString()
               }
             });

            somaItensInvoice += finalVal;
            resumo.soma_faturada += finalVal;
            windowValorFaturado += finalVal;
          }

          if (Math.abs(somaItensInvoice - headerVal) > 0.01) {
            resumo.divergencias++;
          }

          for (const pag of (invoice.pagamentos || [])) {
            const valPag = parseValorCentavos(pag.valor);
            recebimentos.push({
              origem: 'particular',
              documento_id: invoice_id,
              pagamento_id: Number(pag.pagamento_id),
              data_pagamento: parseDataFeegow(pag.data),
              valor_recebido: valPag,
              forma_pagamento: pag.forma_pagamento,
              conta_destino_id: pag.conta_id ? Number(pag.conta_id) : null,
              payload_raw: {
                ...pag,
                _debug_source: 'financial/list-invoice',
                _debug_sync_at: new Date().toISOString()
              }
            });
            resumo.soma_recebida += valPag;
            resumo.total_pagamentos++;
            windowValorRecebido += valPag;
            windowPagamentosCount++;
          }
        }

        if (!dry_run) {
          console.log(`[SYNC] Gravando dados: headers=${headers.length}, faturamentos=${faturamentos.length}, recebimentos=${recebimentos.length}`);
          
          // Grava em blocos para não estourar o payload
          const chunk = <T,>(arr: T[], n: number) => arr.reduce<T[][]>((acc, v, i) => {
            if (i % n === 0) acc.push([]);
            acc[acc.length - 1].push(v);
            return acc;
          }, []);

          if (headers.length > 0) {
            for (const bloco of chunk(headers, 200)) {
              const { error } = await supabaseAdmin.from("lab_invoice_header").upsert(bloco, { onConflict: "invoice_id" });
              if (error) console.error("[SYNC] Erro ao gravar headers:", error);
            }
          }
          
          if (faturamentos.length > 0) {
            for (const bloco of chunk(faturamentos, 200)) {
              const { error } = await supabaseAdmin.from("lab_faturamento").upsert(bloco, { onConflict: "origem,documento_id,item_id" });
              if (error) console.error("[SYNC] Erro ao gravar faturamentos:", error);
            }
          }
          
          if (recebimentos.length > 0) {
            for (const bloco of chunk(recebimentos, 200)) {
              const { error } = await supabaseAdmin.from("lab_recebimento").upsert(bloco, { onConflict: "origem,documento_id,pagamento_id" });
              if (error) console.error("[SYNC] Erro ao gravar recebimentos:", error);
            }
          }
        }

        windowItemsCount = faturamentos.length;
        windowContasCount = vistos.size;
        resumo.total_contas += windowContasCount;
        resumo.total_itens += windowItemsCount;

        resumo.janelas.push({
          ds, de,
          status: 'success',
          contas: windowContasCount,
          itens: windowItemsCount,
          pagamentos: windowPagamentosCount,
          valor_faturado: windowValorFaturado,
          valor_recebido: windowValorRecebido,
          duplicados,
          amostra: windowAmostra
        });

        if (!dry_run) {
          await supabaseAdmin.from("lab_sync_log").insert({
            endpoint: "financial/list-invoice",
            parametros: { ds, de, tipo_transacao, duplicados },
            api_success: true,
            registros: windowContasCount,
            erro: duplicados > 0 ? "paginacao_ignorada_pelo_endpoint" : "concluido",
            amostra_raw: windowAmostra.length > 0 ? windowAmostra[0] : null
          });
        }

      } catch (err: any) {
        // Tenta detectar erro de memória ou timeout
        const isMemoryError = err.message?.includes("memory size") || (err.message === "RETRY_SPLIT");
        const isTimeout = err.name === 'AbortError' || err.message === 'timeout';

        if ((isMemoryError || isTimeout) && spanDias > 1) {
          // Split recursivo real: divide a janela ao meio
          const metade = Math.floor(spanDias / 2);
          const meioFim = new Date(janela.ini);
          meioFim.setDate(janela.ini.getDate() + metade - 1);
          
          const meioIni = new Date(meioFim);
          meioIni.setDate(meioFim.getDate() + 1);

          // Coloca as duas novas metades no início da fila
          fila.unshift({ ini: meioIni, fim: janela.fim });
          fila.unshift({ ini: new Date(janela.ini), fim: meioFim });
          
          resumo.janelas.push({ 
            ds, de, 
            status: 'split', 
            error: `${isTimeout ? 'Timeout' : 'Memória'}: dividida em ${metade}d + ${spanDias - metade}d` 
          });
        } else {
          // Erro definitivo para esta janela
          resumo.janelas.push({ ds, de, status: 'error', error: String(err.message || err) });
          if (!dry_run) {
            await supabaseAdmin.from("lab_sync_log").insert({
              endpoint: "financial/list-invoice",
              parametros: { ds, de, tipo_transacao },
              api_success: false,
              registros: 0,
              erro: String(err.message || err)
            });
          }
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }


    // Pós-processamento: Enriquecer lab_faturamento com grupos e dados de agenda (via SQL)
    if (!dry_run) {
      await supabaseAdmin.rpc('lab_enriquecer_faturamento');
    }

    return { ok: true, resumo };
  });

// --- DEBUG & AUX ---

export const labDebugFeegow = createServerFn({ method: "POST" })
  .inputValidator((data: { endpoint: string; params?: Record<string, string>; method?: "GET" | "POST"; body?: any }) => data)
  .handler(async ({ data }) => {
    const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN ?? "";
    const endpoint = data.endpoint.startsWith("/") ? data.endpoint : "/" + data.endpoint;
    const url = new URL(FEEGOW_BASE + endpoint);
    
    if (data.params) {
      for (const [k, v] of Object.entries(data.params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method: data.method || "GET",
      headers: { 
        "x-access-token": FEEGOW_TOKEN,
        "Content-Type": "application/json"
      },
      body: data.method === "POST" ? JSON.stringify(data.body) : undefined
    });

    const body = await res.json().catch(() => ({}));
    
    let rows = [];
    if (body.success) {
      const content = body.content?.list || body.content?.appointments || body.content || [];
      rows = Array.isArray(content) ? content : [content].filter(Boolean);
    }

    return {
      ok: true,
      url: url.toString(),
      http_status: res.status,
      api_success: body.success === true,
      total_registros: rows.length,
      raw: body
    };
  });

// Mock para retrocompatibilidade enquanto unificamos
export const labSyncConvenio = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true, msg: "Use o labSyncParticular com a lógica unificada de agenda." };
});

export const clearLabData = createServerFn({ method: "POST" }).handler(async () => {
  await supabaseAdmin.from("lab_faturamento").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseAdmin.from("lab_recebimento").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseAdmin.from("lab_invoice_header").delete().neq("invoice_id", 0);
  await supabaseAdmin.from("lab_sync_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return { ok: true };
});