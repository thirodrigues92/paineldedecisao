import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "assistant"; content: string };
type Tela = { rota: string; filtros_ativos: Record<string, string | number | null>; resumo_visivel?: string };
type Passo = { ferramenta: string; descricao: string; args: Record<string, string | number | boolean>; linhas: number; erro?: string };

const MAX_TOOL_CALLS = 8;
const MAX_LINHAS = 500;

const d = { type: "string", description: "Data AAAA-MM-DD" };
const nul = (desc: string) => ({ type: ["string", "null"], description: desc });
const enumNul = (vals: string[], desc: string) => ({ type: ["string", "null"], enum: [...vals, null], description: desc });
const obj = (props: Record<string, unknown>) => ({
  type: "object", properties: props, required: Object.keys(props), additionalProperties: false,
});

const TOOLS = [
  { name: "ia_buscar_pessoa", description: "Busca pessoas (pacientes, profissionais, fornecedores, funcionários, convênios) por nome/documento aproximado. Use antes de filtrar por pessoa.",
    parameters: obj({ p_texto: { type: "string", description: "Nome ou parte do nome/documento" } }) },
  { name: "ia_financeiro", description: "Totais financeiros (receitas baixadas e despesas pagas) agregados no período. Agrupa por mes, categoria, grupo, pessoa, pessoa_tipo ou total.",
    parameters: obj({ p_inicio: d, p_fim: d,
      p_tipo: enumNul(["todos", "receita", "despesa"], "Padrão todos"),
      p_pessoa: nul("Filtro por nome da pessoa (parcial)"), p_categoria: nul("Filtro por categoria"), p_grupo: nul("Filtro por grupo DRE"),
      p_regime: enumNul(["pagamento", "competencia"], "Padrão pagamento"),
      p_agrupar: enumNul(["mes", "categoria", "grupo", "pessoa", "pessoa_tipo", "total"], "Padrão mes") }) },
  { name: "ia_financeiro_itens", description: "Lista lançamentos financeiros individuais (maiores valores primeiro) com os mesmos filtros de ia_financeiro.",
    parameters: obj({ p_inicio: d, p_fim: d,
      p_tipo: enumNul(["todos", "receita", "despesa"], "Padrão todos"),
      p_pessoa: nul("Nome da pessoa"), p_categoria: nul("Categoria"), p_grupo: nul("Grupo DRE"),
      p_regime: enumNul(["pagamento", "competencia"], "Padrão pagamento"),
      p_limite: { type: ["integer", "null"], description: "Máx. de linhas (até 500, padrão 100)" } }) },
  { name: "ia_dre", description: "DRE anual completa por linha/grupo e mês (receitas, despesas, resultado, resultado operacional).",
    parameters: obj({ p_ano: { type: "integer" }, p_regime: enumNul(["pagamento", "competencia"], "Padrão pagamento") }) },
  { name: "ia_producao", description: "Produção/faturamento de atendimentos (Feegow) no período. Agrupa por profissional, grupo, procedimento, convenio, origem, mes, dia, forma_pagamento ou total. Origem separa Particular, Convênio e Não faturado; Não Faturado não é um convênio.",
    parameters: obj({ p_inicio: d, p_fim: d,
      p_agrupar: enumNul(["profissional", "grupo", "procedimento", "convenio", "origem", "mes", "dia", "forma_pagamento", "total"], "Padrão profissional"),
      p_profissional: nul("Filtro profissional"), p_convenio: nul("Filtro convênio"), p_grupo: nul("Filtro grupo/categoria") }) },
  { name: "ia_agenda", description: "Agendamentos no período com realizados, faltas e taxa de no-show. Agrupa por status, profissional, dia, procedimento ou total.",
    parameters: obj({ p_inicio: d, p_fim: d, p_agrupar: enumNul(["status", "profissional", "dia", "procedimento", "total"], "Padrão status") }) },
  { name: "ia_pacientes", description: "Pacientes: novos no período, ausentes há 90+ dias, ou distribuição por região.",
    parameters: obj({ p_inicio: d, p_fim: d, p_tipo: enumNul(["novos", "ausentes_90", "regiao"], "Padrão novos") }) },
].map((t) => ({ type: "function", strict: true, ...t }));

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

function fmtD(s: unknown) {
  const m = typeof s === "string" && s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s ?? "");
}
function descrever(nome: string, a: Record<string, unknown>) {
  const per = a["p_inicio"] ? ` ${fmtD(a["p_inicio"])}–${fmtD(a["p_fim"])}` : "";
  switch (nome) {
    case "ia_buscar_pessoa": return `Buscando pessoa "${a["p_texto"]}"…`;
    case "ia_financeiro": return `Consultando ${a["p_tipo"] === "receita" ? "receitas" : a["p_tipo"] === "despesa" ? "despesas" : "financeiro"}${per}${a["p_pessoa"] ? ` de ${a["p_pessoa"]}` : ""}…`;
    case "ia_financeiro_itens": return `Listando lançamentos${per}…`;
    case "ia_dre": return `Montando DRE ${a["p_ano"]}…`;
    case "ia_producao": return `Consultando produção${per}…`;
    case "ia_agenda": return `Consultando agenda${per}…`;
    case "ia_pacientes": return `Consultando pacientes${per}…`;
    default: return `Executando ${nome}…`;
  }
}

function sistema(hoje: string, tela: Tela) {
  return `Você é o Analista Executivo da Optima Saúde: atua como CFO, COO e consultor de gestão de uma clínica médica. Hoje é ${hoje}. Responda em português do Brasil.

COMO TRABALHAR
1. Nunca invente números. Todo valor sai das ferramentas. Se a ferramenta não trouxer, diga o que faltou.
2. Interprete datas naturais: 'de janeiro a novembro' = 01/01 a 30/11 do ano atual; 'mês passado', 'último trimestre', 'este ano' etc. Sempre diga o período usado.
3. Nomes de pessoas: primeiro use ia_buscar_pessoa. Se houver mais de um resultado provável, mostre as opções e pergunte qual é antes de somar.
4. Financeiro: use o regime 'pagamento' (igual ao Feegow) salvo pedido contrário. Repasse médico é despesa. SÓCIOS (distribuição de lucros/pró-labore) e AQUISIÇÃO DE PATRIMÔNIO aparecem separados do resultado operacional.
5. Considere a tela atual do usuário (rota e filtros) quando a pergunta disser 'aqui', 'nesta tela', 'esse período'.

FORMATO DA RESPOSTA
- Primeiro a resposta direta em 1 ou 2 linhas, com o número principal em negrito.
- Depois uma tabela com os dados (mês a mês, por categoria etc.), valores em R$ no formato brasileiro.
- Depois 'O que isso mostra': 2 a 4 pontos de análise (tendência, variação, peso no total, comparação com o período anterior quando fizer sentido; busque o período anterior se ajudar).
- Por fim 'Sugestões': ações práticas e priorizadas (redução de custo, renegociação, metas, precificação, agenda, captação), com o impacto estimado em R$ quando possível.
- Para pedidos de ajuda, ideias ou planos, aja como um executivo: diagnóstico com dados, opções, recomendação e próximos passos.
- Seja direto. Nada de teoria longa.

TELA ATUAL DO USUÁRIO
${JSON.stringify(tela).slice(0, 6000)}`;
}

type GwResult = { ok: true; output: any[]; texto: string; recusa: boolean } | { ok: false; status: number };

async function chamarGateway(key: string, body: unknown, runId: { v?: string }): Promise<GwResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" };
  if (runId.v) headers["X-Lovable-AIG-Run-ID"] = runId.v;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", { method: "POST", headers, body: JSON.stringify(body) });
  runId.v ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
  if (!res.ok || !res.body) {
    console.error("AI gateway", res.status, await res.text().catch(() => ""));
    return { ok: false, status: res.status };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", texto = "", recusa = false;
  let output: any[] | null = null;
  const itens: any[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") texto += ev.delta ?? "";
        else if (ev.type === "response.refusal.delta") recusa = true;
        else if (ev.type === "response.output_item.done" && ev.item) itens.push(ev.item);
        else if (ev.type === "response.completed") output = ev.response?.output ?? null;
        else if (ev.type === "response.failed" || ev.type === "error") return { ok: false, status: 500 };
      } catch { /* parcial */ }
    }
  }
  return { ok: true, output: output ?? itens, texto, recusa };
}

function erroGateway(status: number) {
  if (status === 429) return "Muitas perguntas seguidas. Aguarde alguns segundos e tente de novo.";
  if (status === 402 || status === 403) return "Créditos de IA esgotados ou bloqueados. Recarregue em Configurações → Planos e créditos.";
  return "Não foi possível obter a análise agora.";
}

export const perguntarIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mensagens: Msg[]; tela: Tela }) => {
    if (!Array.isArray(input?.mensagens) || input.mensagens.length === 0 || input.mensagens.length > 30) throw new Error("Mensagens inválidas (1 a 30).");
    const mensagens = input.mensagens.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 8000),
    })) as Msg[];
    const t = input.tela ?? ({} as Tela);
    const tela: Tela = {
      rota: String(t.rota ?? "").slice(0, 300),
      filtros_ativos: t.filtros_ativos && typeof t.filtros_ativos === "object" ? t.filtros_ativos : {},
      ...(t.resumo_visivel ? { resumo_visivel: String(t.resumo_visivel).slice(0, 4000) } : {}),
    };
    return { mensagens, tela };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) return { ok: false as const, erro: "Faça login", passos: [] as Passo[] };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, erro: "IA não configurada.", passos: [] as Passo[] };

    const inicio = Date.now();
    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const input: any[] = data.mensagens.map((m) => ({ role: m.role, content: m.content }));
    const passos: Passo[] = [];
    const runId: { v?: string } = {};
    let chamadas = 0;
    let resposta = "";
    let erro: string | null = null;

    for (let volta = 0; volta <= MAX_TOOL_CALLS; volta++) {
      const r = await chamarGateway(key, {
        model: "openai/gpt-6-astra",
        instructions: sistema(hoje, data.tela),
        input,
        tools: chamadas < MAX_TOOL_CALLS ? TOOLS : [],
        reasoning: { effort: "low" },
        include: ["reasoning.encrypted_content"],
        store: false,
        stream: true,
      }, runId);
      if (!r.ok) { erro = erroGateway(r.status); break; }
      const calls = r.output.filter((it) => it?.type === "function_call");
      if (calls.length === 0) {
        if (r.recusa && !r.texto) erro = "A IA recusou responder esta pergunta.";
        resposta = r.texto || "Sem resposta.";
        break;
      }
      input.push(...r.output);
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(c.arguments || "{}"); } catch { /* vazio */ }
        const limpos: Record<string, string | number | boolean> = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== null && v !== undefined)) as Record<string, string | number | boolean>;
        if (limpos["p_limite"] != null) limpos["p_limite"] = Math.min(Number(limpos["p_limite"]) || 100, MAX_LINHAS);
        let saida: unknown;
        const passo: Passo = { ferramenta: c.name, descricao: descrever(c.name, limpos), args: limpos, linhas: 0 };
        if (chamadas >= MAX_TOOL_CALLS) {
          saida = { erro: "Limite de consultas atingido; responda com o que já tem." };
        } else if (!TOOL_NAMES.has(c.name)) {
          saida = { erro: "Ferramenta desconhecida" };
        } else {
          chamadas++;
          const { data: rows, error } = await (supabase.rpc as any)(c.name, limpos);
          if (error) { passo.erro = error.message; saida = { erro: error.message }; }
          else {
            const arr = Array.isArray(rows) ? rows.slice(0, MAX_LINHAS) : rows;
            passo.linhas = Array.isArray(arr) ? arr.length : arr == null ? 0 : 1;
            saida = { linhas: arr, truncado: Array.isArray(rows) && rows.length > MAX_LINHAS };
          }
          passos.push(passo);
        }
        input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(saida) });
      }
    }

    const duracao_ms = Date.now() - inicio;
    const pergunta = [...data.mensagens].reverse().find((m) => m.role === "user")?.content ?? "";
    const { error: insErr } = await supabase.from("ia_conversas").insert({
      user_id: userId, pergunta, resposta: erro ?? resposta, ferramentas_usadas: passos as any, duracao_ms,
    });
    if (insErr) console.error("ia_conversas insert", insErr.message);

    if (erro) return { ok: false as const, erro, passos, duracao_ms };
    return { ok: true as const, texto: resposta, passos, duracao_ms };
  });
