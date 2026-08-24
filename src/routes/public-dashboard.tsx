import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters, FiltersProvider } from "@/lib/filters-context";
import { 
  dashboardQueryKey, 
  fetchDashboardAppointments, 
  fetchFinancialRows, 
  fetchPacienteNomes, 
  fetchProcedimentoNomes,
  fetchLabProducaoRows
} from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl, num, pct } from "@/lib/format";
import { Calendar, DollarSign, UserPlus, UserX, Activity, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { Skeleton } from "@/components/ui/skeleton";
import { LastSyncCard } from "@/components/LastSyncCard";
import { differenceInDays, subDays, eachDayOfInterval, format } from "date-fns";
import { cn } from "@/lib/utils";
import { GlobalFilters } from "@/components/GlobalFilters";

function PublicDashboardContent() {
  const f = useFilters();
  const diff = differenceInDays(f.to, f.from) + 1;
  const prevFrom = subDays(f.from, diff);
  const prevTo = subDays(f.to, diff);

  const query = useQuery({
    queryKey: dashboardQueryKey("public-dashboard", f),
    queryFn: async () => {
      const [appointments, financial, procNomes, pacienteNomes, labProducao] = await Promise.all([
        fetchDashboardAppointments(f, 30_000),
        fetchFinancialRows(f, 20_000),
        fetchProcedimentoNomes(),
        fetchPacienteNomes(),
        fetchLabProducaoRows(f, 30_000),
      ]);

      const prevFilters = { ...f, from: prevFrom, to: prevTo };
      const [prevAppointments, prevFinancial, prevLabProducao] = await Promise.all([
        fetchDashboardAppointments(prevFilters, 30_000),
        fetchFinancialRows(prevFilters, 20_000),
        fetchLabProducaoRows(prevFilters, 30_000),
      ]);

      return { 
        appointments, 
        financial, 
        procNomes, 
        pacienteNomes, 
        labProducao,
        prevData: {
          appointments: prevAppointments,
          financial: prevFinancial,
          labProducao: prevLabProducao
        }
      };
    },
  });

  const rows = query.data?.appointments ?? [];
  const labRows = query.data?.labProducao ?? [];
  const prevData = query.data?.prevData;

  const total = rows.length;
  const realizados = rows.filter((r: any) => r.status_agendamento?.categoria === "realizado").length;
  const noShows = rows.filter((r: any) => r.status_agendamento?.categoria === "no_show").length;
  const faturadoReal = labRows.reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalItens = labRows.length;
  const ticket = totalItens > 0 ? faturadoReal / totalItens : 0;
  const novos = rows.filter((r: any) => r.primeiro_agendamento).length;
  const denom = realizados + noShows;
  const taxaNoShow = denom > 0 ? (noShows * 100) / denom : 0;
  const ocupacao = total > 0 ? (realizados * 100) / total : 0;

  const getDiff = (current: number, prev: number | undefined) => {
    if (prev === undefined || prev === 0) return null;
    return ((current - prev) / prev) * 100;
  };

  const prevTotal = prevData?.appointments.length ?? 0;
  const prevRealizados = prevData?.appointments.filter((r: any) => r.status_agendamento?.categoria === "realizado").length ?? 0;
  const prevNoShows = prevData?.appointments.filter((r: any) => r.status_agendamento?.categoria === "no_show").length ?? 0;
  const prevDenom = prevRealizados + prevNoShows;
  const prevTaxaNoShow = prevDenom > 0 ? (prevNoShows * 100) / prevDenom : 0;
  const prevOcupacao = prevTotal > 0 ? (prevRealizados * 100) / prevTotal : 0;
  const prevFaturado = prevData?.labProducao.reduce((s, r) => s + Number(r.valor || 0), 0) ?? 0;
  const prevTotalItens = prevData?.labProducao.length ?? 0;
  const prevTicket = prevTotalItens > 0 ? prevFaturado / prevTotalItens : 0;
  const prevNovos = prevData?.appointments.filter((r: any) => r.primeiro_agendamento).length ?? 0;

  const byEsp = new Map<string, { total: number; valor: number }>();
  for (const r of labRows) {
    const nome = r.grupo_nome || "Sem especialidade";
    const cur = byEsp.get(nome) ?? { total: 0, valor: 0 };
    cur.total += 1;
    cur.valor += Number(r.valor || 0);
    byEsp.set(nome, cur);
  }
  const topEsp = Array.from(byEsp.entries())
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, 10)
    .map(([nome, d]) => ({ nome, total: d.total, valor: d.valor }));

  const donut = [
    { name: "Particular", value: labRows.filter((r: any) => r.convenio_nome === "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
    { name: "Convênio",   value: labRows.filter((r: any) => r.convenio_nome !== "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
  ];

  const kpis = [
    { label: "Agendamentos", value: num(total), icon: Calendar, trend: getDiff(total, prevTotal) },
    { label: "Ocupação", value: pct(ocupacao), icon: Activity, trend: getDiff(ocupacao, prevOcupacao) },
    { label: "Taxa de no-show", value: pct(taxaNoShow), icon: UserX, warn: taxaNoShow > 15, trend: getDiff(taxaNoShow, prevTaxaNoShow), invertTrend: true },
    { label: "Faturado", value: brl(faturadoReal), icon: DollarSign, trend: getDiff(faturadoReal, prevFaturado) },
    { label: "Ticket médio", value: brl(ticket), icon: TrendingUp, trend: getDiff(ticket, prevTicket) },
    { label: "Pacientes novos", value: num(novos), icon: UserPlus, trend: getDiff(novos, prevNovos) },
  ];

  const compactBrl = (n: number) =>
    Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : brl(n);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Visão Executiva (Pública)</h1>
        <Button variant="outline" size="sm" onClick={() => {
          localStorage.removeItem("public_admin_session");
          window.location.href = "/public-login";
        }}>
          Sair
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const TrendIcon = k.trend && k.trend > 0 ? ArrowUpRight : ArrowDownRight;
          const isGood = k.invertTrend ? (k.trend ?? 0) < 0 : (k.trend ?? 0) > 0;
          
          return (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <k.icon className="h-3.5 w-3.5" /> {k.label}
                </div>
                <div className={`mt-2 text-xl font-semibold ${k.warn ? "text-warning" : ""}`}>
                  {query.isLoading ? <Skeleton className="h-6 w-20" /> : k.value}
                </div>
                {k.trend !== null && !query.isLoading && (
                  <div className={cn(
                    "mt-1 flex items-center text-[10px] font-medium",
                    isGood ? "text-emerald-500" : "text-rose-500"
                  )}>
                    <TrendIcon className="h-3 w-3 mr-0.5" />
                    {Math.abs(k.trend ?? 0).toFixed(1)}%
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Particular vs. Convênio (receita)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={donut} 
                  dataKey="value" 
                  nameKey="name" 
                  innerRadius={55} 
                  outerRadius={90}
                >
                  {donut.map((_, i) => <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-2)"} />)}
                </Pie>
                <Tooltip {...tooltipProps} formatter={(v: any) => brl(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader><CardTitle>Resumo Rápido</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Volume total faturado</p>
              <p className="text-2xl font-bold text-primary">{brl(faturadoReal)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pacientes atendidos</p>
              <p className="text-2xl font-bold">{num(realizados)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Especialidades por Faturamento</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topEsp} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
              <YAxis {...axisProps} dataKey="nome" type="category" width={150} interval={0} />
              <Tooltip 
                {...tooltipProps}
                formatter={(v: any) => [brl(Number(v)), "Faturado"]}
              />
              <Bar dataKey="valor" fill="var(--chart-4)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
      <LastSyncCard />
    </div>
  );
}

export const Route = createFileRoute("/public-dashboard")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const isAuthed = localStorage.getItem("public_admin_session") === "true";
      if (!isAuthed) {
        throw redirect({ to: "/public-login" as any });
      }
    }
  },
  component: () => (
    <FiltersProvider>
      <div className="min-h-screen bg-background p-4 md:p-8">
        <header className="mb-8 border-b pb-4">
          <GlobalFilters />
        </header>
        <main className="max-w-7xl mx-auto">
          <PublicDashboardContent />
        </main>
      </div>
    </FiltersProvider>
  ),
});
