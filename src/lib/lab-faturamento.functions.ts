import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- UTILITÁRIOS ---

function parseValorCentavos(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v / 100;
  const s = String(v).replace(/R\$\s?/g, "").trim();
  if (!s) return 0;
  const num = Number(s.replace(/\./g, "").replace(",", "."));
  return (num || 0) / 100;
}

function parseDataFeegow(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function toFeegowDate(iso: string, separator: string = "-"): string {
  // Garantir que estamos usando a data local/nominal da string ISO (YYYY-MM-DD)
  // sem interferência de fuso horário na conversão para Date.
  const parts = iso.split("-");
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    return `${d}${separator}${m}${separator}${y}`;
  }
  
  // Fallback para o comportamento anterior se não for ISO YYYY-MM-DD
  const dObj = new Date(iso);
  const dd = String(dObj.getUTCDate()).padStart(2, "0");
  const mm = String(dObj.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}${separator}${mm}${separator}${dObj.getUTCFullYear()}`;
}

const FEEGOW_BASE = "https://api.feegow.com/v1/api";
const FEEGOW_TOKEN = () => process.env.FEEGOW_API_TOKEN ?? "";

// --- PROCEDIMENTOS ---

export const labSyncDimensoes = createServerFn({ method: "POST" }).handler(async () => {
  const headers = { "x-access-token": FEEGOW_TOKEN() };
  const groupsRes = await fetch(`${FEEGOW_BASE}/procedures/groups`, { headers });
  const groupsBody = await groupsRes.json();
  const groups = groupsBody.content || [];
  const groupsMap = new Map(groups.map((g: any) => [Number(g.id), g.nome]));

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

export const labSyncConvenio = createServerFn({ method: "POST" }).handler(async () => {
  return { ok: true, message: "Use labSyncParticular com tipo_transacao='C' para convênios" };
});

export const clearLabData = createServerFn({ method: "POST" }).handler(async () => {
  await supabaseAdmin.from("lab_faturamento").delete().neq("documento_id", 0);
  await supabaseAdmin.from("lab_invoice_header").delete().neq("invoice_id", 0);
  await supabaseAdmin.from("lab_recebimento").delete().neq("documento_id", 0);
  await supabaseAdmin.from("lab_sync_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  return { ok: true };
});

export const labDebugFeegow = createServerFn({ method: "POST" })
  .inputValidator((data: { 
    endpoint: string; 
    params?: Record<string, string>; 
    method?: "GET" | "POST"; 
    body?: any 
  }) => data)
  .handler(async ({ data }) => {
    const { endpoint, params, method = "GET", body } = data;
    const url = new URL(`${FEEGOW_BASE}/${endpoint.replace(/^\//, '')}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      method,
      headers: { 
        "x-access-token": FEEGOW_TOKEN(),
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const resBody = await res.json();
    return {
      http_status: res.status,
      api_success: res.ok,
      total_registros: resBody.content?.total || resBody.total || 0,
      raw: resBody
    };
  });


// --- AGENDA ---

async function syncAgendaPeriodo(start: string, end: string) {
  const headers = { "x-access-token": FEEGOW_TOKEN() };
  let offset = 0;
  const limit = 50;
  const agendamentos: any[] = [];
  const ds = toFeegowDate(start);
  const de = toFeegowDate(end);

  console.log(`[SYNC-AGENDA] Buscando agenda de ${ds} a ${de}`);

  while (true) {
    const url = new URL(`${FEEGOW_BASE}/appoints/search`);
    url.searchParams.set("data_start", ds);
    url.searchParams.set("data_end", de);
    url.searchParams.set("list_procedures", "1");
    url.searchParams.set("start", String(offset));
    url.searchParams.set("offset", String(limit));

    const res = await fetch(url.toString(), { headers });
    const body = await res.json();
    
    // Feegow API can return content.appointments or just content
    const list = body.content?.appointments || body.content || [];
    
    if (!Array.isArray(list) || list.length === 0) {
      break;
    }

    for (const a of list) {
      if (!a.id) continue;
      
      const toBigInt = (val: any) => {
        if (val === undefined || val === null || val === "") return null;
        try {
          return BigInt(val);
        } catch (e) {
          return null;
        }
      };

      agendamentos.push({
        agendamento_id: toBigInt(a.id),
        convenio_id: a.convenio_id ? Number(a.convenio_id) : null,
        plano_id: a.plano_id ? Number(a.plano_id) : null,
        paciente_id: a.paciente_id ? Number(a.paciente_id) : null,
        profissional_id: a.profissional_id ? Number(a.profissional_id) : null,
        unidade_id: a.unidade_id ? Number(a.unidade_id) : null,
        status_id: a.status_id ? Number(a.status_id) : null,
        data: parseDataFeegow(a.data),
        canal_id: a.canal_id ? Number(a.canal_id) : null,
        especialidade_id: a.especialidade_id ? Number(a.especialidade_id) : null,
        prontuario: a.prontuario || null
      });
    }

    if (list.length < limit) break;
    offset += limit;
  }

  if (agendamentos.length) {
    const { error } = await supabaseAdmin.from("lab_dim_agendamento").upsert(agendamentos, { onConflict: "agendamento_id" });
    if (error) console.error("[SYNC-AGENDA] Erro DB:", error);
  }
  return agendamentos.length;
}

export const labSyncAgenda = createServerFn({ method: "POST" })
  .inputValidator((data: { start: string; end: string }) => data)
  .handler(async ({ data }) => {
    return await syncAgendaPeriodo(data.start, data.end);
  });


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
      console.log(`[SYNC] Limpando dados de ${data_inicio} a ${data_fim}`);
      await supabaseAdmin.from("lab_invoice_header").delete().gte("data", data_inicio).lte("data", data_fim);
      await supabaseAdmin.from("lab_faturamento").delete().gte("data_competencia", data_inicio).lte("data_competencia", data_fim).eq("tipo_transacao", tipo_transacao);
    }

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
        const url = new URL(`${FEEGOW_BASE}/financial/list-invoice`);
        url.searchParams.set("data_start", ds);
        url.searchParams.set("data_end", de);
        url.searchParams.set("tipo_transacao", tipo_transacao);
        url.searchParams.set("unidade_id", "0");
        url.searchParams.set("billing", "1");
        url.searchParams.set("show_items", "1");
        url.searchParams.set("show_payments", "1");

        let body: any;
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
          // Garante que invoice_id é BigInt
          const invoice_id_raw = invoice.invoice_id ? Number(invoice.invoice_id) : (invoice.detalhes?.[0]?.invoice_id ? Number(invoice.detalhes[0].invoice_id) : null);
          if (!invoice_id_raw) {
            console.log("[SYNC] Pulando invoice sem ID:", JSON.stringify(invoice.detalhes?.[0]));
            continue;
          }

          if (vistos.has(invoice_id_raw)) { 
            duplicados++; 
            continue; 
          }
          vistos.add(invoice_id_raw);

          const invoice_id = BigInt(invoice_id_raw);
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

            const item_id = item.item_id ? BigInt(item.item_id) : BigInt(Math.floor(Math.random() * 1000000000));

            faturamentos.push({
              origem: 'particular',
              documento_id: invoice_id,
              item_id: item_id,
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
              paciente_nome: invoice.paciente_nome || invoice.paciente || invoice.detalhes?.[0]?.responsavel || null,
              prontuario: invoice.prontuario || null,
              procedimento_nome: item.procedimento_nome || item.procedimento || item.descricao || null,
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
            const pagamento_id = pag.pagamento_id ? BigInt(pag.pagamento_id) : BigInt(Math.floor(Math.random() * 1000000000));
            
            recebimentos.push({
              origem: 'particular',
              documento_id: invoice_id,
              pagamento_id: pagamento_id,
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
          console.log(`[SYNC] Gravando ${lista.length} invoices da janela ${ds} a ${de}`);
          
          const chunk = <T,>(arr: T[], n: number) => arr.reduce<T[][]>((acc, v, i) => {
            if (i % n === 0) acc.push([]);
            acc[acc.length - 1].push(v);
            return acc;
          }, []);

          if (headers.length > 0) {
            const { error: hErr } = await supabaseAdmin.from("lab_invoice_header").upsert(headers, { onConflict: "invoice_id" });
            if (hErr) {
              console.error("[SYNC] Erro Headers:", hErr);
              throw new Error(`Erro DB Headers: ${hErr.message}`);
            }
          }
          
          if (faturamentos.length > 0) {
            for (const bloco of chunk(faturamentos, 50)) {
              const { error: fErr } = await supabaseAdmin.from("lab_faturamento").upsert(bloco, { onConflict: "origem,documento_id,item_id" });
              if (fErr) {
                console.error("[SYNC] Erro detalhado faturamento:", JSON.stringify(fErr), "Amostra bloco:", JSON.stringify(bloco[0]));
                throw new Error(`Erro DB Faturamento: ${fErr.message}`);
              }
            }
          }
          
          if (recebimentos.length > 0) {
            for (const bloco of chunk(recebimentos, 50)) {
              const { error: rErr } = await supabaseAdmin.from("lab_recebimento").upsert(bloco, { onConflict: "origem,documento_id,pagamento_id" });
              if (rErr) throw new Error(`Erro DB Recebimento: ${rErr.message}`);
            }
          }
          console.log(`[SYNC] Sucesso na janela.`);
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
            erro: "concluido",
            amostra_raw: windowAmostra.length > 0 ? windowAmostra[0] : null
          });
        }

      } catch (err: any) {
        const isMemoryError = err.message?.includes("memory size") || (err.message === "RETRY_SPLIT");
        const isTimeout = err.name === 'AbortError' || err.message === 'timeout';

        if ((isMemoryError || isTimeout) && spanDias > 1) {
          const metade = Math.floor(spanDias / 2);
          const meioFim = new Date(janela.ini);
          meioFim.setDate(janela.ini.getDate() + metade - 1);
          const meioIni = new Date(meioFim);
          meioIni.setDate(meioFim.getDate() + 1);

          fila.unshift({ ini: meioIni, fim: janela.fim });
          fila.unshift({ ini: new Date(janela.ini), fim: meioFim });
          
          resumo.janelas.push({ ds, de, status: 'split', error: `${isTimeout ? 'Timeout' : 'Memória'}: dividida` });
        } else {
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
    }

    if (!dry_run) {
      console.log(`[SYNC] Fim do processamento. Enriquecendo dados via RPC.`);
      await supabaseAdmin.rpc("lab_enriquecer_faturamento");
    }

    return resumo;
  });

export const getLabRelatorio = createServerFn({ method: "GET" })
  .inputValidator((data: { 
    data_inicio: string; 
    data_fim: string; 
  }) => data)
  .handler(async ({ data }) => {
    const { data_inicio, data_fim } = data;
    
    const { data: rows, error } = await supabaseAdmin
      .from("lab_faturamento")
      .select(`
        *,
        pacientes(nome),
        procedimentos(nome),
        profissionais(nome),
        convenios(nome)
      `)
      .gte("data_competencia", data_inicio)
      .lte("data_competencia", data_fim)
      .order("data_competencia", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return rows || [];
  });

export const labSyncProducao = createServerFn({ method: "POST" })
  .inputValidator((data: { start_date: string; end_date: string; dry_run?: boolean }) => data)
  .handler(async ({ data }) => {
    const { start_date, end_date, dry_run = false } = data;
    const resumo = {
      total: 0,
      inseridos: 0,
      erros: 0,
      logs: [] as string[]
    };

    const ds = toFeegowDate(start_date, "/");
    const de = toFeegowDate(end_date, "/");

    const fetchReport = async (reportSlug: string) => {
      resumo.logs.push(`Tentando relatório: ${reportSlug} (${ds} a ${de})`);
      
      if (!dry_run) {
        await supabaseAdmin.from("lab_sync_log").insert({
          endpoint: `reports/generate:${reportSlug}`,
          parametros: { ds, de, dry_run },
          api_success: false,
          registros: 0,
          erro: "iniciado"
        });
      }
      const res = await fetch(`${FEEGOW_BASE}/reports/generate`, {
        method: "POST",
        headers: {
          "x-access-token": FEEGOW_TOKEN(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          report: reportSlug,
          DATA_INICIO: ds,
          DATA_FIM: de
        })
      });
      return await res.json();
    };

    let reportRes = await fetchReport("production");
    
    // Fallback para duration-of-service se production vier vazio/false
    if (!reportRes.success || !reportRes.data || (Array.isArray(reportRes.data) && reportRes.data.length === 0)) {
      resumo.logs.push(`Relatório 'production' sem dados ou erro. Iniciando fallback para 'duration-of-service'.`);
      reportRes = await fetchReport("duration-of-service");
    }

    if (reportRes.success && Array.isArray(reportRes.data)) {
      const rows = reportRes.data;
      resumo.total = rows.length;
      resumo.logs.push(`Processando ${rows.length} registros da API.`);

      const records = rows.map((r: any) => {
        // Safe conversion to BigInt or null
        const toBigInt = (val: any) => {
          if (val === undefined || val === null || val === "") return null;
          try {
            return BigInt(val);
          } catch (e) {
            console.error(`[SYNC-PRODUCAO] Erro ao converter BigInt: ${val}`, e);
            return null;
          }
        };

        return {
          feegow_id: toBigInt(r.id) || BigInt(Math.floor(Math.random() * 1000000000)),
          paciente_id: toBigInt(r.PacienteID),
          paciente_nome: r.NomePaciente || null,
          prontuario: r.Prontuario || r.ProntuarioPaciente || null,
          agendamento_id: toBigInt(r.AgendamentoID),
          data_execucao: parseDataFeegow(r.Data),
          hora_inicio: r.HoraInicio || r.Hora || null,
          profissional_id: toBigInt(r.ProfissionalID),
          profissional_nome: r.NomeProfissional || null,
          procedimento_id: toBigInt(r.ProcedimentoID),
          procedimento_nome: r.NomeProcedimento || null,
          valor: typeof r.Valor === 'number' ? r.Valor : Number(String(r.Valor || 0).replace(/[^\d.,]/g, '').replace('.', '').replace(',', '.')),
          convenio_nome: r.Origem || null,
          unidade_id: toBigInt(r.UnidadeID),
          payload_raw: r
        };
      });

      if (!dry_run && records.length > 0) {
        const chunk = <T,>(arr: T[], n: number) => arr.reduce<T[][]>((acc, v, i) => {
          if (i % n === 0) acc.push([]);
          acc[acc.length - 1].push(v);
          return acc;
        }, []);

        for (const bloco of chunk(records, 50)) {
          const { error: fErr } = await supabaseAdmin.from("lab_producao_feegow").upsert(bloco, { onConflict: "feegow_id" });
          if (fErr) {
            resumo.erros += bloco.length;
            resumo.logs.push(`Erro DB: ${fErr.message}`);
          } else {
            resumo.inseridos += bloco.length;
          }
        }
      }
    }
    
    if (resumo.inseridos > 0 && !dry_run) {
      await supabaseAdmin.from("lab_sync_log").insert({
        endpoint: `reports/generate:success`,
        parametros: { ds, de, report: reportRes.success ? 'found' : 'fallback' },
        api_success: true,
        registros: resumo.inseridos,
        erro: "concluido"
      });
    }

    return resumo;
  });

export const getLabConciliacao = createServerFn({ method: "GET" })
  .inputValidator((data: { 
    data_inicio: string; 
    data_fim: string; 
  }) => data)
  .handler(async ({ data }) => {
    const { data_inicio, data_fim } = data;
    
    // Antes de buscar a conciliação, garantimos que a agenda base do período está sincronizada
    // na lab_dim_agendamento para possíveis enriquecimentos futuros
    await syncAgendaPeriodo(data_inicio, data_fim);
    

    
    // 1. Buscar atendimentos realizados na produção
    const { data: agenda, error: aErr } = await supabaseAdmin
      .from("lab_producao_feegow")
      .select(`
        feegow_id,
        agendamento_id,
        data_execucao,
        valor,
        paciente_id,
        profissional_id,
        procedimento_id,
        paciente_nome,
        procedimento_nome,
        prontuario
      `)
      .gte("data_execucao", data_inicio)
      .lte("data_execucao", data_fim)
      .order("data_execucao", { ascending: false });


    if (aErr) throw aErr;

    // 1.1 Buscar nomes em tabelas separadas para evitar problemas de join no TS/RPC
    const { data: pacientes } = await supabaseAdmin.from("pacientes").select("paciente_id, nome, prontuario");
    const { data: profissionais } = await supabaseAdmin.from("profissionais").select("profissional_id, nome");
    const { data: procedimentos } = await supabaseAdmin.from("procedimentos").select("procedimento_id, nome");

    const pacMap = new Map((pacientes || []).map(p => [p.paciente_id, { nome: p.nome, prontuario: p.prontuario }]));
    const profMap = new Map((profissionais || []).map(p => [p.profissional_id, p.nome]));
    const procMap = new Map((procedimentos || []).map(p => [p.procedimento_id, p.nome]));


    // 2. Buscar faturamento experimental vinculado aos agendamentos
    const ids = Array.from(new Set(agenda?.map(a => a.agendamento_id).filter(Boolean).map(id => Number(id))));
    
    // Mapeamento granular: agendamento_id -> lista de itens de faturamento
    const faturamentoPorAgendamento = new Map<number, any[]>();
    
    if (ids.length > 0) {
      const chunk = 1000;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        const { data: fats, error: fErr } = await supabaseAdmin
          .from("lab_faturamento")
          .select("agendamento_id, item_id, valor_faturado, procedimento_id, documento_id")
          .in("agendamento_id", slice);
        
        if (fErr) throw fErr;
        
        for (const f of fats || []) {
          if (f.agendamento_id) {
            const id = Number(f.agendamento_id);
            const list = faturamentoPorAgendamento.get(id) || [];
            list.push(f);
            faturamentoPorAgendamento.set(id, list);
          }
        }
      }
    }

    // 2.5 Buscar formas de pagamento e origens vinculadas aos documentos
    const allDocIds = Array.from(new Set(
      Array.from(faturamentoPorAgendamento.values()).flat().map(f => Number(f.documento_id)).filter(Boolean)
    ));
    const docToPay = new Map<number, string[]>();
    const docToOrigem = new Map<number, string>();
    
    if (allDocIds.length > 0) {
      const formaNomes: Record<number, string> = {
        1: "Dinheiro", 2: "Cheque", 3: "Cartão de Crédito", 4: "Cartão de Débito",
        6: "Boleto", 7: "Depósito/Transferência", 8: "Pix", 9: "Convênio", 10: "Convênio", 15: "Faturamento"
      };

      const [pays, fats] = await Promise.all([
        supabaseAdmin.from("lab_recebimento").select("documento_id, forma_pagamento").in("documento_id", allDocIds),
        supabaseAdmin.from("lab_faturamento").select("documento_id, origem").in("documento_id", allDocIds)
      ]);
        
      for (const p of pays.data || []) {
        const doc = Number(p.documento_id);
        const fPag = p.forma_pagamento as number;
        const desc = (fPag != null ? formaNomes[fPag] : null) || `Forma ${fPag}`;
        const existing = docToPay.get(doc) || [];
        if (!existing.includes(desc)) docToPay.set(doc, [...existing, desc]);
      }

      for (const f of fats.data || []) {
        docToOrigem.set(Number(f.documento_id), f.origem);
      }
    }


    // 3. Cruzar dados sem agrupar por agendamento (cada linha da produção é um item)
    // Controle de quais itens de faturamento já foram "consumidos" para evitar duplicidade
    const faturamentosUsados = new Set<string>();

    const conciliado = (agenda || []).map(a => {
      const agId = Number(a.agendamento_id);
      const feegowId = a.feegow_id ? String(a.feegow_id) : `temp-${Math.random()}`;
      const valorTabela = Number(a.valor || 0);
      const procId = a.procedimento_id ? Number(a.procedimento_id) : null;
      
      const itensFaturamento = faturamentoPorAgendamento.get(agId) || [];
      
      // Tenta encontrar um item de faturamento que bata com o procedimento
      let itemVinculado = itensFaturamento.find(f => 
        !faturamentosUsados.has(String(f.item_id)) && 
        (procId ? Number(f.procedimento_id) === procId : true)
      );

      // Se não achou pelo procedimento, pega qualquer um disponível para este agendamento que ainda não foi usado
      if (!itemVinculado) {
        itemVinculado = itensFaturamento.find(f => !faturamentosUsados.has(String(f.item_id)));
      }

      if (itemVinculado) {
        faturamentosUsados.add(String(itemVinculado.item_id));
      }

      // NOVO: Priorizamos o valor do Faturamento sobre o valor da Produção (valor_tabela)
      // O usuário diz que os 30 da produção estão errados e o valor real está no sistema (financeiro).
      // Se não houver faturamento e o valor da produção for 30, tratamos como pendente.
      const valorFaturado = itemVinculado ? Number(itemVinculado.valor_faturado || 0) : 0;
      
      const valorReferencia = itemVinculado ? valorFaturado : valorTabela;
      const diferenca = valorFaturado - valorReferencia;
      
      // FORMA DE PAGAMENTO: Se não houver recebimento, tentamos inferir pela origem do faturamento (Convênio)
      let formasPagamento = itemVinculado ? (docToPay.get(Number(itemVinculado.documento_id)) || []) : [];
      if (formasPagamento.length === 0 && itemVinculado) {
        // Se o faturamento é de convênio, mostramos "Convênio"
        const docId = Number(itemVinculado.documento_id);
        const origem = docToOrigem.get(docId);
        if (origem === 'convenio' || origem === 'convenio_estimado') {
          formasPagamento = ["Convênio"];
        }
      }
      
      let status = "IGUAL";
      if (!itemVinculado) {
        status = (valorTabela === 30) ? "PENDENTE_FATURA" : "SEM_FATURA";
      } else if (Math.abs(diferenca) > 0.01) {
        status = "DIVERGENTE";
      }

      return {
        feegow_id: feegowId,
        agendamento_id: agId,
        data: a.data_execucao,
        paciente: a.paciente_nome || (a.paciente_id ? pacMap.get(a.paciente_id)?.nome : null) || "N/A",
        prontuario: a.prontuario || (a.paciente_id ? pacMap.get(a.paciente_id)?.prontuario : null) || "—",
        profissional: (a.profissional_id ? profMap.get(a.profissional_id) : null) || "N/A",
        procedimento: a.procedimento_nome || (a.procedimento_id ? procMap.get(a.procedimento_id) : null) || "N/A",
        valor_tabela: valorReferencia,
        valor_faturado: valorFaturado,
        diferenca,
        status,
        formas_pagamento: formasPagamento
      };
    });

    return conciliado;
  });

export const getLabFaturamentoItems = createServerFn({ method: "GET" })
  .inputValidator((data: { agendamento_id: number }) => data)
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("lab_faturamento")
      .select("*")
      .eq("agendamento_id", data.agendamento_id);
    
    if (error) throw error;
    return rows || [];
  });


