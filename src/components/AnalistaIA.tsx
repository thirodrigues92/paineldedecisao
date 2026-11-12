import { useMemo, useRef, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Send, Copy, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { perguntarAnalista } from "@/lib/analista-ia.functions";

type Row = { data_execucao: string; profissional_nome: string | null; procedimento_nome: string | null; grupo_nome: string | null; convenio_nome: string | null; valor: any; valor_pago: any };
type Msg = { role: "user" | "assistant"; content: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function agrupar(rows: Row[], key: (r: Row) => string, limite = 60) {
  const m = new Map<string, { v: number; q: number }>();
  for (const r of rows) {
    const k = key(r) || "Não informado";
    const e = m.get(k) ?? { v: 0, q: 0 };
    e.v += Number(r.valor) || 0; e.q += 1; m.set(k, e);
  }
  return [...m.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, limite)
    .map(([k, e]) => `${k}: ${brl(e.v)} | ${e.q} itens | ticket ${brl(e.q ? e.v / e.q : 0)}`).join("\n");
}

function montarContexto(rows: Row[], periodo: string) {
  const total = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
  const profConv = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.profissional_nome || "Sem profissional"} × ${r.convenio_nome || "Particular"}`;
    profConv.set(k, (profConv.get(k) ?? 0) + (Number(r.valor) || 0));
  }
  const pc = [...profConv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 120).map(([k, v]) => `${k}: ${brl(v)}`).join("\n");
  return [
    `Período filtrado: ${periodo}`,
    `Faturamento total: ${brl(total)} | Itens: ${rows.length}`,
    `\n## Por dia\n${agrupar(rows, (r) => r.data_execucao, 400).split("\n").sort().join("\n")}`,
    `\n## Por profissional\n${agrupar(rows, (r) => r.profissional_nome || "")}`,
    `\n## Por convênio\n${agrupar(rows, (r) => r.convenio_nome || "Particular")}`,
    `\n## Por categoria\n${agrupar(rows, (r) => r.grupo_nome || "")}`,
    `\n## Top procedimentos\n${agrupar(rows, (r) => r.procedimento_nome || "", 80)}`,
    `\n## Profissional × convênio\n${pc}`,
  ].join("\n");
}

const SUGESTOES = [
  "Faça um resumo executivo do período com pontos positivos e de alerta.",
  "Quanto o Particular representou do total?",
  "Quais dias tiveram faturamento atípico?",
  "Quem tem o maior ticket médio?",
];

export function AnalistaIA({ rows, periodo }: { rows: Row[]; periodo: string }) {
  const perguntar = useServerFn(perguntarAnalista);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contexto = useMemo(() => montarContexto(rows, periodo), [rows, periodo]);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, carregando]);

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || carregando) return;
    const novas: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(novas); setTexto(""); setCarregando(true);
    try {
      const r = await perguntar({ data: { contexto, mensagens: novas } });
      setMsgs([...novas, { role: "assistant", content: r.ok ? r.texto : `⚠️ ${r.erro}` }]);
    } catch {
      setMsgs([...novas, { role: "assistant", content: "⚠️ Não foi possível obter a análise agora." }]);
    } finally {
      setCarregando(false); inputRef.current?.focus();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Analista IA</CardTitle>
          <CardDescription>Pergunte o que quiser sobre o faturamento de {periodo} ({rows.length} itens). A conversa lembra o contexto.</CardDescription>
        </div>
        {msgs.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setMsgs([])}><RotateCcw className="mr-1 h-4 w-4" /> Nova conversa</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[560px] min-h-[200px] space-y-4 overflow-y-auto rounded-md border bg-muted/30 p-4">
          {msgs.length === 0 && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Escreva livremente sua pergunta. Algumas ideias:</p>
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <Button key={s} variant="secondary" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => enviar(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="group relative">
              <div className="prose prose-sm max-w-none dark:prose-invert [&_table]:text-xs [&_td]:border [&_th]:border [&_td]:px-2 [&_th]:px-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
              <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Resposta copiada"); }}>
                <Copy className="mr-1 h-3 w-3" /> Copiar
              </Button>
            </div>
          ))}
          {carregando && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analisando os dados…</div>}
          <div ref={fimRef} />
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <Textarea ref={inputRef} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
            placeholder="Ex.: Qual médico mais cresceu no particular e o que isso representa no total?"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          <Button type="submit" disabled={carregando || !texto.trim()} size="icon" className="h-10 w-10 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
