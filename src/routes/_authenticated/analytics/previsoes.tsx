import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num, pct } from "@/lib/format";
import { useAppSettings } from "@/lib/app-settings";
import { AlertTriangle, TrendingUp, TrendingDown, Info } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { useFilters } from "@/lib/filters-context";
import { fetchDashboardAppointments, dashboardQueryKey } from "@/lib/dashboard-data";

export const Route = createFileRoute("/_authenticated/analytics/previsoes")({
  head: () => ({ meta: [{ title: "Previsões & Alertas — Análises" }] }),
  component: PrevisoesPage,
});

function PrevisoesPage() {
  const f = useFilters();
  const settings = useAppSettings();

  const receitaQ = useQuery({
    queryKey: ["vw_receita_mensal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_analytics_receita_mensal")
        .select("*")
        .order("mes", { ascending: true });
      if (error) throw error;
      return data as { mes: string; receita: number; despesa: number }[];
    },
  });

  const agQ = useQuery({
    queryKey: dashboardQueryKey("analytics-previsoes", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });

  const serie = receitaQ.data ?? [];
  const rows = agQ.data ?? [];

  // Projeção simples: média móvel dos últimos 3 meses
  const ultimos = serie.slice(-3);
  const mediaMovel = ultimos.length ? ultimos.reduce((s, r) => s + Number(r.receita || 0), 0) / ultimos.length : 0;
  const proximoMes = serie.length ? new Date(serie[serie.length - 1].mes) : new Date();
  proximoMes.setMonth(proximoMes.getMonth() + 1);
  const projecao = [
    ...serie.map((r) => ({ mes: r.mes.slice(0, 7), receita: Number(r.receita || 0), projecao: null as number | null })),
    { mes: proximoMes.toISOString().slice(0, 7), receita: null as any, projecao: mediaMovel },
  ];

  // Anomalias: no-show acima da meta por profissional
  const meta = settings.data?.meta_no_show_pct ?? 10;
  const byProf = new Map<string, { total: number; ns: number }>();
  for (const r of rows) {
    const nome = r.profissionais?.nome ?? "—";
    const cur = byProf.get(nome) ?? { total: 0, ns: 0 };
    cur.total += 1;
    if (r.status_agendamento?.categoria === "no_show") cur.ns += 1;
    byProf.set(nome, cur);
  }
  const alertas = Array.from(byProf.entries())
    .filter(([, v]) => v.total >= 10)
    .map(([nome, v]) => ({ nome, taxa: (v.ns / v.total) * 100, total: v.total, ns: v.ns }))
    .filter((a) => a.taxa > meta)
    .sort((a, b) => b.taxa - a.taxa);

  const historicoCurto = serie.length < 12;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Previsões & Alertas</h1>
        <p className="text-sm text-muted-foreground">Projeção de receita e detecção de anomalias operacionais.</p>
      </div>

      {historicoCurto && (
        <div className="rounded border border-warning/40 bg-warning/10 text-warning px-3 py-2 text-sm flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Base atual com {serie.length} mês(es) fechados. Precisão limitada — projeção usa média móvel simples.
            Precisão melhora após ≥12 meses de sincronização.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Receita média (últ. 3 meses)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{brl(mediaMovel)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Projeção próximo mês</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{brl(mediaMovel)}</div>
            <div className="text-xs text-muted-foreground mt-1">média móvel 3M</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Alertas ativos</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-destructive">{alertas.length}</div>
            <div className="text-xs text-muted-foreground mt-1">no-show acima de {meta}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Receita mensal + projeção</CardTitle></CardHeader>
        <CardContent className="h-80">
          {receitaQ.isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projecao}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="mes" />
                <YAxis {...axisProps} tickFormatter={(v) => brl(v)} />
                <Tooltip {...tooltipProps} formatter={(v: any) => v == null ? "-" : brl(v)} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                <Line type="monotone" dataKey="receita" name="Realizado" stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="projecao" name="Projeção" stroke="var(--chart-3)" strokeWidth={2} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Anomalias — profissionais com no-show acima da meta ({meta}%)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agQ.isLoading ? <Skeleton className="h-32" /> : alertas.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhum alerta no período. 👌
            </div>
          ) : (
            <div className="space-y-2">
              {alertas.slice(0, 10).map((a) => (
                <div key={a.nome} className="flex items-center justify-between rounded border border-border/60 px-3 py-2">
                  <div>
                    <div className="font-medium text-sm">{a.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {num(a.ns)} no-show em {num(a.total)} agendamentos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-destructive">{a.taxa.toFixed(1)}%</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                      <TrendingUp className="h-3 w-3" />
                      +{(a.taxa - meta).toFixed(1)}pp vs meta
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
