import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { brl, num, pct } from "@/lib/format";

type L = { data_vencimento: string | null; categoria: string | null; descricao_item: string | null; valor: number };

async function fetchDespesas(from: string, to: string): Promise<L[]> {
  const out: L[] = [];
  for (let p = 0; p < 50; p++) {
    const { data, error } = await (supabase as any).from("financeiro_lancamentos")
      .select("data_vencimento, categoria, descricao_item, valor")
      .eq("tipo", "despesa").gte("data_vencimento", from).lte("data_vencimento", to)
      .order("id").range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []).map((r: any) => ({ ...r, valor: Number(r.valor || 0) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");
const cat = (c: string | null) => (c && c.trim() ? c.trim() : "Não classificado");

export function DespesasPorCategoria({ from, to, cmpFrom, cmpTo }: { from: string; to: string; cmpFrom: string; cmpTo: string }) {
  const qa = useQuery({ queryKey: ["desp-cat", from, to], queryFn: () => fetchDespesas(from, to) });
  const qb = useQuery({ queryKey: ["desp-cat", cmpFrom, cmpTo], queryFn: () => fetchDespesas(cmpFrom, cmpTo) });
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [top, setTop] = useState(15);

  const linhas = useMemo(() => {
    const m = new Map<string, { categoria: string; atual: number; comp: number; qa: number; qb: number }>();
    const get = (c: string) => m.get(c) ?? (m.set(c, { categoria: c, atual: 0, comp: 0, qa: 0, qb: 0 }), m.get(c)!);
    for (const r of qa.data ?? []) { const g = get(cat(r.categoria)); g.atual += r.valor; g.qa++; }
    for (const r of qb.data ?? []) { const g = get(cat(r.categoria)); g.comp += r.valor; g.qb++; }
    return [...m.values()].sort((a, b) => b.atual - a.atual || b.comp - a.comp);
  }, [qa.data, qb.data]);

  const totA = linhas.reduce((s, l) => s + l.atual, 0);
  const totB = linhas.reduce((s, l) => s + l.comp, 0);
  const b = busca.trim().toLowerCase();
  const filtradas = b ? linhas.filter((l) => l.categoria.toLowerCase().includes(b)) : linhas;
  const grafico = filtradas.slice(0, top);

  const detalhe = (rows: L[] | undefined) => (rows ?? []).filter((r) => cat(r.categoria) === sel).sort((x, y) => y.valor - x.valor);

  if (qa.isLoading || qb.isLoading) return <Card><CardContent className="p-4"><Skeleton className="h-96 w-full" /></CardContent></Card>;
  if (qa.isError || qb.isError) return <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar as despesas.</CardContent></Card>;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Despesas por categoria</div>
            <p className="text-sm text-muted-foreground">
              Atual ({fmt(from)}–{fmt(to)}): <b className="text-foreground">{brl(totA)}</b> · Comparação ({fmt(cmpFrom)}–{fmt(cmpTo)}): <b className="text-foreground">{brl(totB)}</b>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8 w-60" placeholder="Buscar categoria..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {[10, 15, 30].map((n) => (
              <Button key={n} size="sm" variant={top === n ? "default" : "outline"} onClick={() => setTop(n)}>Top {n}</Button>
            ))}
          </div>
        </div>

        <div style={{ height: Math.max(320, grafico.length * 38) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} layout="vertical" margin={{ left: 10, right: 30 }} onClick={(e: any) => e?.activeLabel && setSel(e.activeLabel)}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => brl(v).replace(",00", "")} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis type="category" dataKey="categoria" width={200} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                cursor={{ fill: "hsl(var(--accent) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number, n: string, p: any) => {
                  const t = n === "Período atual" ? totA : totB;
                  const q = n === "Período atual" ? p.payload.qa : p.payload.qb;
                  return [`${brl(v)} · ${pct(t ? (v / t) * 100 : 0)} do total · ${num(q)} lanç.`, n];
                }}
              />
              <Legend />
              <Bar dataKey="atual" name="Período atual" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} className="cursor-pointer">
                {grafico.map((g) => <Cell key={g.categoria} fillOpacity={!sel || sel === g.categoria ? 1 : 0.35} />)}
              </Bar>
              <Bar dataKey="comp" name="Comparação" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} className="cursor-pointer">
                {grafico.map((g) => <Cell key={g.categoria} fillOpacity={!sel || sel === g.categoria ? 0.8 : 0.25} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr className="border-b border-border">
                <th className="text-left py-2">Categoria</th><th className="text-right">Atual</th><th className="text-right">% total</th>
                <th className="text-right">Comparação</th><th className="text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => {
                const d = l.atual - l.comp;
                const dp = l.comp ? (d / l.comp) * 100 : null;
                return (
                  <tr key={l.categoria} onClick={() => setSel(sel === l.categoria ? null : l.categoria)}
                    className={`border-b border-border cursor-pointer hover:bg-accent/40 ${sel === l.categoria ? "bg-accent/50" : ""}`}>
                    <td className="py-2">{l.categoria}</td>
                    <td className="text-right tabular-nums">{brl(l.atual)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{pct(totA ? (l.atual / totA) * 100 : 0)}</td>
                    <td className="text-right tabular-nums">{brl(l.comp)}</td>
                    <td className={`text-right tabular-nums ${d > 0 ? "text-destructive" : d < 0 ? "text-success" : ""}`}>
                      <span className="inline-flex items-center gap-1">
                        {d > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : d < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : null}
                        {brl(d)}{dp !== null && ` (${pct(dp)})`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Lançamentos de “{sel}”</div>
              <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Fechar</Button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <ListaLanc titulo="Período atual" rows={detalhe(qa.data)} />
              <ListaLanc titulo="Comparação" rows={detalhe(qb.data)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ListaLanc({ titulo, rows }: { titulo: string; rows: L[] }) {
  const [busca, setBusca] = useState("");
  const b = busca.trim().toLowerCase();
  const f = b ? rows.filter((r) => `${r.descricao_item} ${fmt(r.data_vencimento)} ${r.valor}`.toLowerCase().includes(b)) : rows;
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-sm font-medium">{titulo} · {num(f.length)} · <b>{brl(f.reduce((s, r) => s + r.valor, 0))}</b></div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar despesa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <ul className="divide-y divide-border max-h-80 overflow-y-auto">
        {f.length === 0 ? <li className="py-2 text-sm text-muted-foreground">Nenhum lançamento.</li> : f.map((r, i) => (
          <li key={i} className="py-2 flex justify-between gap-3 text-sm">
            <div className="min-w-0"><div className="truncate">{r.descricao_item ?? "—"}</div><div className="text-xs text-muted-foreground">{fmt(r.data_vencimento)}</div></div>
            <div className="tabular-nums shrink-0">{brl(r.valor)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
