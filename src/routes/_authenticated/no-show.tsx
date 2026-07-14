import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey, fetchDashboardAppointments } from "@/lib/dashboard-data";
import { pct, num } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/no-show")({
  head: () => ({ meta: [{ title: "Análise de No-show" }] }),
  component: NoShowPage,
});

function NoShowPage() {
  const f = useFilters();
  const q = useQuery({
    queryKey: dashboardQueryKey("noshow", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });

  const rows = (q.data ?? []) as any[];
  const noShow = rows.filter((r) => r.status_agendamento?.categoria === "no_show");
  const feito = rows.filter((r) => r.status_agendamento?.categoria === "realizado");
  const denom = noShow.length + feito.length;
  const taxa = denom > 0 ? (noShow.length * 100) / denom : 0;

  const byEsp = new Map<string, { total: number; noshow: number }>();
  for (const r of rows) {
    const nome = r.especialidades?.nome ?? "—";
    const cur = byEsp.get(nome) ?? { total: 0, noshow: 0 };
    if (r.status_agendamento?.categoria === "no_show") cur.noshow += 1;
    if (r.status_agendamento?.categoria === "realizado" || r.status_agendamento?.categoria === "no_show") cur.total += 1;
    byEsp.set(nome, cur);
  }
  const esp = Array.from(byEsp.entries())
    .map(([nome, v]) => ({ nome, taxa: v.total > 0 ? (v.noshow * 100) / v.total : 0 }))
    .sort((a, b) => b.taxa - a.taxa).slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Análise de No-show</h1>
        <p className="text-sm text-muted-foreground">Faltas x realizados no período.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Taxa de no-show</div><div className="text-2xl font-semibold mt-2">{q.isLoading ? <Skeleton className="h-6 w-16" /> : pct(taxa)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Faltas</div><div className="text-2xl font-semibold mt-2">{num(noShow.length)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Realizados</div><div className="text-2xl font-semibold mt-2">{num(feito.length)}</div></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Top especialidades por no-show</CardTitle></CardHeader>
        <CardContent className="h-80">
          {esp.length === 0 ? <div className="text-sm text-muted-foreground">Sem dados.</div> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={esp} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis dataKey="nome" type="category" width={140} stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip formatter={(v: any) => pct(Number(v))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="taxa" fill="var(--chart-5)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
