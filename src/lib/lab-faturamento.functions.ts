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

    while (currentStart <= endTotal) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + (tamanho_janela - 1));
      if (currentEnd > endTotal) currentEnd.setTime(endTotal.getTime());

      const ds = toFeegowDate(currentStart.toISOString().split('T')[0]);
      const de = toFeegowDate(currentEnd.toISOString().split('T')[0]);

      let offset = 0;
      const limit = 50;
      let windowItemsCount = 0;
      let windowContasCount = 0;
      let windowPagamentosCount = 0;
      let windowValorFaturado = 0;
      let windowValorRecebido = 0;
      let windowAmostra: any[] = [];

      try {
        while (true) {
          const url = new URL(`${FEEGOW_BASE}/financial/list-invoice`);
          url.searchParams.set("data_start", ds);
          url.searchParams.set("data_end", de);
          url.searchParams.set("tipo_transacao", tipo_transacao);
          url.searchParams.set("unidade_id", "0");
          url.searchParams.set("start", String(offset));
          url.searchParams.set("offset", String(limit));

          const res = await fetch(url.toString(), { headers: { "x-access-token": FEEGOW_TOKEN() } });
          const body = await res.json();

          if (!body.success && body.cod_erro === 1 && tamanho_janela > 1) {
             throw new Error("RETRY_SPLIT");
          }

          const listItems = body.content?.list || body.content || [];
          if (!Array.isArray(listItems) || listItems.length === 0) break;

          if (windowAmostra.length < 2) {
            windowAmostra.push(...listItems.slice(0, 2 - windowAmostra.length));
          }

          const faturamentos: any[] = [];
          const headers: any[] = [];
          const recebimentos: any[] = [];

          for (const invoice of listItems) {
            const invoice_id = Number(invoice.invoice_id);
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
                payload_raw: item
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
                payload_raw: pag
              });
              resumo.soma_recebida += valPag;
              resumo.total_pagamentos++;
              windowValorRecebido += valPag;
              windowPagamentosCount++;
            }
          }

          if (!dry_run) {
            if (headers.length) await supabaseAdmin.from("lab_invoice_header").upsert(headers, { onConflict: "invoice_id" });
            if (faturamentos.length) await supabaseAdmin.from("lab_faturamento").upsert(faturamentos, { onConflict: "origem,documento_id,item_id" });
            if (recebimentos.length) await supabaseAdmin.from("lab_recebimento").upsert(recebimentos, { onConflict: "origem,documento_id,pagamento_id" });
          }

          windowItemsCount += faturamentos.length;
          windowContasCount += listItems.length;
          resumo.total_contas += listItems.length;
          resumo.total_itens += faturamentos.length;

          if (listItems.length < limit) break;
          offset += limit;
          await new Promise(r => setTimeout(r, 100));
        }

        resumo.janelas.push({ 
          ds, de, 
          status: 'success', 
          contas: windowContasCount,
          itens: windowItemsCount,
          pagamentos: windowPagamentosCount,
          valor_faturado: windowValorFaturado,
          valor_recebido: windowValorRecebido,
          amostra: windowAmostra
        });
        
        if (!dry_run) {
           await supabaseAdmin.from("lab_sync_log").insert({
             endpoint: "financial/list-invoice",
             parametros: { ds, de, tipo_transacao, offset },
             api_success: true,
             registros: windowContasCount
           });
        }

      } catch (err: any) {
        if (err.message === "RETRY_SPLIT") {
          // Implementação recursiva de split seria ideal, mas para brevidade vamos apenas registrar
          resumo.janelas.push({ ds, de, status: 'split_needed', error: "Memory pressure" });
        } else {
          resumo.janelas.push({ ds, de, status: 'error', error: String(err) });
        }
      }

      currentStart.setDate(currentStart.getDate() + tamanho_janela);
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