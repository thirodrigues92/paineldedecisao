import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DreLancamentosSheet, type DreDrawerAlvo } from "@/components/DreLancamentosSheet";
import { axisProps, tooltipProps } from "@/lib/chart-theme";
import { brl, pct } from "@/lib/format";
import {
  dreQueryKey, fetchDre, GRUPOS_FIXOS, GRUPOS_FORA, GRUPOS_VARIAVEIS, MARGEM, mesKey, mesLabel,
  mesRange, ORDEM_DRE, RESULTADO, totais, type Regime,
} from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/financeiro_/dre")({
  head: () => ({
    meta: [
      { title: "DRE — Financeiro" },
      { name: "description", content: "Demonstrativo de resultado mensal com cascata e lançamentos." },
      { property: "og:title", content: "DRE — Financeiro" },
      { property: "og:description", content: "Demonstrativo de resultado mensal com cascata e lançamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DrePage,
});

const CURTO: Record<string, string> = {
  "Repasses médicos": "Repasses", "Insumos e apoio": "Insumos", "Administrativo e outras": "Administrativo",
  [MARGEM]: "Margem contrib.", [RESULTADO]: "Resultado op.",
};

function DrePage() {
  const [regime, setRegime] = useState<Regime>("competencia");
  const [alvo, setAlvo] = useState<DreDrawerAlvo>(null);
  const q = useQuery({ queryKey: dreQueryKey(regime), queryFn: () => fetchDre(regime) });
  const rows = q.data ?? [];

  const meses12 = useMemo(() => {
    const hoje = new Date();
    return Array.from({ length: 12 }, (_, i) => mesKey(new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)));
  }, []);
  const [mesSel, setMesSel] = useState(meses12[11]);

  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.grupo_dre}|${r.mes}`, (m.get(`${r.grupo_dre}|${r.mes}`) ?? 0) + r.valor);
    return m;
  }, [rows]);
  const linhas = ORDEM_DRE.filter((g) => ["Receita", MARGEM, RESULTADO].includes(g) || meses12.some((m) => grid.has(`${g}|${m}`)));

  const t = totais(rows, [mesSel]);
  const cascata = useMemo(() => {
    const out: { nome: string; base: number; valor: number; real: number; kind: "total" | "neg" | "pos" }[] = [];
    let acc = t["Receita"] ?? 0;
    out.push({ nome: "Receita", base: 0, valor: acc, real: acc, kind: "total" });
    const passo = (g: string) => {
      const v = t[g] ?? 0;
      const novo = acc - v;
      out.push({ nome: CURTO[g] ?? g, base: Math.min(acc, novo), valor: Math.abs(v), real: -v, kind: "neg" });
      acc = novo;
    };
    const total = (g: string) => {
      const v = t[g] ?? acc;
      out.push({ nome: CURTO[g] ?? g, base: Math.min(0, v), valor: Math.abs(v), real: v, kind: v >= 0 ? "total" : "neg" });
    };
    GRUPOS_VARIAVEIS.forEach(passo); total(MARGEM);
    ["Pessoal", "Ocupação", "Marketing", "Administrativo e outras", "Pró-labore"].forEach(passo); total(RESULTADO);
    return out;
  }, [t]);

  const abrirCelula = (g: string, mes: string) => setAlvo({ grupo: g, titulo: `${g} · ${mesLabel(mes)}`, ...mesRange([mes]) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">DRE</h1>
          <p className="text-sm text-muted-foreground">
            {regime === "competencia" ? "Competência: receita pela data de produção, despesas pelo vencimento." : "Caixa: receitas e despesas pela data de pagamento."}
          </p>
        </div>
        <ToggleGroup type="single" value={regime} onValueChange={(v) => v && setRegime(v as Regime)} variant="outline">
          <ToggleGroupItem value="competencia">Competência</ToggleGroupItem>
          <ToggleGroupItem value="caixa">Caixa</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Cascata do resultado</CardTitle>
          <Select value={mesSel} onValueChange={setMesSel}>
            <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{[...meses12].reverse().map((m) => <SelectItem key={m} value={m}>{mesLabel(m)}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-96">
          {q.isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cascata}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis {...axisProps} dataKey="nome" fontSize={11} interval={0} />
                <YAxis {...axisProps} fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip {...tooltipProps} formatter={(_v: any, n: any, p: any) => (n === "base" ? null : [brl(p.payload.real), "Valor"])} />
                <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="valor" stackId="a" radius={[4, 4, 0, 0]}>
                  {cascata.map((c, i) => <Cell key={i} fill={c.kind === "total" ? "var(--chart-1)" : c.kind === "neg" ? "var(--destructive)" : "var(--chart-2)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
        <CardContent className="pt-0">
          <div className="text-xs text-muted-foreground mb-2">Fora do resultado operacional</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GRUPOS_FORA.map((g) => (
              <button key={g} onClick={() => abrirCelula(g, mesSel)} className="text-left rounded-md border border-border p-3 hover:bg-accent/40">
                <div className="text-xs text-muted-foreground">{g}</div>
                <div className="text-lg font-semibold">{brl(t[g] ?? 0)}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>DRE — últimos 12 meses</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {q.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <table className="text-sm min-w-full">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2 pr-4 sticky left-0 bg-card">Grupo</th>
                  {meses12.map((m) => <th key={m} className="text-right px-3 whitespace-nowrap">{mesLabel(m)}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((g) => {
                  const destaque = g === "Receita" || g === MARGEM || g === RESULTADO;
                  const fora = GRUPOS_FORA.includes(g);
                  return (
                    <tr key={g} className={`border-t border-border ${destaque ? "font-semibold bg-muted/40" : ""} ${fora ? "text-muted-foreground" : ""}`}>
                      <td className={`py-1.5 pr-4 whitespace-nowrap sticky left-0 ${destaque ? "bg-muted" : "bg-card"} ${GRUPOS_FIXOS.includes(g) || GRUPOS_VARIAVEIS.includes(g) ? "pl-3" : ""}`}>{g}</td>
                      {meses12.map((m) => {
                        const v = grid.get(`${g}|${m}`) ?? 0;
                        const rec = grid.get(`Receita|${m}`) ?? 0;
                        return (
                          <td key={m} onClick={() => abrirCelula(g, m)} className="text-right px-3 whitespace-nowrap cursor-pointer hover:bg-accent/50 tabular-nums">
                            <div className={v < 0 ? "text-destructive" : ""}>{brl(v)}</div>
                            {g !== "Receita" && <div className="text-[10px] text-muted-foreground">{rec ? pct((v / rec) * 100) : "—"}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <DreLancamentosSheet alvo={alvo} regime={regime} onClose={() => setAlvo(null)} />
    </div>
  );
}
