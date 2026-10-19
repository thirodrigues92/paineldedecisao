import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DashboardDateFilter } from "@/components/DashboardDateFilter";
import { DreLancamentosSheet, type DreDrawerAlvo } from "@/components/DreLancamentosSheet";
import { useFilters } from "@/lib/filters-context";
import { brl, pct } from "@/lib/format";
import {
  dreQueryKey, fetchDre, FIXAS, GRUPOS_FIXOS, GRUPOS_FORA, GRUPOS_PENDENTES, GRUPOS_VARIAVEIS,
  MARGEM, mesesAnteriores, mesesEntre, mesRange, RESULTADO, totais,
} from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Visão Executiva" },
      { name: "description", content: "Receita, margem, resultado e ponto de equilíbrio da clínica." },
      { property: "og:title", content: "Financeiro — Visão Executiva" },
      { property: "og:description", content: "Receita, margem, resultado e ponto de equilíbrio da clínica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroExecutivo,
});

type Tom = "ok" | "warn" | "bad";

function metricas(t: Record<string, number>) {
  const rec = t["Receita"] ?? 0;
  const mc = t[MARGEM] ?? 0;
  const ro = t[RESULTADO] ?? 0;
  const fixas = t[FIXAS] ?? 0;
  const p = (v: number) => (rec ? (v / rec) * 100 : 0);
  const mcPct = p(mc);
  return {
    rec, mcPct, roPct: p(ro), repPct: p(t["Repasses médicos"] ?? 0), pesPct: p(t["Pessoal"] ?? 0),
    pe: mcPct > 0 ? fixas / (mcPct / 100) : 0,
  };
}

function FinanceiroExecutivo() {
  const f = useFilters();
  const init = useRef(false);
  useEffect(() => { if (!init.current) { init.current = true; f.setPreset("month"); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [alvo, setAlvo] = useState<DreDrawerAlvo>(null);
  const q = useQuery({ queryKey: dreQueryKey("competencia"), queryFn: () => fetchDre("competencia") });

  const meses = useMemo(() => mesesEntre(f.from, f.to), [f.from, f.to]);
  const prevMeses = useMemo(
    () => (f.compareFrom && f.compareTo ? mesesEntre(f.compareFrom, f.compareTo) : mesesAnteriores(meses)),
    [meses, f.compareFrom, f.compareTo],
  );
  const rows = q.data ?? [];
  const tA = totais(rows, meses);
  const tP = totais(rows, prevMeses);
  const a = metricas(tA);
  const b = metricas(tP);
  const range = mesRange(meses);
  const cmp = mesRange(prevMeses);
  const abrir = (grupo: string, titulo: string) => setAlvo({ grupo, titulo, ...range, cmpFrom: cmp.from, cmpTo: cmp.to });

  const tomPct = (v: number, ok: number, warn: number, menorMelhor = false): Tom =>
    menorMelhor ? (v <= ok ? "ok" : v <= warn ? "warn" : "bad") : (v >= ok ? "ok" : v >= warn ? "warn" : "bad");

  const cards = [
    { label: "Receita", valor: brl(a.rec), atual: a.rec, ant: b.rec, rel: true, tom: (a.rec >= b.rec ? "ok" : a.rec >= b.rec * 0.9 ? "warn" : "bad") as Tom, grupo: "Receita" },
    { label: "Margem de contribuição", valor: pct(a.mcPct), atual: a.mcPct, ant: b.mcPct, tom: tomPct(a.mcPct, 40, 25), grupo: MARGEM },
    { label: "Resultado operacional", valor: pct(a.roPct), atual: a.roPct, ant: b.roPct, tom: tomPct(a.roPct, 15, 5), grupo: RESULTADO },
    { label: "Repasse % da receita", valor: pct(a.repPct), atual: a.repPct, ant: b.repPct, tom: tomPct(a.repPct, 35, 45, true), grupo: "Repasses médicos", menorMelhor: true },
    { label: "Pessoal % da receita", valor: pct(a.pesPct), atual: a.pesPct, ant: b.pesPct, tom: tomPct(a.pesPct, 20, 30, true), grupo: "Pessoal", menorMelhor: true },
    { label: "Ponto de equilíbrio", valor: brl(a.pe), atual: a.pe, ant: b.pe, rel: true, tom: (a.rec >= a.pe * 1.1 ? "ok" : a.rec >= a.pe ? "warn" : "bad") as Tom, grupo: FIXAS, menorMelhor: true },
  ];

  const alertas = useMemo(() => {
    const out: { txt: string; peso: number }[] = [];
    for (const g of [...GRUPOS_VARIAVEIS, ...GRUPOS_FIXOS, ...GRUPOS_FORA]) {
      const va = tA[g] ?? 0, vp = tP[g] ?? 0;
      const pa = a.rec ? (va / a.rec) * 100 : 0, pp = b.rec ? (vp / b.rec) * 100 : 0;
      const dpp = pa - pp;
      const drel = vp > 0 ? ((va - vp) / vp) * 100 : 0;
      if (Math.abs(dpp) > 10 || (vp > 0 && Math.abs(drel) > 30)) {
        const nome = g === "Repasses médicos" ? "Repasse" : g;
        out.push({ txt: `${nome} ${dpp >= 0 ? "subiu" : "caiu"} de ${pct(pp)} para ${pct(pa)} da receita.`, peso: Math.max(Math.abs(dpp), Math.abs(drel) / 3) });
      }
    }
    return out.sort((x, y) => y.peso - x.peso).slice(0, 3).map((x) => x.txt);
  }, [tA, tP, a.rec, b.rec]);

  const pendente = GRUPOS_PENDENTES.reduce((s, g) => s + (tA[g] ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro — Visão Executiva</h1>
          <p className="text-sm text-muted-foreground">Regime de competência · comparado ao período anterior.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/financeiro/dre">Ver DRE</Link></Button>
          <DashboardDateFilter />
        </div>
      </div>

      {pendente > 0 && (
        <div className="rounded-md border border-warning/50 bg-warning/15 p-3 text-sm flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span><b>{brl(pendente)}</b> sem classificação — o resultado pode mudar.</span>
          <Link to="/financeiro/admin-categorias" className="underline font-medium">Classificar categorias</Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const delta = c.ant ? ((c.atual - c.ant) / Math.abs(c.ant)) * 100 : 0;
          const sobe = delta > 0.05, desce = delta < -0.05;
          const cor = c.tom === "ok" ? "text-success" : c.tom === "warn" ? "text-warning" : "text-destructive";
          const borda = c.tom === "ok" ? "border-l-success" : c.tom === "warn" ? "border-l-warning" : "border-l-destructive";
          return (
            <Card key={c.label} className={`cursor-pointer border-l-4 ${borda} hover:bg-accent/40 transition`} onClick={() => abrir(c.grupo, c.label)}>
              <CardContent className="p-5">
                <div className="text-sm text-muted-foreground">{c.label}</div>
                {q.isLoading ? <Skeleton className="h-9 w-40 mt-2" /> : (
                  <div className={`text-3xl font-semibold mt-2 ${cor}`}>{c.valor}</div>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                  {sobe ? <ArrowUpRight className="h-4 w-4" /> : desce ? <ArrowDownRight className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                  {c.ant ? `${pct(Math.abs(delta))} vs período anterior` : "sem base anterior"}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-2">Alertas</div>
          {alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma variação relevante em relação ao período anterior.</p>
          ) : (
            <ul className="space-y-1 text-sm">{alertas.map((t) => <li key={t} className="flex gap-2"><AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />{t}</li>)}</ul>
          )}
        </CardContent>
      </Card>

      <DreLancamentosSheet alvo={alvo} regime="competencia" onClose={() => setAlvo(null)} />
    </div>
  );
}
