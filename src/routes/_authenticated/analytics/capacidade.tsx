import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey } from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { num, pct } from "@/lib/format";
import { useAppSettings } from "@/lib/app-settings";
import { AlertCircle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";

export const Route = createFileRoute("/_authenticated/analytics/capacidade")({
  head: () => ({ meta: [{ title: "Capacidade — Análises" }] }),
  component: CapacidadePage,
});

function CapacidadePage() {
  const f = useFilters();
  const settings = useAppSettings();

  const q = useQuery({
    queryKey: dashboardQueryKey("vw_ocupacao_prof", f),
    queryFn: async () => {
      let cq = supabase
        .from("vw_analytics_ocupacao_prof")
        .select("profissional, profissional_id, data, minutos_ocupados, agendamentos")
        .gte("data", f.from.toISOString().slice(0, 10))
        .lte("data", f.to.toISOString().slice(0, 10))
        .limit(10_000);
      if (f.profissionalIds.length) cq = cq.in("profissional_id", f.profissionalIds);
      const { data, error } = await cq;
      if (error) throw error;
      return data as any[];
    },
  });

  const meta = settings.data?.meta_ocupacao_pct ?? 85;
  const cap = settings.data?.capacidade_diaria_min ?? 480;
  const rows = q.data ?? [];

  // Ocupação por profissional (média % no período)
  const byProf = new Map<string, { sum: number; dias: number; ags: number }>();
  for (const r of rows) {
    const key = r.profissional ?? "—";
    const cur = byProf.get(key) ?? { sum: 0, dias: 0, ags: 0 };
    cur.sum += Number(r.minutos_ocupados || 0);
    cur.dias += 1;
    cur.ags += Number(r.agendamentos || 0);
    byProf.set(key, cur);
  }
  const chart = Array.from(byProf.entries())
    .map(([nome, v]) => ({
      nome,
      ocupacao: v.dias ? (v.sum / (v.dias * cap)) * 100 : 0,
      agendamentos: v.ags,
    }))
    .sort((a, b) => b.ocupacao - a.ocupacao)
    .slice(0, 20);

  const mediaGeral = chart.length ? chart.reduce((s, c) => s + c.ocupacao, 0) / chart.length : 0;
  const abaixoMeta = chart.filter((c) => c.ocupacao < meta).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Capacidade</h1>
        <p className="text-sm text-muted-foreground">
          Ocupação real (minutos/agendados ÷ capacidade diária de {cap} min). Meta: {meta}%.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Ocupação média</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-3xl font-semibold ${mediaGeral >= meta ? "text-primary" : "text-warning"}`}>
              {mediaGeral.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">Meta {meta}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Profissionais abaixo da meta</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-warning">{abaixoMeta}</div>
            <div className="text-xs text-muted-foreground mt-1">de {chart.length} analisados</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total de agendamentos</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{num(chart.reduce((s, c) => s + c.agendamentos, 0))}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ocupação por profissional (%)</CardTitle>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Duração premissa 30 min por agendamento (Feegow não retorna duração real).
          </p>
        </CardHeader>
        <CardContent className="h-96">
          {q.isLoading ? <Skeleton className="h-full w-full" /> : chart.length === 0 ? (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} layout="vertical" margin={{ left: 140 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis {...axisProps} type="category" dataKey="nome" width={130} tick={{ fontSize: 11 }} />
                <Tooltip {...tooltipProps} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <ReferenceLine x={meta} stroke="var(--chart-3)" strokeDasharray="4 4" label={{ value: `Meta ${meta}%`, position: "top", fill: "var(--chart-3)" }} />
                <Bar dataKey="ocupacao" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
