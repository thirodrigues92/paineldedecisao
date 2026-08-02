import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { dashboardQueryKey, fetchDashboardAppointments, fetchFinancialRows, fetchProcedimentoNomes } from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl, num, pct } from "@/lib/format";
import { Calendar, DollarSign, UserPlus, UserX, Activity, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { Skeleton } from "@/components/ui/skeleton";
import { LastSyncCard } from "@/components/LastSyncCard";
import { categoriaServico } from "@/lib/service-categories";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Executiva — Painel Clínico" },
      { name: "description", content: "KPIs e evolução da clínica em tempo real." },
    ],
  }),
  component: DashboardPage,
});

const compactBrl = (n: number) =>
  Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : brl(n);

type ItemServico = { nome: string; valor: number; qtd: number };
type ServicoBucket = { nome: string; valor: number; qtd: number; itens: Map<string, ItemServico> };




function DashboardPage() {
  const f = useFilters();
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const query = useQuery({
    queryKey: dashboardQueryKey("dashboard", f),
    queryFn: async () => {
      const [appointments, financial, procNomes] = await Promise.all([
        fetchDashboardAppointments(f, 30_000),
        fetchFinancialRows(f, 20_000),
        fetchProcedimentoNomes(),
      ]);

      return { appointments, financial, procNomes };
    },
  });



  const rows = query.data?.appointments ?? [];
  const financialRows = query.data?.financial ?? [];
  const total = rows.length;
  const realizados = rows.filter((r: any) => r.status_agendamento?.categoria === "realizado").length;
  const noShows = rows.filter((r: any) => r.status_agendamento?.categoria === "no_show").length;
  const receitaPrev = financialRows.filter((r) => r.tipo === "receita").reduce((s, r) => s + Number(r.valor || 0), 0);
  const ticket = realizados > 0 ? receitaPrev / realizados : 0;
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
    { name: "Particular", value: financialRows.filter((r) => r.tipo === "receita" && !r.convenio_id).reduce((s, r) => s + Number(r.valor || 0), 0) },
    { name: "Convênio",   value: financialRows.filter((r) => r.tipo === "receita" && r.convenio_id).reduce((s, r) => s + Number(r.valor || 0), 0) },
  ];

  // Faturamento por categoria (receitas)
  const byCategoria = new Map<string, { nome: string; valor: number; qtd: number }>();
  for (const r of financialRows) {
    if (r.tipo !== "receita") continue;
    const nome = (r.categoria ?? "").trim() || "Não classificado";
    const cur = byCategoria.get(nome) ?? { nome, valor: 0, qtd: 0 };
    cur.valor += Number(r.valor || 0);
    cur.qtd += 1;
    byCategoria.set(nome, cur);
  }
  const categorias = Array.from(byCategoria.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalCategorias = categorias.reduce((s, c) => s + c.valor, 0);
  const topCategorias = categorias.slice(0, 12).map((c) => ({
    ...c,
    share: totalCategorias > 0 ? (c.valor * 100) / totalCategorias : 0,
  }));
  const menores = [...categorias].slice(-3).reverse();

  // Faturamento por tipo de serviço — sobre a RECEITA REAL (financeiro_lancamentos),
  // para bater com o KPI de receita. O procedimento vem do item da fatura; quando a
  // Feegow não envia o item, cai em "Sem detalhamento da Feegow".
  const procNomes = query.data?.procNomes ?? new Map<number, string>();

  const receitas = financialRows.filter((r) => r.tipo === "receita");
  const byServico = new Map<string, ServicoBucket>();
  let classificado = 0;
  for (const r of receitas) {
    const valor = Number(r.valor || 0);
    const nomeProc =
      (r.procedimento_id ? procNomes.get(Number(r.procedimento_id)) : null) ?? r.descricao_item ?? null;
    const nome = categoriaServico(nomeProc);
    if (nomeProc && nome !== "Faturamento em lote (convênio)") classificado += valor;
    const cur = byServico.get(nome) ?? { nome, valor: 0, qtd: 0, itens: new Map<string, { nome: string; valor: number; qtd: number }>() };
    cur.valor += valor;
    cur.qtd += 1;
    const itemNome = (nomeProc ?? "").trim() || "Sem descrição na fatura";
    const it = cur.itens.get(itemNome) ?? { nome: itemNome, valor: 0, qtd: 0 };
    it.valor += valor;
    it.qtd += 1;
    cur.itens.set(itemNome, it);
    byServico.set(nome, cur);
  }
  const servicosBase = Array.from(byServico.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalServicos = servicosBase.reduce((s, c) => s + c.valor, 0);
  const servicos = servicosBase.map((c) => ({ ...c, share: totalServicos > 0 ? (c.valor * 100) / totalServicos : 0 }));
  const receitaLote = byServico.get("Faturamento em lote (convênio)")?.valor ?? 0;
  const semDetalhe = byServico.get("Sem detalhamento da Feegow")?.valor ?? 0;
  const detalheBucket = detalhe ? byServico.get(detalhe) ?? null : null;
  const detalheItens: ItemServico[] = detalheBucket
    ? Array.from(detalheBucket.itens.values()).sort((a, b) => b.valor - a.valor).slice(0, 80)
    : [];
  const coberturaServico = receitaPrev > 0 ? (classificado * 100) / receitaPrev : 0;





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
                  <XAxis {...axisProps} dataKey="data" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis {...axisProps} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip {...tooltipProps} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
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
                  <Tooltip {...tooltipProps} formatter={(v: any) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Faturamento por categoria</CardTitle>
            <p className="text-xs text-muted-foreground">Receitas do período agrupadas por categoria financeira — as menores aparecem no fim da lista.</p>
          </CardHeader>
          <CardContent className="h-[26rem]">
            {query.isLoading ? <Skeleton className="h-full w-full" /> : topCategorias.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCategorias} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
                  <YAxis {...axisProps} dataKey="nome" type="category" width={200} interval={0} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: any, _n: any, p: any) => [`${brl(Number(v))} · ${pct(p?.payload?.share ?? 0)} · ${num(p?.payload?.qtd ?? 0)} lanç.`, "Receita"]}
                  />
                  <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                    {topCategorias.map((c, i) => (
                      <Cell key={c.nome} fill={i === topCategorias.length - 1 ? "var(--chart-5)" : "var(--chart-1)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias que menos faturaram</CardTitle>
            <p className="text-xs text-muted-foreground">Candidatas a revisão de preço, divulgação ou descontinuação.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.isLoading ? <Skeleton className="h-40 w-full" /> : menores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados para os filtros selecionados.</p>
            ) : menores.map((c) => (
              <div key={c.nome} className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium truncate" title={c.nome}>{c.nome}</div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span className="text-base font-semibold text-foreground">{brl(c.valor)}</span>
                  <span>{pct(totalCategorias > 0 ? (c.valor * 100) / totalCategorias : 0)} do total · {num(c.qtd)} lanç.</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Faturamento por tipo de serviço</CardTitle>
            <p className="text-xs text-muted-foreground">
              Receita real do período ({brl(receitaPrev)}) — classificada por procedimento {brl(classificado)} ({pct(coberturaServico)})
              {receitaLote > 0 ? ` · faturas em lote de convênio ${brl(receitaLote)}` : ""}
              {semDetalhe > 0 ? ` · sem detalhamento da Feegow ${brl(semDetalhe)}` : ""}.
              Clique numa barra para ver o que há dentro da categoria.
            </p>
          </CardHeader>
          <CardContent className="h-96">
            {query.isLoading ? <Skeleton className="h-full w-full" /> : servicos.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={servicos} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
                  <YAxis {...axisProps} dataKey="nome" type="category" width={195} interval={0} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: any, _n: any, p: any) => [`${brl(Number(v))} · ${pct(p?.payload?.share ?? 0)} · ${num(p?.payload?.qtd ?? 0)} lanç.`, "Faturamento"]}
                  />
                  <Bar
                    dataKey="valor"
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(d: any) => setDetalhe(d?.payload?.nome ?? null)}
                  >
                    {servicos.map((c, i) => (
                      <Cell key={c.nome} fill={i === servicos.length - 1 ? "var(--chart-5)" : "var(--chart-2)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composição do faturamento</CardTitle>
            <p className="text-xs text-muted-foreground">Quanto cada tipo de serviço representa do total do período.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.isLoading ? <Skeleton className="h-64 w-full" /> : servicos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados para os filtros selecionados.</p>
            ) : (
              <>
                {servicos.map((c, i) => (
                  <button
                    key={c.nome}
                    type="button"
                    onClick={() => setDetalhe(c.nome)}
                    className="w-full space-y-1 text-left rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate" title={c.nome}>{c.nome}</span>
                      <span className="font-medium shrink-0">{brl(c.valor)}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(c.share, 1)}%`, background: `var(--chart-${(i % 5) + 1})` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">{pct(c.share)} do total · {num(c.qtd)} lançamentos</div>
                  </button>
                ))}
                <p className="pt-2 text-[11px] leading-snug text-muted-foreground border-t border-border">
                  Total confere com a receita do período: {brl(totalServicos)} de {brl(receitaPrev)}.
                  {receitaLote > 0
                    ? ` ${brl(receitaLote)} vêm de faturas em lote de convênio (a Feegow não abre o procedimento nesse formato).`
                    : ""}
                  {semDetalhe > 0
                    ? ` ${brl(semDetalhe)} sem item na fatura — rode a sincronização financeira para reduzir.`
                    : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={detalhe !== null} onOpenChange={(o) => !o && setDetalhe(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detalhe ?? ""}</SheetTitle>
            <SheetDescription>
              {detalheBucket
                ? `${brl(detalheBucket.valor)} · ${num(detalheBucket.qtd)} lançamentos · ${num(detalheItens.length)} itens distintos`
                : "Sem itens."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {detalheItens.map((it) => (
              <div key={it.nome} className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium break-words">{it.nome}</div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span className="text-sm font-semibold text-foreground">{brl(it.valor)}</span>
                  <span>{num(it.qtd)} lanç. · ticket {brl(it.qtd > 0 ? it.valor / it.qtd : 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>




      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top 10 especialidades</CardTitle></CardHeader>
          <CardContent className="h-80">
            {topEsp.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEsp} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis {...axisProps} type="number" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis {...axisProps} dataKey="nome" type="category" width={140} stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip {...tooltipProps} />
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
