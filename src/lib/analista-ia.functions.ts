import { createServerFn } from "@tanstack/react-start";

type Msg = { role: "user" | "assistant"; content: string };

export const perguntarAnalista = createServerFn({ method: "POST" })
  .inputValidator((input: { contexto: string; mensagens: Msg[] }) => {
    if (typeof input?.contexto !== "string" || input.contexto.length > 200_000) throw new Error("Contexto inválido");
    if (!Array.isArray(input.mensagens) || input.mensagens.length === 0 || input.mensagens.length > 40) throw new Error("Mensagens inválidas");
    const mensagens = input.mensagens.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? "").slice(0, 8000),
    })) as Msg[];
    return { contexto: input.contexto, mensagens };
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false as const, erro: "IA não configurada." };
    const instructions = `Você é um analista financeiro sênior de uma clínica médica. Responda em português do Brasil, de forma livre ao que for perguntado, com base EXCLUSIVAMENTE nos dados abaixo (faturamento/produção do período filtrado, extraídos do Feegow). Use markdown: negrito, listas e tabelas quando útil. Valores em R$ no formato brasileiro. Se a pergunta exigir dado que não está no contexto, diga claramente o que falta e sugira ajustar o período. Não invente números.\n\nDADOS:\n${data.contexto}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions,
        input: data.mensagens.map((m) => ({ role: m.role, content: m.content })),
        reasoning: { effort: "low" },
        store: false,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      console.error("AI gateway", res.status, t);
      const erro = res.status === 429 ? "Muitas perguntas seguidas. Aguarde alguns segundos e tente de novo."
        : res.status === 402 || res.status === 403 ? "Créditos de IA esgotados ou bloqueados. Recarregue em Configurações → Planos e créditos."
        : "Não foi possível obter a análise agora.";
      return { ok: false as const, erro };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", texto = "", recusa = false;
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
          if (ev.type === "response.refusal.delta") recusa = true;
          if (ev.type === "response.failed" || ev.type === "error") {
            return { ok: false as const, erro: "A IA não conseguiu concluir a análise." };
          }
        } catch { /* ignore partial */ }
      }
    }
    if (recusa && !texto) return { ok: false as const, erro: "A IA recusou responder esta pergunta." };
    return { ok: true as const, texto: texto || "Sem resposta." };
  });
