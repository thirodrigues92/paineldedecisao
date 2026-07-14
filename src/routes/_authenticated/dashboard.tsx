import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl, num, pct } from "@/lib/format";
import { ArrowDown, ArrowUp, Calendar, DollarSign, UserPlus, UserX, Activity, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { LastSyncCard } from "@/components/LastSyncCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Executiva — Painel Clínico" },
      { name: "description", content: "KPIs e evolução da clínica em tempo real." },
    ],
  }),
  component: DashboardPage,
});

function toISO(d: Date) { return d.toISOString().substring(0, 10); }

function DashboardPage() {
  const f = useFilters();

  const query = useQuery({
    queryKey: ["dashboard", f.from.toISOString(), f.to.toISOString(), f.unidadeIds, f.especialidadeIds, f.convenioTipo],
    queryFn: async () => {
      let q = supabase.from("agendamentos").select(`
        agendamento_id, data, valor_total, especialidade_id, convenio_id,
        primeiro_agendamento, status_id,
        especialidades(nome),
        status_agendamento(categoria, descricao)
      `).gte("data", toISO(f.from)).lte("data", toISO(f.to));
      if (f.unidadeIds.length) q = q.in("unidade_id", f.unidadeIds);
      if (f.especialidadeIds.length) q = q.in("especialidade_id", f.especialidadeIds);
      if (f.convenioTipo === "particular") q = q.is("convenio_id", null);
      if (f.convenioTipo === "convenio") q = q.not("convenio_id", "is", null);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = query.data ?? [];
  const total = rows.length;
  const realizados = rows.filter((r: any) => r.status_agendamento?.categoria === "realizado").length;
  const noShows = rows.filter((r: any) => r.status_agendamento?.categoria === "no_show").length;
  const receitaPrev = rows.reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0);
  const realizadosRows = rows.filter((r: any) => r.status_agendamento?.categoria === "realizado");
  const receitaReal = realizadosRows.reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0);
  const ticket = realizados > 0 ? receitaReal / realizados : 0;
  const novos = rows.filter((r: any) => r.primeiro_agendamento).length;
  const denom = realizados + noShows;
  const taxaNoShow = denom > 0 ? (noShows * 100) / denom : 0;
  const ocupacao = total > 0 ? (realizados * 100) / total : 0;

  // Evolução diária
  const byDay = new Map<string, { data: string; realizado: number; no_show: number; cancelado: number; agendado: number }>();
  for (const r of rows as any[]) {
    const k = r.data as string;
    const cur = byDay.get(k) ?? { data: k, realizado: 0, no_show: 0, cancelado: 0, agendado: 0 };
    const cat = r.status_agendamento?.categoria ?? "agendado";
    if (cat in cur) (cur as any)[cat] += 1; else cur.agendado += 1;
    byDay.set(k, cur);
  }
  const daily = Array.from(byDay.values()).sort((a, b) => a.data.localeCompare(b.data));

  // Por especialidade top10
  const byEsp = new Map<string, number>();
  for (const r of rows as any[]) {
    const nome = r.especialidades?.nome ?? "Sem especialidade";
    byEsp.set(nome, (byEsp.get(nome) ?? 0) + 1);
  }
  const topEsp = Array.from(byEsp.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([nome, total]) => ({ nome, total }));

  // Donut particular vs convenio (por valor)
  const donut = [
    { name: "Particular", value: rows.filter((r: any) => !r.convenio_id).reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0) },
    { name: "Convênio",   value: rows.filter((r: any) => r.convenio_id).reduce((s: number, r: any) => s + Number(r.valor_total || 0), 0) },
  ];

  const kpis = [
    { label: "Agendamentos", value: num(total), icon: Calendar },
    { label: "Ocupação", value: pct(ocupacao), icon: Activity },
    { label: "Taxa de no-show", value: pct(taxaNoShow), icon: UserX, warn: taxaNoShow > 15 },
    { label: "Receita prevista", value: brl(receitaPrev), icon: DollarSign },
    { label: "Ticket médio", value: brl(ticket), icon: TrendingUp },
    { label: "Pacientes novos", value: num(novos), icon: UserPlus },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Visão Executiva</h1>
          <p className="text-sm text-muted-foreground">
            {f.from.toLocaleDateString("pt-BR")} — {f.to.toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <k.icon className="h-3.5 w-3.5" /> {k.label}
              </div>
              <div className={`mt-2 text-xl font-semibold ${k.warn ? "text-warning" : ""}`}>
                {query.isLoading ? <Skeleton className="h-6 w-20" /> : k.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Evolução diária por status</CardTitle></CardHeader>
          <CardContent className="h-72">
            {query.isLoading ? <Skeleton className="h-full w-full" /> : daily.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="data" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="realizado" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="no_show" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cancelado" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="agendado" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Particular vs. Convênio (receita)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {donut.every((d) => d.value === 0) ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                    {donut.map((_, i) => <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-2)"} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top 10 especialidades</CardTitle></CardHeader>
          <CardContent className="h-80">
            {topEsp.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEsp} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis dataKey="nome" type="category" width={140} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8 }} />
                  <Bar dataKey="total" fill="var(--chart-1)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <LastSyncCard />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">
      Sem dados para os filtros selecionados.
    </div>
  );
}
