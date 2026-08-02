import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey, fetchDashboardAppointments } from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num, pct } from "@/lib/format";
import { AlertCircle } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics/comercial")({
  head: () => ({ meta: [{ title: "Comercial — Análises" }] }),
  component: ComercialPage,
});

function ComercialPage() {
  const f = useFilters();

  const q = useQuery({
    queryKey: dashboardQueryKey("analytics-comercial", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });

  const leadQuery = useQuery({
    queryKey: dashboardQueryKey("vw_analytics_lead_time", f),
    queryFn: async () => {
      let lq = supabase
        .from("vw_analytics_lead_time")
        .select("especialidade, especialidade_id, lead_days, data")
        .gte("data", f.from.toISOString().slice(0, 10))
        .lte("data", f.to.toISOString().slice(0, 10));
      if (f.especialidadeIds.length) lq = lq.in("especialidade_id", f.especialidadeIds);
      const { data, error } = await lq;
      if (error) throw error;
      return data as { especialidade: string; lead_days: number; data: string }[];
    },
  });

  // Funil: agendados → confirmados → realizados → no-show/cancelados
  const rows = q.data ?? [];
  const total = rows.length;
  const realizado = rows.filter((r) => r.status_agendamento?.categoria === "realizado").length;
  const noShow = rows.filter((r) => r.status_agendamento?.categoria === "no_show").length;
  const cancelado = rows.filter((r) => r.status_agendamento?.categoria === "cancelado").length;
  const agendado = total - realizado - noShow - cancelado;

  const funil = [
    { etapa: "Agendados", valor: total },
    { etapa: "Ativos", valor: agendado + realizado },
    { etapa: "Realizados", valor: realizado },
  ];

  // Lead time por especialidade (média)
  const leadRows = leadQuery.data ?? [];
  const leadMap = new Map<string, { sum: number; count: number }>();
  for (const l of leadRows) {
    const cur = leadMap.get(l.especialidade) ?? { sum: 0, count: 0 };
    cur.sum += Number(l.lead_days || 0);
    cur.count += 1;
    leadMap.set(l.especialidade, cur);
  }
  const leadChart = Array.from(leadMap.entries())
    .map(([nome, v]) => ({ nome, media: v.count ? v.sum / v.count : 0 }))
    .sort((a, b) => b.media - a.media)
    .slice(0, 10);

  // Primeira consulta vs retorno
  const primeirasConsultas = rows.filter((r) => r.primeiro_agendamento).length;
  const retornos = rows.length - primeirasConsultas;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Comercial</h1>
        <p className="text-sm text-muted-foreground">Funil de conversão, lead time e novos pacientes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Taxa de realização</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{pct(total ? realizado / total : 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">{num(realizado)} de {num(total)} agendamentos</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Novos pacientes</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{num(primeirasConsultas)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {pct(total ? primeirasConsultas / total : 0)} do total · {num(retornos)} retornos
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Perda (no-show + cancelamento)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-destructive">{pct(total ? (noShow + cancelado) / total : 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {num(noShow)} no-show · {num(cancelado)} cancelados
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Funil de conversão</CardTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Sem dados de canal na origem — funil consolidado sem quebra por origem.
            </p>
          </CardHeader>
          <CardContent className="h-72">
            {q.isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funil} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="etapa" width={90} />
                  <Tooltip formatter={(v: any) => num(v)} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Lead time médio por especialidade (dias)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {leadQuery.isLoading ? <Skeleton className="h-full w-full" /> : leadChart.length === 0 ? (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">
                Sem dados de <code>agendado_em</code> no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadChart} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="nome" width={110} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)} dias`} />
                  <Bar dataKey="media" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
