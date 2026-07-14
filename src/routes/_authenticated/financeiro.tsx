import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { brl } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro" }] }),
  component: FinPage,
});

function FinPage() {
  const f = useFilters();
  const q = useQuery({
    queryKey: ["fin", f.from.toISOString(), f.to.toISOString(), f.unidadeIds],
    queryFn: async () => {
      let query = supabase.from("financeiro_lancamentos").select("tipo, valor, data_vencimento, data_pagamento, status, categoria")
        .gte("data_vencimento", f.from.toISOString().slice(0, 10))
        .lte("data_vencimento", f.to.toISOString().slice(0, 10));
      if (f.unidadeIds.length) query = query.in("unidade_id", f.unidadeIds);
      const { data, error } = await query.limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];
  const receitas = rows.filter((r) => r.tipo === "receita").reduce((s, r) => s + Number(r.valor || 0), 0);
  const despesas = rows.filter((r) => r.tipo === "despesa").reduce((s, r) => s + Number(r.valor || 0), 0);
  const saldo = receitas - despesas;
  const inadimplente = rows.filter((r) => r.tipo === "receita" && r.status !== "pago").reduce((s, r) => s + Number(r.valor || 0), 0);

  const byMonth = new Map<string, { mes: string; receita: number; despesa: number }>();
  for (const r of rows) {
    const m = String(r.data_vencimento).slice(0, 7);
    const cur = byMonth.get(m) ?? { mes: m, receita: 0, despesa: 0 };
    if (r.tipo === "receita") cur.receita += Number(r.valor || 0);
    if (r.tipo === "despesa") cur.despesa += Number(r.valor || 0);
    byMonth.set(m, cur);
  }
  const chart = Array.from(byMonth.values()).sort((a, b) => a.mes.localeCompare(b.mes));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Fluxo de receitas e despesas.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Receitas" value={q.isLoading ? "..." : brl(receitas)} />
        <Kpi label="Despesas" value={q.isLoading ? "..." : brl(despesas)} />
        <Kpi label="Saldo" value={q.isLoading ? "..." : brl(saldo)} tone={saldo < 0 ? "danger" : "ok"} />
        <Kpi label="Inadimplência" value={q.isLoading ? "..." : brl(inadimplente)} tone={inadimplente > 0 ? "warn" : "ok"} />
      </div>
      <Card>
        <CardHeader><CardTitle>Receita x Despesa (por mês)</CardTitle></CardHeader>
        <CardContent className="h-80">
          {q.isLoading ? <Skeleton className="h-full w-full" /> : chart.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem lançamentos no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="receita" fill="var(--chart-2)" />
                <Bar dataKey="despesa" fill="var(--chart-5)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-warning" : "";
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-2 ${color}`}>{value}</div>
    </CardContent></Card>
  );
}
