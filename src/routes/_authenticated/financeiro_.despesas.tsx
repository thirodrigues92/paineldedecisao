import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, Treemap, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend, LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { axisProps, tooltipProps } from "@/lib/chart-theme";
import { brl, num, pct } from "@/lib/format";
import { GRUPOS_FORA, mesKey, mesLabel } from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/financeiro_/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas — Financeiro" },
      { name: "description", content: "Para onde vai o dinheiro: despesas por grupo, categoria, mês e fornecedor." },
      { property: "og:title", content: "Despesas — Financeiro" },
      { property: "og:description", content: "Para onde vai o dinheiro: despesas por grupo, categoria, mês e fornecedor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DespesasPage,
});

type Desp = { data: string; mes: string; fornecedor: string; categoria: string; grupo: string; valor: number };

async function fetchDespesas(desde: string): Promise<Desp[]> {
  const sb = supabase as any;
  const { data: cats, error: e1 } = await sb.from("vw_dre_categorias").select("categoria_origem, grupo_dre");
  if (e1) throw e1;
  const mapa = new Map<string, string>((cats ?? []).map((c: any) => [c.categoria_origem, c.grupo_dre]));
  const out: Desp[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("financeiro_lancamentos")
      .select("data_vencimento, descricao_item, categoria, valor")
      .eq("tipo", "despesa").gte("data_vencimento", desde).order("data_vencimento").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const categoria = r.categoria ?? "Não classificado";
      out.push({
        data: r.data_vencimento, mes: String(r.data_vencimento).slice(0, 7),
        fornecedor: (r.descricao_item ?? "").trim() || "Sem descrição",
        categoria, grupo: mapa.get(categoria) ?? "Não classificado", valor: Number(r.valor || 0),
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const cor = (i: number) => `var(--chart-${(i % 5) + 1})`;
type Agg = { nome: string; valor: number; qtd: number };
function agrupar(rows: Desp[], key: (r: Desp) => string): Agg[] {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const k = key(r);
    const a = m.get(k) ?? { nome: k, valor: 0, qtd: 0 };
    a.valor += r.valor; a.qtd += 1; m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor);
}

function Dica({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = p.valor ?? p.value ?? payload[0].value;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs text-popover-foreground shadow">
      <div className="font-medium mb-1">{p.nome ?? p.name ?? payload[0].name}</div>
      <div>Valor: {brl(v)}</div>
      {total ? <div>% do total: {pct((v / total) * 100)}</div> : null}
      {p.qtd != null && <div>Lançamentos: {num(p.qtd)}</div>}
      {p.variacao != null && <div>Vs mês anterior: {p.variacao > 0 ? "+" : ""}{pct(p.variacao)}</div>}
    </div>
  );
}

function DespesasPage() {
  const [operacional, setOperacional] = useState(true);
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ titulo: string; filtro: (r: Desp) => boolean } | null>(null);
  const [busca, setBusca] = useState("");

  const meses12 = useMemo(() => {
    const h = new Date();
    return Array.from({ length: 12 }, (_, i) => mesKey(new Date(h.getFullYear(), h.getMonth() - 11 + i, 1)));
  }, []);
  const q = useQuery({ queryKey: ["fin-despesas", meses12[0]], queryFn: () => fetchDespesas(`${meses12[0]}-01`) });

  const rows = useMemo(() => (q.data ?? []).filter((r) => !operacional || !GRUPOS_FORA.includes(r.grupo)), [q.data, operacional]);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  const grupos = useMemo(() => agrupar(rows, (r) => r.grupo), [rows]);
  const corGrupo = new Map(grupos.map((g, i) => [g.nome, cor(i)]));

  const treemap = useMemo(() => {
    if (!grupoSel) return grupos.map((g) => ({ name: g.nome, nome: g.nome, size: g.valor, valor: g.valor, qtd: g.qtd, fill: corGrupo.get(g.nome) }));
    return agrupar(rows.filter((r) => r.grupo === grupoSel), (r) => r.categoria)
      .map((c, i) => ({ name: c.nome, nome: c.nome, size: c.valor, valor: c.valor, qtd: c.qtd, fill: cor(i) }));
  }, [grupos, grupoSel, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalTree = treemap.reduce((s, t) => s + t.valor, 0);

  const pareto = useMemo(() => {
    let acc = 0;
    return agrupar(rows, (r) => r.categoria).map((c) => {
      const antes = acc; acc += c.valor;
      return { ...c, acumulado: total ? (acc / total) * 100 : 0, top80: total ? (antes / total) * 100 < 80 : false };
    });
  }, [rows, total]);
  const n80 = pareto.filter((p) => p.top80).length;

  const empilhado = useMemo(() => meses12.map((m) => {
    const o: Record<string, any> = { mes: mesLabel(m) };
    for (const r of rows) if (r.mes === m) o[r.grupo] = (o[r.grupo] ?? 0) + r.valor;
    return o;
  }), [rows, meses12]);

  const mesesComDado = [...new Set(rows.map((r) => r.mes))].sort();
  const mesAtual = mesesComDado[mesesComDado.length - 1];
  const mesAnt = mesAtual ? mesKey(new Date(Number(mesAtual.slice(0, 4)), Number(mesAtual.slice(5)) - 2, 1)) : undefined;
  const fornecedores = useMemo(() => {
    if (!mesAtual) return [];
    const ant = new Map(agrupar(rows.filter((r) => r.mes === mesAnt), (r) => r.fornecedor).map((a) => [a.nome, a.valor]));
    return agrupar(rows.filter((r) => r.mes === mesAtual), (r) => r.fornecedor).slice(0, 10).map((f) => {
      const p = ant.get(f.nome);
      return { ...f, variacao: p ? ((f.valor - p) / p) * 100 : null, rotulo: p ? `${f.valor >= p ? "▲" : "▼"} ${pct(Math.abs(((f.valor - p) / p) * 100))}` : "novo" };
    });
  }, [rows, mesAtual, mesAnt]);
  const totalMes = rows.filter((r) => r.mes === mesAtual).reduce((s, r) => s + r.valor, 0);

  const lanc = useMemo(() => {
    if (!drawer) return [];
    const b = busca.trim().toLowerCase();
    return rows.filter(drawer.filtro).filter((r) => !b || `${r.fornecedor} ${r.categoria} ${r.data}`.toLowerCase().includes(b)).sort((a, b2) => b2.valor - a.valor);
  }, [drawer, rows, busca]);

  const loading = q.isLoading;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Despesas</h1>
          <p className="text-sm text-muted-foreground">Últimos 12 meses (por vencimento) · total {brl(total)} em {num(rows.length)} lançamentos.</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="op" checked={operacional} onCheckedChange={setOperacional} />
          <Label htmlFor="op">Somente operacional</Label>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{grupoSel ? `Categorias em ${grupoSel}` : "Despesas por grupo"}</CardTitle>
          {grupoSel && <Button variant="outline" size="sm" onClick={() => setGrupoSel(null)}>← Voltar aos grupos</Button>}
        </CardHeader>
        <CardContent className="h-[460px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={treemap} dataKey="size" isAnimationActive={false}
                content={<TreeCell /> as any}
                onClick={(n: any) => {
                  const nome = n?.nome ?? n?.name;
                  if (!nome) return;
                  if (!grupoSel) setGrupoSel(nome);
                  else { const g = grupoSel; setDrawer({ titulo: `${nome} · ${g}`, filtro: (r) => r.grupo === g && r.categoria === nome }); }
                }}>
                <Tooltip content={<Dica total={totalTree} />} />
              </Treemap>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pareto das categorias</CardTitle>
          <p className="text-sm text-muted-foreground">{n80} de {pareto.length} categorias somam 80% das despesas (destacadas).</p>
        </CardHeader>
        <CardContent className="h-[460px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={pareto} margin={{ bottom: 90 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis {...axisProps} dataKey="nome" fontSize={10} interval={0} angle={-45} textAnchor="end" height={90} />
                <YAxis {...axisProps} yAxisId="v" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis {...axisProps} yAxisId="p" orientation="right" domain={[0, 100]} fontSize={11} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<Dica total={total} />} />
                <Bar yAxisId="v" dataKey="valor" onClick={(d: any) => setDrawer({ titulo: d.nome, filtro: (r) => r.categoria === d.nome })} className="cursor-pointer">
                  {pareto.map((p, i) => <Cell key={i} fill={p.top80 ? "var(--chart-1)" : "var(--muted-foreground)"} fillOpacity={p.top80 ? 1 : 0.35} />)}
                </Bar>
                <Line yAxisId="p" dataKey="acumulado" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Despesas por mês e grupo</CardTitle></CardHeader>
        <CardContent className="h-[440px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={empilhado}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis {...axisProps} dataKey="mes" fontSize={11} />
                <YAxis {...axisProps} fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip {...tooltipProps} formatter={(v: any, n: any, p: any) => {
                  const tot = Object.entries(p.payload).filter(([k]) => k !== "mes").reduce((s, [, x]) => s + Number(x), 0);
                  const mes = meses12[empilhado.indexOf(p.payload)];
                  const qtd = rows.filter((r) => r.mes === mes && r.grupo === n).length;
                  return [`${brl(Number(v))} · ${pct((Number(v) / (tot || 1)) * 100)} · ${num(qtd)} lanç.`, n];
                }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {grupos.map((g) => <Bar key={g.nome} dataKey={g.nome} stackId="s" fill={corGrupo.get(g.nome)} />)}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 fornecedores {mesAtual && `· ${mesLabel(mesAtual)}`}</CardTitle>
          <p className="text-sm text-muted-foreground">Pela descrição do lançamento · variação vs {mesAnt ? mesLabel(mesAnt) : "mês anterior"}.</p>
        </CardHeader>
        <CardContent className="h-[460px]">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fornecedores} layout="vertical" margin={{ left: 20, right: 80 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis {...axisProps} type="number" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis {...axisProps} type="category" dataKey="nome" width={220} fontSize={11} />
                <Tooltip content={<Dica total={totalMes} />} />
                <Bar dataKey="valor" fill="var(--chart-2)" radius={[0, 4, 4, 0]} className="cursor-pointer"
                  onClick={(d: any) => setDrawer({ titulo: d.nome, filtro: (r) => r.fornecedor === d.nome && r.mes === mesAtual })}>
                  <LabelList dataKey="rotulo" position="right" fontSize={11} fill="var(--foreground)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!drawer} onOpenChange={(o) => { if (!o) { setDrawer(null); setBusca(""); } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer?.titulo}</SheetTitle>
            <SheetDescription>{num(lanc.length)} lançamentos · {brl(lanc.reduce((s, r) => s + r.valor, 0))}</SheetDescription>
          </SheetHeader>
          <Input className="mt-4" placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <table className="w-full text-sm mt-3">
            <thead className="text-muted-foreground text-left"><tr><th className="py-1">Data</th><th>Fornecedor</th><th>Categoria</th><th className="text-right">Valor</th></tr></thead>
            <tbody>
              {lanc.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1.5 whitespace-nowrap pr-2">{r.data.split("-").reverse().join("/")}</td>
                  <td className="pr-2">{r.fornecedor}</td>
                  <td className="pr-2 text-muted-foreground">{r.categoria}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{brl(r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TreeCell(props: any) {
  const { x, y, width, height, nome, name, valor, fill } = props;
  if (!width || !height || width < 0 || height < 0) return null;
  const label = nome ?? name;
  return (
    <g className="cursor-pointer">
      <rect x={x + 1} y={y + 1} width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)} rx={6} fill={fill ?? "var(--chart-1)"} fillOpacity={0.85} />
      {width > 70 && height > 34 && label && (
        <>
          <text x={x + 8} y={y + 18} fontSize={12} fontWeight={600} fill="var(--foreground)">{String(label).slice(0, Math.floor(width / 7))}</text>
          <text x={x + 8} y={y + 34} fontSize={11} fill="var(--foreground)">{brl(valor)}</text>
        </>
      )}
    </g>
  );
}
