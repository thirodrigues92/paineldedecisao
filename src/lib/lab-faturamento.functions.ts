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
  await supabaseAdmin.from("lab_faturamento_legado").delete().neq("documento_id", 0);
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
    // IMPORTANTE: A sincronização da agenda deve popular apenas lab_dim_agendamento.
    // Nunca deve inserir linhas na lab_producao_feegow, que é exclusiva para produção real.
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
      await supabaseAdmin.from("lab_faturamento_legado").delete().gte("data_competencia", data_inicio).lte("data_competencia", data_fim).eq("tipo_transacao", tipo_transacao);
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
              const { error: fErr } = await supabaseAdmin.from("lab_faturamento_legado").upsert(bloco, { onConflict: "origem,documento_id,item_id" });
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
          // Gatilho do RPC de enriquecimento
          await supabaseAdmin.rpc('lab_enriquecer_faturamento');

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
      .from("lab_producao_feegow")
      .select("*")
      .gte("data_execucao", data_inicio)
      .lte("data_execucao", data_fim)
      .order("data_execucao", { ascending: false })
      .order("paciente_nome", { ascending: true })
      .limit(2000);

    if (error) throw error;
    
    // Mapear para o formato que a tela espera (compatibilidade com lab_faturamento)
    return (rows || []).map(r => ({
      ...r,
      // Mapeamento de campos para compatibilidade UI
      data_competencia: r.data_execucao,
      valor_faturado: r.valor,
      valor_recebido: r.valor_pago || 0,
      is_cancelado: r.situacao === 'Cancelado',
      origem: r.situacao_conta === 'Em aberto' && (r.valor_pago || 0) === 0 ? 'convenio_pendente_preco' : 'faturado',
      categoria_final: r.convenio_id ? 'convenio' : 'particular',
      // Mock objects para o componente que espera relações .pacientes.nome etc
      pacientes: { nome: r.paciente_nome },
      procedimentos: { nome: r.procedimento_nome },
      profissionais: { nome: r.profissional_nome },
      convenios: { nome: r.convenio_nome }
    }));
  });

export const labSyncProducao = createServerFn({ method: "POST" })
  .inputValidator((data: { start_date: string; end_date: string; dry_run?: boolean }) => data)
  .handler(async ({ data }) => {
    const { start_date, end_date, dry_run = false } = data;
    const resumo = { total: 0, inseridos: 0, erros: 0, logs: [] as string[] };

    const ds = toFeegowDate(start_date, "/");
    const de = toFeegowDate(end_date, "/");

    // Parser robusto de valor BR: aceita "5,04", "1.234,56", number, null
    const parseValorBR = (v: any): number => {
      if (v === null || v === undefined || v === "") return 0;
      if (typeof v === "number") return v;
      const s = String(v).trim();
      if (s.includes(",")) {
        return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
      }
      return Number(s) || 0;
    };

    // Hash determinístico string -> bigint positivo (pra manter feegow_id preenchido e estável,
    // mesmo não sendo mais a chave de upsert)
    const hashToBigInt = (s: string): bigint => {
      let h = 5381n;
      for (let i = 0; i < s.length; i++) {
        h = ((h * 33n) + BigInt(s.charCodeAt(i))) & 0xFFFFFFFFFFFFn;
      }
      return h;
    };

    resumo.logs.push(`Chamando reports/generate com parâmetros completos (${ds} a ${de})`);

    if (!dry_run) {
      await supabaseAdmin.from("lab_sync_log").insert({
        endpoint: "reports/generate:production-detalhado",
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
        report: "production",
        DATA_INICIO: ds,
        DATA_FIM: de,
        UNIDADE_IDS: [0],
        TIPO_DATA_PRODUCAO: ["EXECUCAO"],
        EXECUCAO_ITEM: ["S", "N"] // S=Faturado, N=Não Faturado/Outros. Traz ~583 itens para 19/08/2026.
      })
    });
    const reportRes = await res.json();

    if (reportRes.success && Array.isArray(reportRes.data)) {
      const rows = reportRes.data;
      resumo.total = rows.length;
      resumo.logs.push(`Processando ${rows.length} itens de execução da API.`);

      const records = rows.map((r: any) => {
        const toBigInt = (val: any) => {
          if (val === undefined || val === null || val === "") return null;
          try { return BigInt(val); } catch { return null; }
        };

        const idTransacao = String(r.IDTransacao ?? "");
        const nGuia = String(r.NGuiaPrestador ?? "");
        const procId = String(r.ProcedimentoID ?? "");
        const agId = String(r.AgendamentoID ?? "");
        const chaveNatural = `${idTransacao}|${nGuia}|${procId}|${agId}`;

        const item = {
          feegow_id: hashToBigInt(chaveNatural),
          id_transacao: idTransacao || null,
          n_guia_prestador: nGuia || null,
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
          valor: parseValorBR(r.Valor),
          valor_pago: parseValorBR(r.ValorPago),
          convenio_id: r.ConvenioID != null ? Number(r.ConvenioID) : null,
          convenio_nome: r.NomeConvenio || r.Origem || null,
          situacao: r.Situacao || null,
          situacao_conta: r.SituacaoConta || null,
          grupo_id: r.GrupoID != null ? Number(r.GrupoID) : null,
          grupo_nome: r.NomeGrupo || null,
          tipo_procedimento: r.TipoProcedimento || null,
          forma_pagamento: r.FormaPagamento || null,
          tipo_guia: r.TipoGuia || null,
          unidade_id: toBigInt(r.UnidadeID),
          payload_raw: r
        };

        // Correção de valores para itens "Não Faturado" (usar ValorPlano se disponível e valor for 0)
        if (item.situacao === 'Não Faturado' && item.valor === 0 && r.ValorPlano > 0) {
          item.valor = Number(r.ValorPlano);
        }

        return item;
      });

      if (!dry_run && records.length > 0) {
        const chunk = <T,>(arr: T[], n: number) => arr.reduce<T[][]>((acc, v, i) => {
          if (i % n === 0) acc.push([]);
          acc[acc.length - 1].push(v);
          return acc;
        }, []);

        for (const bloco of chunk(records, 50)) {
          const { error: fErr } = await supabaseAdmin
            .from("lab_producao_feegow")
            .upsert(bloco, { onConflict: "id_transacao,n_guia_prestador,procedimento_id,agendamento_id" });
          if (fErr) {
            resumo.erros += bloco.length;
            resumo.logs.push(`Erro DB: ${fErr.message}`);
          } else {
            resumo.inseridos += bloco.length;
          }
        }
      }
    } else {
      resumo.logs.push(`API retornou success=false ou data vazio/inválido. Resposta: ${JSON.stringify(reportRes).slice(0, 500)}`);
    }

    if (resumo.inseridos > 0 && !dry_run) {
      await supabaseAdmin.from("lab_sync_log").insert({
        endpoint: "reports/generate:production-detalhado:success",
        parametros: { ds, de },
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
    
    // 1. Buscar atendimentos realizados na produção
    const { data: agenda, error: aErr } = await supabaseAdmin
      .from("lab_producao_feegow")
      .select("*")
      .gte("data_execucao", data_inicio)
      .lte("data_execucao", data_fim)
      .order("data_execucao", { ascending: false })
      .order("paciente_nome", { ascending: true });

    if (aErr) throw aErr;

    // 2. Mapear para o formato de conciliação esperado pela UI
    return (agenda || []).map(r => {
      const valorFaturado = r.valor || 0;
      const valorRecebido = r.valor_pago || 0;
      const saldoAReceber = valorFaturado - valorRecebido;
      
      // Lógica de status solicitada:
      // 1. SEM_FATURA: só quando o item realmente não tem fatura associada (situacao nulo ou diferente de 'Faturado')
      // 2. RECEBIDO: valor pago é igual ou maior que o valor faturado
      // 3. RECEBIDO_PARCIAL: valor pago é maior que zero mas menor que o valor faturado
      // 4. AGUARDANDO_RECEBIMENTO: item faturado, valor_pago = 0 ou nulo
      let status = "AGUARDANDO_RECEBIMENTO"; 
      
      if (!r.situacao || r.situacao !== 'Faturado') {
        status = "SEM_FATURA";
      } else if (valorRecebido >= valorFaturado && valorFaturado > 0) {
        status = "RECEBIDO";
      } else if (valorRecebido > 0 && valorRecebido < valorFaturado) {
        status = "RECEBIDO_PARCIAL";
      } else {
        status = "AGUARDANDO_RECEBIMENTO";
      }

      return {
        feegow_id: r.feegow_id?.toString(),
        agendamento_id: Number(r.agendamento_id),
        data: r.data_execucao,
        prontuario: r.prontuario || "—",
        paciente: r.paciente_nome,
        profissional: r.profissional_nome,
        procedimento: r.procedimento_nome,
        valor_tabela: valorFaturado, // Na produção detalhada, o valor do item é o valor esperado
        valor_faturado: valorFaturado,
        valor_recebido: valorRecebido,
        diferenca: valorRecebido - valorFaturado,
        saldo_a_receber: saldoAReceber,
        status: status,
        situacao: r.situacao,
        situacao_conta: r.situacao_conta,
        convenio_nome: r.convenio_nome,
        local_nome: (r.payload_raw as any)?.NomeLocal || (r.payload_raw as any)?.UnidadeNome || "—",
        unidade_nome: (r.payload_raw as any)?.UnidadeNome || "—",
        formas_pagamento: r.forma_pagamento ? [r.forma_pagamento] : (r.convenio_id ? ["Convênio"] : ["Particular"])
      };
    });
  });

export const getLabFaturamentoItems = createServerFn({ method: "GET" })
  .inputValidator((data: { agendamento_id: number }) => data)
  .handler(async ({ data }) => {
    // Mantemos este apenas para ver detalhes se necessário, mas a fonte agora é produção
    const { data: rows, error } = await supabaseAdmin
      .from("lab_producao_feegow")
      .select("*")
      .eq("agendamento_id", data.agendamento_id);
    
    if (error) throw error;
    return rows || [];
  });

export const labSyncConvenioCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const headers = { "x-access-token": FEEGOW_TOKEN() };
  try {
    const res = await fetch(`${FEEGOW_BASE}/insurance/list`, { headers });
    const body = await res.json();
    const list = body.content || [];
    
    if (!list.length) return { ok: true, count: 0 };

    const convenios = list.map((c: any) => ({
      convenio_id: Number(c.convenio_id),
      nome: c.nome,
      registro_ans: c.registro_ans || null,
      cnpj: c.CNPJ || null,
      atualizado_em: new Date().toISOString()
    }));

    const { error } = await supabaseAdmin.from("lab_convenios").upsert(convenios, { onConflict: "convenio_id" });
    if (error) throw error;

    return { ok: true, count: convenios.length };
  } catch (err: any) {
    console.error("[SYNC-CONVENIOS] Erro:", err);
    throw err;
  }
});

export const labEnrichFaturamento = createServerFn({ method: "POST" })
  .inputValidator((data: { limit?: number }) => data)
  .handler(async ({ data }) => {
    const limit = data.limit || 20;
    const headers = { "x-access-token": FEEGOW_TOKEN() };
    
    // 1. Identificar agendamento_id que estão no faturamento mas não no enriquecimento
    // Fazemos via query direta pois o RPC pode ser pesado ou não estar disponível
    // Paginação obrigatória: o Data API limita a 1000 linhas por select
    const fetchAllIds = async (table: 'lab_faturamento_legado' | 'lab_agendamento_enriquecido') => {
      const ids = new Set<number>();
      const page = 1000;
      for (let from = 0; from < 100000; from += page) {
        let q = supabaseAdmin
          .from(table)
          .select('agendamento_id')
          .order('agendamento_id', { ascending: true })
          .range(from, from + page - 1);
        if (table === 'lab_faturamento_legado') q = q.not('agendamento_id', 'is', null);
        const { data: rows } = await q;
        (rows || []).forEach((r: any) => { if (r.agendamento_id != null) ids.add(Number(r.agendamento_id)); });
        if (!rows || rows.length < page) break;
      }
      return ids;
    };

    const uniqueFatIds = Array.from(await fetchAllIds('lab_faturamento_legado'));
    const enrichedIds = await fetchAllIds('lab_agendamento_enriquecido');
    const toProcess = uniqueFatIds.filter(id => !enrichedIds.has(id)).slice(0, limit);


    if (toProcess.length === 0) return { ok: true, processados: 0, mensagem: "Tudo enriquecido!" };
    
    const resultados = {
      processados: 0,
      sucesso: 0,
      falhas: [] as any[]
    };

    for (const agId of toProcess) {
      try {
        const res = await fetch(`${FEEGOW_BASE}/appoints/search?agendamento_id=${agId}`, { headers });
        const body = await res.json();
        const content = body.content?.appointments || body.content || [];
        
        if (!Array.isArray(content) || content.length === 0) {
          // Se não encontrou agendamento (deletado/cancelado), marca como particular default
          await supabaseAdmin.from('lab_agendamento_enriquecido').upsert({
            agendamento_id: Number(agId),
            categoria_receita: 'particular',
            plano_id: 0,
            sem_dados_agendamento: true,
            atualizado_em: new Date().toISOString()
          });
          resultados.sucesso++;

        } else {
          const a = content[0];
          // Regra de negócio: basta ter convenio_id preenchido para ser convênio (plano_id costuma ser nulo)
          const isConvenio = !!a.convenio_id;
          
          await supabaseAdmin.from('lab_agendamento_enriquecido').upsert({
            agendamento_id: Number(agId),
            convenio_id: a.convenio_id ? Number(a.convenio_id) : null,

            plano_id: a.plano_id ? Number(a.plano_id) : 0,
            categoria_receita: isConvenio ? 'convenio' : 'particular',
            procedimento_id: a.procedimento_id ? Number(a.procedimento_id) : null,
            grupo_procedimento_id: a.grupo_procedimento_id ? Number(a.grupo_procedimento_id) : null,
            especialidade_id: a.especialidade_id ? Number(a.especialidade_id) : null,
            unidade_id: a.unidade_id ? Number(a.unidade_id) : null,
            profissional_id: a.profissional_id ? Number(a.profissional_id) : null,
            status_id: a.status_id ? Number(a.status_id) : null,
            telemedicina: !!a.telemedicina,
            retorno: !!a.retorno,
            primeiro_agendamento: !!a.primeiro_agendamento,
            canal_id: a.canal_id ? Number(a.canal_id) : null,
            sem_dados_agendamento: false,
            atualizado_em: new Date().toISOString()
          });
          resultados.sucesso++;
        }
      } catch (e: any) {
        resultados.falhas.push({ agendamento_id: agId, erro: e.message });
      }
      resultados.processados++;
    }

    return resultados;
  });

export const getLabEnrichmentStatus = createServerFn({ method: "GET" }).handler(async () => {
  const idsUnicos = new Set<number>();
  for (let from = 0; from < 100000; from += 1000) {
    const { data: rows } = await supabaseAdmin
      .from('lab_faturamento_legado')
      .select('agendamento_id')
      .not('agendamento_id', 'is', null)
      .order('agendamento_id', { ascending: true })
      .range(from, from + 999);
    (rows || []).forEach((r) => { if (r.agendamento_id != null) idsUnicos.add(Number(r.agendamento_id)); });
    if (!rows || rows.length < 1000) break;
  }
  const totalUnicos = idsUnicos.size;

  const { count: totalEnriquecido } = await supabaseAdmin
    .from('lab_agendamento_enriquecido')
    .select('*', { count: 'exact', head: true });

  const { data: resumoCategoria } = await supabaseAdmin
    .from('lab_agendamento_enriquecido')
    .select('categoria_receita, sem_dados_agendamento');

  const stats = {
    total: totalUnicos,
    enriquecido: totalEnriquecido || 0,
    pendente: Math.max(0, totalUnicos - (totalEnriquecido || 0)),
    particular: resumoCategoria?.filter(r => r.categoria_receita === 'particular').length || 0,
    convenio: resumoCategoria?.filter(r => r.categoria_receita === 'convenio').length || 0,
    sem_dados: resumoCategoria?.filter((r: any) => r.sem_dados_agendamento).length || 0
  };

  return stats;
});



