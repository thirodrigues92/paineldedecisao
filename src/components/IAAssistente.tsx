import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Copy, FileSpreadsheet, History, Loader2, Plus, Send, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { perguntarIA } from "@/lib/ia-agente.functions";
import { useFilters } from "@/lib/filters-context";
import { setIA, useIA, type IAMsg } from "@/lib/ia-assistente-store";

const SUG = {
  dre: ["Quanto gastei com pessoal este ano?", "Por que o resultado caiu no último mês?", "Quais as 10 maiores despesas do ano?"],
  fat: ["Quais médicos mais faturaram este mês?", "Compare este mês com o anterior por especialidade"],
  exec: ["Resumo da clínica este mês e o que melhorar"],
};

function contexto(rota: string, aba: string | null): "dre" | "fat" | "exec" {
  const k = `${rota} ${aba ?? ""}`;
  if (k.includes("dre")) return "dre";
  if (k.includes("faturamento")) return "fat";
  return "exec";
}

/** Extrai tabelas GFM de um texto markdown. */
export function tabelasMarkdown(md: string): string[][][] {
  const linhas = md.split("\n");
  const out: string[][][] = [];
  let atual: string[][] = [];
  const cel = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\*\*/g, ""));
  for (const l of linhas) {
    if (/^\s*\|.*\|\s*$/.test(l)) {
      if (/^\s*\|?\s*:?-{2,}/.test(l.replace(/\|/g, "|").trim().replace(/^\|/, ""))) continue;
      atual.push(cel(l));
    } else if (atual.length) { out.push(atual); atual = []; }
  }
  if (atual.length) out.push(atual);
  return out;
}

function numBR(v: string): string | number {
  const s = v.replace(/R\$\s?/g, "").replace(/%$/, "").trim();
  if (/^-?[\d.]+(,\d+)?$/.test(s)) { const n = Number(s.replace(/\./g, "").replace(",", ".")); if (Number.isFinite(n)) return v.trim().endsWith("%") ? n / 100 : n; }
  return v;
}

async function exportar(md: string) {
  const tabs = tabelasMarkdown(md);
  if (!tabs.length) return;
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  tabs.forEach((t, i) => {
    const sheet = XLSX.utils.aoa_to_sheet(t.map((r, ri) => (ri === 0 ? r : r.map(numBR))));
    XLSX.utils.book_append_sheet(wb, sheet, `Tabela ${i + 1}`);
  });
  XLSX.writeFile(wb, `analise-ia-${format(new Date(), "yyyy-MM-dd-HHmm")}.xlsx`);
}

function Mensagem({ m }: { m: IAMsg }) {
  if (m.role === "user") return <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.content}</div>;
  const temTabela = tabelasMarkdown(m.content).length > 0;
  return (
    <div className="space-y-1">
      {!!m.passos?.length && <ul className="space-y-0.5 text-xs text-muted-foreground">{m.passos.map((p, i) => <li key={i}>✓ {p.descricao}{p.erro ? " (falhou)" : ""}</li>)}</ul>}
      <div className={`text-sm leading-relaxed [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1.5 prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1 ${m.erro ? "text-destructive" : "text-foreground"}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
          table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="min-w-full text-xs">{children}</table></div>,
          th: ({ children }) => <th className="whitespace-nowrap border-b border-border px-2 py-1 text-left">{children}</th>,
          td: ({ children }) => <td className="whitespace-nowrap border-b border-border/50 px-2 py-1">{children}</td>,
        }}>{m.content}</ReactMarkdown>
      </div>
      {temTabela && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copiado"); }}><Copy className="mr-1 h-3 w-3" />Copiar</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => exportar(m.content)}><FileSpreadsheet className="mr-1 h-3 w-3" />Exportar Excel</Button>
        </div>
      )}
    </div>
  );
}

type Conv = { id: string; pergunta: string; resposta: string | null; criado_em: string; ferramentas_usadas: any };

export function IAAssistente() {
  const s = useIA();
  const rota = useRouterState({ select: (st) => st.location.pathname });
  const f = useFilters();
  const perguntar = useServerFn(perguntarIA);
  const [texto, setTexto] = useState("");
  const [pulso, setPulso] = useState(false);
  const [historico, setHistorico] = useState<Conv[] | null>(null);
  const [passoAtual, setPassoAtual] = useState(0);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("ia_assistente_visto")) { setPulso(true); localStorage.setItem("ia_assistente_visto", "1"); }
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [s.mensagens, s.carregando, passoAtual]);
  useEffect(() => {
    if (!s.carregando) return;
    setPassoAtual(0);
    const t = setInterval(() => setPassoAtual((n) => n + 1), 2500);
    return () => clearInterval(t);
  }, [s.carregando]);

  const ctx = contexto(rota, s.aba);
  const periodoTxt = `${format(f.from, "dd/MM/yyyy")} a ${format(f.to, "dd/MM/yyyy")}`;

  async function enviar(q: string) {
    const pergunta = q.trim();
    if (!pergunta || s.carregando) return;
    setTexto("");
    const msgs: IAMsg[] = [...s.mensagens, { role: "user", content: pergunta }];
    setIA({ mensagens: msgs, carregando: true });
    try {
      const filtros: Record<string, string | number | null> = {
        periodo: periodoTxt,
        comparacao: f.compareFrom && f.compareTo ? `${format(f.compareFrom, "dd/MM/yyyy")} a ${format(f.compareTo, "dd/MM/yyyy")}` : null,
        unidade: f.unidadeIds.length ? f.unidadeIds.join(",") : "todas",
        convenio_tipo: f.convenioTipo,
        aba: s.aba,
      };
      if (s.dreFiltros) { filtros["ano"] = s.dreFiltros.ano; filtros["regime"] = s.dreFiltros.regime; filtros["unidade_dre"] = s.dreFiltros.unidade; }
      const r = await perguntar({ data: { mensagens: msgs.slice(-30).map(({ role, content }) => ({ role, content })), tela: { rota, filtros_ativos: filtros } } });
      setIA((st) => ({ mensagens: [...st.mensagens, r.ok ? { role: "assistant", content: r.texto, passos: r.passos } : { role: "assistant", content: r.erro, passos: r.passos, erro: true }] }));
    } catch (e: any) {
      const msg = String(e?.message ?? e).includes("401") || String(e).includes("Unauthorized") ? "Faça login para usar a IA." : "Não foi possível obter a análise agora.";
      setIA((st) => ({ mensagens: [...st.mensagens, { role: "assistant", content: msg, erro: true }] }));
    } finally { setIA({ carregando: false }); }
  }

  async function abrirHistorico() {
    setHistorico([]);
    const { data, error } = await supabase.from("ia_conversas").select("id, pergunta, resposta, criado_em, ferramentas_usadas").order("criado_em", { ascending: false }).limit(20);
    if (error) { toast.error("Não foi possível carregar o histórico."); setHistorico(null); return; }
    setHistorico((data ?? []) as Conv[]);
  }

  const passosEstimados = ["Entendendo a pergunta…", "Consultando os dados…", "Cruzando informações…", "Escrevendo a análise…"];

  return (
    <>
      {!s.aberto && (
        <button
          type="button"
          onClick={() => { setIA({ aberto: true }); setPulso(false); }}
          className={`fixed bottom-6 right-6 z-50 flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition hover:scale-105 ${pulso ? "animate-pulse" : ""}`}
          aria-label="Pergunte à IA"
        >
          <Bot className="h-6 w-6" />
          <span className="hidden text-sm font-medium md:inline">Pergunte à IA</span>
        </button>
      )}
      {s.aberto && (
        <div className="fixed inset-0 z-50 flex flex-col border-border bg-background shadow-2xl md:inset-auto md:bottom-6 md:right-6 md:h-[640px] md:w-[420px] md:rounded-xl md:border">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="flex-1 text-sm font-semibold">Analista IA · Optima Saúde</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Nova conversa" aria-label="Nova conversa" onClick={() => { setIA({ mensagens: [] }); setHistorico(null); }}><Plus className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Histórico" aria-label="Histórico" onClick={abrirHistorico}><History className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" title="Fechar" aria-label="Fechar" onClick={() => setIA({ aberto: false })}><X className="h-4 w-4" /></Button>
          </div>

          {historico ? (
            <div className="flex-1 overflow-y-auto p-3">
              <button className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setHistorico(null)}><ArrowLeft className="h-3 w-3" />Voltar</button>
              {historico.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>}
              <ul className="space-y-1">
                {historico.map((c) => (
                  <li key={c.id}>
                    <button className="w-full rounded-md p-2 text-left hover:bg-muted" onClick={() => {
                      setIA({ mensagens: [{ role: "user", content: c.pergunta }, { role: "assistant", content: c.resposta ?? "", passos: Array.isArray(c.ferramentas_usadas) ? c.ferramentas_usadas : [] }] });
                      setHistorico(null);
                    }}>
                      <div className="line-clamp-2 text-sm">{c.pergunta}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(c.criado_em), "dd/MM/yyyy HH:mm")}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              {s.mensagens.length === 0 && (
                <div className="space-y-3 pt-4">
                  <p className="text-sm text-muted-foreground">Pergunte o que quiser sobre faturamento, despesas, DRE, agenda ou pacientes. Eu consulto os dados e respondo com a análise.</p>
                  <div className="flex flex-wrap gap-2">
                    {SUG[ctx].map((q) => <button key={q} onClick={() => enviar(q)} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">{q}</button>)}
                  </div>
                </div>
              )}
              {s.mensagens.map((m, i) => <Mensagem key={i} m={m} />)}
              {s.carregando && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{passosEstimados[Math.min(passoAtual, passosEstimados.length - 1)]}</div>
              )}
              <div ref={fim} />
            </div>
          )}

          <div className="border-t border-border p-2">
            <div className="flex items-end gap-2">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
                placeholder="Pergunte à IA…"
                rows={2}
                className="min-h-[44px] resize-none text-sm"
              />
              <Button size="icon" className="h-10 w-10 shrink-0" disabled={!texto.trim() || s.carregando} onClick={() => enviar(texto)} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
