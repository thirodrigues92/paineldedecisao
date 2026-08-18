import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- UTILITÁRIOS ---

function parseValorBR(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseDataFeegow(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Formato ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Formato Feegow: DD-MM-YYYY
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Outros formatos via JS Date
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().substring(0, 10);
}

function toFeegowDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export const labDebugFeegow = createServerFn({ method: "POST" })
  .inputValidator((data: { endpoint: string; params?: Record<string, string>; method?: "GET" | "POST"; body?: any }) => data)
  .handler(async ({ data }) => {
    const FEEGOW_BASE = "https://api.feegow.com/v1/api";
    const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN ?? "";
    
    const endpoint = data.endpoint.startsWith("/") ? data.endpoint : "/" + data.endpoint;
    const url = new URL(FEEGOW_BASE + endpoint);
    
    // Configurações padrão apenas se não vierem parâmetros explícitos para evitar sobrescrever testes
    if (data.endpoint.includes("financial/list-invoice") && (!data.params || Object.keys(data.params).length === 0)) {
      url.searchParams.set("data_start", "01-08-2026");
      url.searchParams.set("data_end", "31-08-2026");
      url.searchParams.set("unidade_id", "0");
      url.searchParams.set("start", "0");
      url.searchParams.set("offset", "50");
    }

    if (data.params) {
      for (const [k, v] of Object.entries(data.params)) {
        url.searchParams.set(k, String(v));
      }
    }

    const method = data.method || "GET";
    const fetchOptions: RequestInit = {
      method,
      headers: { 
        "x-access-token": FEEGOW_TOKEN,
        "Content-Type": "application/json"
      }
    };

    if (method === "POST" && data.body) {
      fetchOptions.body = JSON.stringify(data.body);
    }

    console.log(`[LabDebug] ${method} Request: ${url.toString()}`);

    const res = await fetch(url.toString(), fetchOptions);
    const body = await res.json().catch(() => ({}));
    
    if (!body.success) {
      console.warn(`[LabDebug] API Failure: ${JSON.stringify(body)}`);
    }

    let content = body.content ?? [];
    if (!Array.isArray(content) && content && typeof content === "object") {
       for (const k of ["list", "data", "items", "rows", "appointments", "billing"]) {
         if (Array.isArray(content[k])) {
            content = content[k];
            break;
         }
       }
    }
    const rows = Array.isArray(content) ? content : [content].filter(Boolean);

    return {
      ok: true,
      url: url.toString(),
      method: method,
      sent_body: data.body,
      http_status: res.status,
      api_success: body.success === true,
      total_registros: rows.length,
      campos_detectados: rows.length > 0 ? Object.keys(rows[0]) : [],
      raw: body
    };
  });


export const labSyncParticular = createServerFn({ method: "POST" })
  .inputValidator((data: { data_inicio: string; data_fim: string; tipo_transacao?: string }) => data)
  .handler(async ({ data }) => {
    const FEEGOW_BASE = "https://api.feegow.com/v1/api";
    const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN ?? "";
    
    const ds = toFeegowDate(data.data_inicio);
    const de = toFeegowDate(data.data_fim);
    const tipoTransacao = data.tipo_transacao || "R"; // Default para Receita (a confirmar na varredura)

    let totalRegistros = 0;
    let start = 0;
    const offset = 50;

    while (true) {
      const url = new URL(`${FEEGOW_BASE}/financial/list-invoice`);
      url.searchParams.set("data_start", ds);
      url.searchParams.set("data_end", de);
      url.searchParams.set("tipo_transacao", tipoTransacao);
      url.searchParams.set("unidade_id", "0");
      url.searchParams.set("start", String(start));
      url.searchParams.set("offset", String(offset));

      const res = await fetch(url.toString(), {
        headers: { "x-access-token": FEEGOW_TOKEN }
      });
      const body = await res.json();
      const list = body.content?.list || body.content || [];
      if (!Array.isArray(list) || list.length === 0) break;

      const faturamentos: any[] = [];
      const recebimentos: any[] = [];

      for (const invoice of list) {
        const docId = Number(invoice.invoice_id);
        
        // detalhes[] → faturamento base
        for (const det of (invoice.detalhes || [])) {
          faturamentos.push({
            origem: 'particular',
            documento_id: docId,
            item_id: 0, // Item base da fatura
            valor_faturado: parseValorBR(det.valor),
            data_competencia: parseDataFeegow(det.data),
            paciente_id: invoice.paciente_id ? Number(invoice.paciente_id) : null,
            payload_raw: { ...det, movement_id: invoice.movement_id, conta_id: invoice.conta_id, tipo_conta: invoice.tipo_conta, NFe: invoice.NFe, dataNFe: invoice.dataNFe }
          });
        }

        // itens[] → detalhamento por procedimento/serviço
        for (const item of (invoice.itens || [])) {
          const val = parseValorBR(item.valor);
          const desc = parseValorBR(item.desconto);
          const acre = parseValorBR(item.acrescimo);
          
          faturamentos.push({
            origem: 'particular',
            documento_id: docId,
            item_id: Number(item.item_id || Math.random() * 1000000), // Fallback se não houver ID único
            agendamento_id: item.agendamento_id ? Number(item.agendamento_id) : null,
            paciente_id: invoice.paciente_id ? Number(invoice.paciente_id) : null,
            profissional_id: item.executante_id ? Number(item.executante_id) : null,
            unidade_id: invoice.unidade_id ? Number(invoice.unidade_id) : null,
            procedimento_id: item.procedimento_id ? Number(item.procedimento_id) : null,
            categoria_id: item.categoria_id ? Number(item.categoria_id) : null,
            centro_custo_id: item.centro_custo_id ? Number(item.centro_custo_id) : null,
            data_atendimento: parseDataFeegow(item.data_execucao),
            data_competencia: parseDataFeegow(invoice.detalhes?.[0]?.data || item.data_execucao),
            valor_bruto: val,
            desconto: desc,
            acrescimo: acre,
            valor_faturado: val - desc + acre,
            is_cancelado: item.is_cancelado === true || item.is_cancelado === 1,
            payload_raw: item
          });
        }

        // pagamentos[] → recebimento
        for (const pag of (invoice.pagamentos || [])) {
          recebimentos.push({
            origem: 'particular',
            documento_id: docId,
            pagamento_id: Number(pag.pagamento_id || Math.random() * 1000000),
            data_pagamento: parseDataFeegow(pag.data),
            valor_recebido: parseValorBR(pag.valor),
            forma_pagamento: pag.forma_pagamento,
            payload_raw: { ...pag, bandeira_id: pag.bandeira_id, parcelas: pag.parcelas, conta_destino_id: pag.conta_destino_id, transacao_numero: pag.transacao_numero, transacao_autorizacao: pag.transacao_autorizacao, transacao_parcelas: pag.transacao_parcelas }
          });
        }
      }

      if (faturamentos.length) {
        await supabaseAdmin.from("lab_faturamento").upsert(faturamentos, { onConflict: "origem,documento_id,item_id" });
      }
      if (recebimentos.length) {
        await supabaseAdmin.from("lab_recebimento").upsert(recebimentos, { onConflict: "origem,documento_id,pagamento_id" });
      }

      totalRegistros += list.length;
      
      await supabaseAdmin.from("lab_sync_log").insert({
        endpoint: "/financial/list-invoice",
        parametros: { ds, de, tipoTransacao, start, offset },
        api_success: body.success === true,
        http_status: res.status,
        registros: list.length,
        amostra_raw: list.slice(0, 2)
      });

      if (list.length < offset) break;
      start += offset;
    }

    return { ok: true, total: totalRegistros };
  });

export const labSyncConvenio = createServerFn({ method: "POST" })
  .inputValidator((data: { data_inicio: string; data_fim: string }) => data)
  .handler(async ({ data }) => {
    const FEEGOW_BASE = "https://api.feegow.com/v1/api";
    const FEEGOW_TOKEN = process.env.FEEGOW_API_TOKEN ?? "";
    
    const ds = toFeegowDate(data.data_inicio);
    const de = toFeegowDate(data.data_fim);

    let totalRegistros = 0;

    const insuranceRes = await fetch(`${FEEGOW_BASE}/insurance/list`, {
      headers: { "x-access-token": FEEGOW_TOKEN }
    });
    const insuranceBody = await insuranceRes.json();
    const insurances = insuranceBody.content || [];
    
    for (const ins of insurances) {
      const convenioId = Number(ins.id || ins.insurance_id);
      if (!convenioId) continue;

      try {
        const url = new URL(`${FEEGOW_BASE}/billing/insurances-billing`);
        url.searchParams.set("convenio_id", String(convenioId));
        url.searchParams.set("data_start", ds);
        url.searchParams.set("data_end", de);
        url.searchParams.set("billing_type_id", "1");
        url.searchParams.set("billing", "1");


        const res = await fetch(url.toString(), {
          headers: { "x-access-token": FEEGOW_TOKEN }
        });

        const body = await res.json();

        if (body.success !== true) {
          await supabaseAdmin.from("lab_sync_log").insert({
            endpoint: "/billing/insurances-billing",
            parametros: { convenioId, ds, de },
            api_success: false,
            http_status: res.status,
            erro: JSON.stringify(body)
          });
          continue;
        }

        const guias = body.content || [];
        const faturamentos: any[] = [];
        const recebimentos: any[] = [];

        for (const guia of guias) {
          const docId = Number(guia.AgendamentoID || guia.id || guia.Agendamento_id || 0);
          const valorFaturado = parseValorBR(guia.ValorProcedimento);
          const dataAtend = parseDataFeegow(guia.DataAtendimento);

          faturamentos.push({
            origem: 'convenio',
            documento_id: docId,
            item_id: Number(guia.GuiaID || 0),
            lote_id: Number(guia.LoteID || 0),
            agendamento_id: Number(guia.AgendamentoID || 0),
            atendimento_id: Number(guia.AtendimentoID || 0),
            paciente_id: Number(guia.PacienteID || 0),
            profissional_id: Number(guia.ProfissionalID || 0),
            unidade_id: Number(guia.UnidadeID || 0),
            procedimento_id: Number(guia.ProcedimentoID || 0),
            codigo_procedimento: String(guia.CodigoProcedimento || ""),
            convenio_id: convenioId,
            plano_id: Number(guia.PlanoID || 0),
            tabela_id: Number(guia.TabelaID || 0),
            data_atendimento: dataAtend,
            data_competencia: dataAtend,
            valor_faturado: valorFaturado,
            glosado: (guia.Glosado === 1 || guia.Glosado === true) ? 1 : 0,
            motivo_glosa: guia.MotivoGlosa,
            guia_status: guia.GuiaStatus,
            payload_raw: guia
          });

          const valorPago = parseValorBR(guia.ValorPago);
          if (valorPago > 0) {
            recebimentos.push({
              origem: 'convenio',
              documento_id: docId,
              pagamento_id: Number(guia.GuiaID || 0),
              data_pagamento: dataAtend,
              valor_recebido: valorPago,
              payload_raw: guia
            });
          }
        }

        if (faturamentos.length) {
          await supabaseAdmin.from("lab_faturamento").upsert(faturamentos, { onConflict: "origem,documento_id,item_id" });
        }
        if (recebimentos.length) {
          await supabaseAdmin.from("lab_recebimento").upsert(recebimentos, { onConflict: "origem,documento_id,pagamento_id" });
        }

        totalRegistros += guias.length;
        
        await supabaseAdmin.from("lab_sync_log").insert({
          endpoint: "/billing/insurances-billing",
          parametros: { convenioId, ds, de },
          api_success: true,
          http_status: res.status,
          registros: guias.length,
          amostra_raw: guias.slice(0, 2)
        });

      } catch (e) {
        await supabaseAdmin.from("lab_sync_log").insert({
          endpoint: "/billing/insurances-billing",
          parametros: { convenioId, ds, de },
          api_success: false,
          http_status: 500,
          erro: String(e)
        });
      }
    }

    return { ok: true, total: totalRegistros };
  });

export const clearLabData = createServerFn({ method: "POST" }).handler(async () => {
  await supabaseAdmin.from("lab_faturamento").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseAdmin.from("lab_recebimento").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseAdmin.from("lab_sync_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return { ok: true };
});
