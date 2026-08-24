import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { 
  dashboardQueryKey, 
  fetchDashboardAppointments, 
  fetchFinancialRows, 
  fetchPacienteNomes, 
  fetchProcedimentoNomes,
  fetchLabProducaoRows
} from "@/lib/dashboard-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { brl, num, pct } from "@/lib/format";
import { Calendar, DollarSign, UserPlus, UserX, Activity, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
import { differenceInDays, subDays, eachDayOfInterval, format } from "date-fns";
import { cn } from "@/lib/utils";




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

type LancamentoDetalhe = {
  nome: string;
  valor: number;
  data: string | null;
  status: string | null;
  categoria: string | null;
  convenio: boolean;
  pacienteId: number | null;
  pacienteNome: string | null;
  profissionalNome?: string | null;
  formaPagamento?: string | null;
  isNovo?: boolean;
};
type ItemServico = { nome: string; valor: number; qtd: number; lancamentos: LancamentoDetalhe[] };
type ServicoBucket = { nome: string; valor: number; qtd: number; itens: Map<string, ItemServico> };




function DashboardPage() {
  const f = useFilters();
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [detalheOrigem, setDetalheOrigem] = useState<string | null>(null);
  const [detalhePagamento, setDetalhePagamento] = useState<string | null>(null);
  const [itemAberto, setItemAberto] = useState<string | null>(null);
  const [detalheProfissional, setDetalheProfissional] = useState<string | null>(null);
  const [detalheNovos, setDetalheNovos] = useState<boolean>(false);
  const [detalheNoShow, setDetalheNoShow] = useState<boolean>(false);
  const [detalheEspecialidade, setDetalheEspecialidade] = useState<string | null>(null);

  const diff = differenceInDays(f.to, f.from) + 1;
  const prevFrom = subDays(f.from, diff);
  const prevTo = subDays(f.to, diff);

  const query = useQuery({
    queryKey: dashboardQueryKey("dashboard", f),
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
  const financialRows = query.data?.financial ?? [];
  const labRows = query.data?.labProducao ?? [];
  const prevData = query.data?.prevData;

  const total = rows.length;
  const realizados = rows.filter((r: any) => r.status_agendamento?.categoria === "realizado").length;
  const noShows = rows.filter((r: any) => r.status_agendamento?.categoria === "no_show").length;
  
  // CORREÇÃO 1: Receita Real (Faturado) da lab_producao_feegow
  const faturadoReal = labRows.reduce((s, r) => s + Number(r.valor || 0), 0);
  
  // CORREÇÃO 2: Ticket Médio (Faturado / Quantidade de Itens)
  const totalItens = labRows.length;
  const ticket = totalItens > 0 ? faturadoReal / totalItens : 0;

  const novos = rows.filter((r: any) => r.primeiro_agendamento).length;
  const denom = realizados + noShows;
  const taxaNoShow = denom > 0 ? (noShows * 100) / denom : 0;
  const ocupacao = total > 0 ? (realizados * 100) / total : 0;

  // KPIs com comparativo (CORREÇÃO 5)
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

  // CORREÇÃO 3: Evolução diária com preenchimento de zeros (dias sem movimento)
  const days = eachDayOfInterval({ start: f.from, end: f.to });
  const daily = days.map(day => {
    const k = format(day, "yyyy-MM-dd");
    const dayRows = rows.filter((r: any) => r.data === k);
    
    return {
      data: format(day, "dd/MM"),
      fullDate: k,
      realizado: dayRows.filter((r: any) => r.status_agendamento?.categoria === "realizado").length,
      no_show: dayRows.filter((r: any) => r.status_agendamento?.categoria === "no_show").length,
      cancelado: dayRows.filter((r: any) => r.status_agendamento?.categoria === "cancelado").length,
      agendado: dayRows.filter((r: any) => !r.status_agendamento || r.status_agendamento.categoria === "agendado").length,
    };
  });


  // Especialidades e Volume Faturado
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

  // Donut particular vs convenio (por valor)
  const donut = [
    { name: "Particular", value: labRows.filter((r: any) => r.convenio_nome === "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
    { name: "Convênio",   value: labRows.filter((r: any) => r.convenio_nome !== "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
  ];

  // Faturamento por convênio específico
  const byConvenio = new Map<string, { nome: string; valor: number; qtd: number }>();
  for (const r of labRows) {
    const nome = (r.convenio_nome ?? "").trim() || "Particular";
    const cur = byConvenio.get(nome) ?? { nome, valor: 0, qtd: 0 };
    cur.valor += Number(r.valor || 0);
    cur.qtd += 1;
    byConvenio.set(nome, cur);
  }
  const conveniosBreakdown = Array.from(byConvenio.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);

  // Faturamento por Profissional (Médico)
  const byProfissional = new Map<string, { nome: string; valor: number; qtd: number }>();
  for (const r of labRows) {
    const nome = (r.profissional_nome ?? "").trim() || "Não informado";
    const cur = byProfissional.get(nome) ?? { nome, valor: 0, qtd: 0 };
    cur.valor += Number(r.valor || 0);
    cur.qtd += 1;
    byProfissional.set(nome, cur);
  }
  const profissionaisBreakdown = Array.from(byProfissional.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);

  // Faturamento por categoria (receitas)
  const byCategoria = new Map<string, { nome: string; valor: number; qtd: number }>();
  for (const r of labRows) {
    const nome = (r.grupo_nome ?? "").trim() || "Não classificado";
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


  // Faturamento por tipo de serviço
  const byServico = new Map<string, ServicoBucket>();
  let classificado = 0;
  for (const r of labRows) {
    const valor = Number(r.valor || 0);
    const nomeProc = r.procedimento_nome ?? "Sem descrição";
    const nome = categoriaServico(nomeProc);
    if (nomeProc) classificado += valor;
    
    const cur: ServicoBucket = byServico.get(nome) ?? { nome, valor: 0, qtd: 0, itens: new Map<string, ItemServico>() };
    cur.valor += valor;
    cur.qtd += 1;
    
    const itemNome = (nomeProc ?? "").trim() || "Sem descrição";
    const it: ItemServico = cur.itens.get(itemNome) ?? { nome: itemNome, valor: 0, qtd: 0, lancamentos: [] };
    it.valor += valor;
    it.qtd += 1;
    
    it.lancamentos.push({
      pacienteId: r.paciente_id ? Number(r.paciente_id) : null,
      pacienteNome: r.paciente_nome || null,
      nome: itemNome,
      valor,
      data: r.data_execucao,
      status: r.situacao || null,
      categoria: r.grupo_nome || null,
      convenio: r.convenio_nome !== "Particular",
      profissionalNome: r.profissional_nome,
      formaPagamento: r.forma_pagamento,
      isNovo: r.is_novo_paciente,
    });
    
    cur.itens.set(itemNome, it);
    byServico.set(nome, cur);
  }

  const servicosBase = Array.from(byServico.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalServicos = servicosBase.reduce((s, c) => s + c.valor, 0);
  const servicos = servicosBase.map((c) => ({ ...c, share: totalServicos > 0 ? (c.valor * 100) / totalServicos : 0 }));
  const receitaLote = byServico.get("Faturamento em lote (convênio)")?.valor ?? 0;
  const semDetalhe = byServico.get("Sem detalhamento da Feegow")?.valor ?? 0;
  const detalheBucket = detalhe ? byServico.get(detalhe) ?? null : null;
  
  const byOrigem = new Map<string, ServicoBucket>();
  if (detalheOrigem || detalheProfissional || detalheNovos || detalheEspecialidade || detalhePagamento) {
    const activeLabel = detalheNovos ? "Pacientes Novos" : (detalhePagamento || detalheOrigem || detalheProfissional || detalheEspecialidade || "");
    const bucket: ServicoBucket = { nome: activeLabel, valor: 0, qtd: 0, itens: new Map<string, ItemServico>() };
    
    const filteredRows = labRows.filter((r: any) => {
      if (detalheNovos) return !!r.is_novo_paciente;
      if (detalheProfissional) return (r.profissional_nome || "Não informado") === detalheProfissional;
      if (detalheEspecialidade) return (r.grupo_nome || "Sem especialidade") === detalheEspecialidade;
      if (detalhePagamento) {
        const raw = (r.forma_pagamento as string) || "Não informado";
        if (detalhePagamento === "Múltiplas Formas") return raw.includes(",");
        return raw === detalhePagamento;
      }
      if (detalheOrigem === "Particular") return r.convenio_nome === "Particular";
      if (detalheOrigem === "Convênio") return r.convenio_nome !== "Particular";
      return r.convenio_nome === detalheOrigem;
    });
    
    for (const r of filteredRows) {
      const valor = Number(r.valor || 0);
      const nomeProc = r.procedimento_nome ?? "Sem descrição";
      bucket.valor += valor;
      bucket.qtd += 1;
      
      const itemNome = (nomeProc ?? "").trim() || "Sem descrição";
      const it: ItemServico = bucket.itens.get(itemNome) ?? { nome: itemNome, valor: 0, qtd: 0, lancamentos: [] };
      it.valor += valor;
      it.qtd += 1;
      
      it.lancamentos.push({
        pacienteId: r.paciente_id ? Number(r.paciente_id) : null,
        pacienteNome: r.paciente_nome || null,
        nome: itemNome,
        valor,
        data: r.data_execucao,
        status: r.situacao || null,
        categoria: r.grupo_nome || null,
        convenio: r.convenio_nome !== "Particular",
        profissionalNome: r.profissional_nome,
        formaPagamento: r.forma_pagamento,
        isNovo: r.is_novo_paciente,
      });
      bucket.itens.set(itemNome, it);
    }
    byOrigem.set(activeLabel, bucket);
  }

  const activeBucket = detalheNovos 
    ? byOrigem.get("Pacientes Novos") 
    : (detalhePagamento ? byOrigem.get(detalhePagamento) : (detalheOrigem ? byOrigem.get(detalheOrigem) : (detalheProfissional ? byOrigem.get(detalheProfissional) : (detalheEspecialidade ? byOrigem.get(detalheEspecialidade) : (detalhe ? byServico.get(detalhe) : null)))));
  const detalheItens: ItemServico[] = activeBucket
    ? Array.from(activeBucket.itens.values()).sort((a, b) => b.valor - a.valor).slice(0, 80)
    : [];
  const coberturaServico = faturadoReal > 0 ? (classificado * 100) / faturadoReal : 0;





  const kpis = [
    { label: "Agendamentos", value: num(total), icon: Calendar, trend: getDiff(total, prevTotal) },
    { label: "Ocupação", value: pct(ocupacao), icon: Activity, trend: getDiff(ocupacao, prevOcupacao) },
    { label: "Taxa de no-show", value: pct(taxaNoShow), icon: UserX, warn: taxaNoShow > 15, trend: getDiff(taxaNoShow, prevTaxaNoShow), invertTrend: true },
    { label: "Faturado", value: brl(faturadoReal), icon: DollarSign, trend: getDiff(faturadoReal, prevFaturado) },
    { label: "Ticket médio", value: brl(ticket), icon: TrendingUp, trend: getDiff(ticket, prevTicket) },
    { label: "Pacientes novos", value: num(novos), icon: UserPlus, trend: getDiff(novos, prevNovos) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Visão Executiva</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => {
          const TrendIcon = k.trend && k.trend > 0 ? ArrowUpRight : ArrowDownRight;
          const isGood = k.invertTrend ? (k.trend ?? 0) < 0 : (k.trend ?? 0) > 0;
          
          return (
            <Card 
              key={k.label} 
              className={cn(k.label === "Pacientes novos" && "cursor-pointer hover:bg-muted/50 transition-colors ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2")}
              onClick={() => k.label === "Pacientes novos" && setDetalheNovos(true)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <k.icon className="h-3.5 w-3.5" /> {k.label}
                  {k.label === "Pacientes novos" && !query.isLoading && (
                    <span className="ml-auto inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      Ver detalhes
                    </span>
                  )}
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
            {donut.every((d) => d.value === 0) ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={donut} 
                    dataKey="value" 
                    nameKey="name" 
                    innerRadius={55} 
                    outerRadius={90}
                    cursor="pointer"
                    onClick={(d: any) => setDetalheOrigem(d?.name ?? null)}
                  >
                    {donut.map((_, i) => <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-2)"} />)}
                  </Pie>
                  <Tooltip {...tooltipProps} formatter={(v: any) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            
            {donut.find(d => d.name === "Particular")?.value! > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-2">Formas de Pagamento (Particular)</p>
                <div className="w-full">
                  {(() => {
                    const paymentData = Array.from(
                      labRows
                        .filter((r: any) => r.convenio_nome === "Particular")
                        .reduce((acc, r) => {
                          const raw = (r.forma_pagamento as string) || "Não informado";
                          const category = raw.includes(",") ? "Múltiplas Formas" : raw;
                          
                          const cur = acc.get(category) ?? { value: 0, qtd: 0 };
                          cur.value += Number(r.valor || 0);
                          cur.qtd += 1;
                          acc.set(category, cur);
                          return acc;
                        }, new Map<string, { value: number; qtd: number }>())
                    )
                      .sort((a, b) => b[1].value - a[1].value)
                      .map(([name, d]) => ({ 
                        name, 
                        value: d.value, 
                        qtd: d.qtd,
                        percent: faturadoReal > 0 ? (d.value * 100) / faturadoReal : 0
                      }));

                    const containerHeight = Math.max(150, paymentData.length * 45 + 40);

                    return (
                      <div style={{ height: `${containerHeight}px` }} className="w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={paymentData}
                            layout="vertical"
                            margin={{ top: 5, right: 80, left: 40, bottom: 5 }}
                            barSize={25}
                            barGap={10}
                          >
                            <XAxis type="number" hide />
                            <YAxis 
                              dataKey="name" 
                              type="category" 
                              width={120} 
                              fontSize={11}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip 
                              cursor={{ fill: 'var(--muted)', opacity: 0.1 }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const d = payload[0].payload;
                                  return (
                                    <div className="rounded-lg border border-border bg-background p-3 shadow-md text-xs space-y-1">
                                      <div className="font-bold border-b pb-1 mb-1">{d.name}</div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Valor Total:</span>
                                        <span className="font-semibold text-primary">{brl(d.value)}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Transações:</span>
                                        <span className="font-semibold">{num(d.qtd)}</span>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Percentual:</span>
                                        <span className="font-semibold">{pct(d.percent)}</span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar 
                              dataKey="value" 
                              radius={[0, 4, 4, 0]}
                              cursor="pointer"
                              onClick={(d) => setDetalhePagamento(d.name)}
                            >
                              {paymentData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={`var(--chart-${(index % 5) + 1})`} className="hover:opacity-80 transition-opacity" />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="absolute top-0 right-0 h-full flex flex-col justify-around py-[30px] pointer-events-none">
                          {paymentData.map((d, i) => (
                            <div key={i} className="text-[10px] font-medium text-muted-foreground pr-2 text-right whitespace-nowrap" style={{ height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {brl(d.value)} · {pct(d.percent)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo por Convênio</CardTitle>
            <p className="text-xs text-muted-foreground">Detalhamento por fonte pagadora. Clique para ver detalhes.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.isLoading ? <Skeleton className="h-40 w-full" /> : conveniosBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados para os filtros selecionados.</p>
            ) : conveniosBreakdown.map((c) => (
              <button
                key={c.nome}
                type="button"
                onClick={() => setDetalheOrigem(c.nome)}
                className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="text-sm font-medium truncate" title={c.nome}>{c.nome}</div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span className="text-base font-semibold text-foreground">{brl(c.valor)}</span>
                  <span>{num(c.qtd)} lanç.</span>
                </div>
              </button>
            ))}
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
              Receita real do período ({brl(faturadoReal)}) — classificada por procedimento {brl(classificado)} ({pct(coberturaServico)})
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
                  Total confere com a receita do período: {brl(totalServicos)} de {brl(faturadoReal)}.
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

      <Sheet open={detalhe !== null || detalheOrigem !== null || detalheProfissional !== null || detalheNovos || detalheEspecialidade !== null || detalhePagamento !== null} onOpenChange={(o) => {
        if (!o) {
          setDetalhe(null);
          setDetalheOrigem(null);
          setDetalheProfissional(null);
          setDetalheNovos(false);
          setDetalheEspecialidade(null);
          setDetalhePagamento(null);
          setItemAberto(null);
        }
      }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detalheNovos ? "Pacientes Novos" : (detalhePagamento || detalheEspecialidade || detalheProfissional || detalheOrigem || detalhe || "")}</SheetTitle>
            <SheetDescription>
              {activeBucket
                ? `${brl(activeBucket.valor)} · ${num(activeBucket.qtd)} lançamentos · ${num(detalheItens.length)} itens distintos`
                : "Sem itens."}
            </SheetDescription>
            {activeBucket && (detalheOrigem || detalheNovos || detalheProfissional || detalheEspecialidade || detalhePagamento) && (
              <div className="mt-4 grid grid-cols-2 gap-2 pb-2">
                {Array.from(
                  Array.from(activeBucket.itens.values()).reduce((acc, it) => {
                    it.lancamentos.forEach((l) => {
                      const f = (l.formaPagamento as string) || "Não informado";
                      acc.set(f, (acc.get(f) ?? 0) + Number(l.valor));
                    });
                    return acc;
                  }, new Map<string, number>())
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([forma, valor]) => (
                    <div key={forma} className="rounded-md bg-muted/50 p-2 text-center">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">{forma}</div>
                      <div className="text-sm font-bold text-foreground">{brl(valor)}</div>
                    </div>
                  ))}
              </div>
            )}
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {detalheItens.map((it) => {
              const aberto = itemAberto === it.nome;
              return (
                <div key={it.nome} className="rounded-lg border border-border p-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setItemAberto(aberto ? null : it.nome)}
                  >
                    <div className="text-sm font-medium break-words">{it.nome}</div>
                    <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                      <span className="text-sm font-semibold text-foreground">{brl(it.valor)}</span>
                      <span>{num(it.qtd)} lanç. · ticket {brl(it.qtd > 0 ? it.valor / it.qtd : 0)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-primary">
                      {aberto ? "Ocultar lançamentos" : "Ver cada lançamento"}
                    </div>
                  </button>

                  {aberto && (
                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      {[...it.lancamentos]
                        .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
                        .map((l, idx) => (
                          <div key={idx} className="flex items-baseline justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="truncate text-foreground" title={l.pacienteNome ?? ""}>
                                {l.pacienteNome
                                  ?? (l.pacienteId ? `Paciente #${l.pacienteId}` : "Paciente não vinculado")}
                              </div>
                              <div className="text-muted-foreground">
                                {l.data ? new Date(`${l.data}T12:00:00`).toLocaleDateString("pt-BR") : "Sem data"}
                              </div>
                              <div className="truncate text-muted-foreground" title={l.categoria ?? ""}>
                                {l.categoria ?? "Sem categoria"} · {l.convenio ? "Convênio" : "Particular"}
                                {l.status ? ` · ${l.status}` : ""}
                                {l.profissionalNome ? ` · ${l.profissionalNome}` : ""}
                                {l.formaPagamento ? ` · ${l.formaPagamento}` : ""}
                              </div>
                            </div>
                            <span className="shrink-0 font-medium text-foreground">{brl(l.valor)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>




      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Faturamento por Profissional</CardTitle>
            <p className="text-xs text-muted-foreground">Desempenho financeiro por médico/profissional no período.</p>
          </CardHeader>
          <CardContent className="h-80">
            {query.isLoading ? <Skeleton className="h-full w-full" /> : profissionaisBreakdown.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profissionaisBreakdown.slice(0, 10)} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
                  <YAxis {...axisProps} dataKey="nome" type="category" width={150} interval={0} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: any) => [brl(Number(v)), "Faturado"]}
                  />
                  <Bar 
                    dataKey="valor" 
                    fill="var(--chart-3)" 
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(d: any) => setDetalheProfissional(d?.payload?.nome ?? null)}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Profissionais</CardTitle>
            <p className="text-xs text-muted-foreground">Ranking de faturamento por profissional.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.isLoading ? <Skeleton className="h-40 w-full" /> : profissionaisBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : profissionaisBreakdown.slice(0, 5).map((p) => (
              <button
                key={p.nome}
                type="button"
                onClick={() => setDetalheProfissional(p.nome)}
                className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="text-sm font-medium truncate">{p.nome}</div>
                <div className="mt-1 flex items-baseline justify-between text-xs text-muted-foreground">
                  <span className="text-base font-semibold text-foreground">{brl(p.valor)}</span>
                  <span>{num(p.qtd)} atend.</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Especialidades por Faturamento</CardTitle>
            <p className="text-xs text-muted-foreground">Ranking das especialidades que mais geraram receita no período selecionado.</p>
          </CardHeader>
          <CardContent className="h-80">
            {query.isLoading ? <Skeleton className="h-full w-full" /> : topEsp.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEsp} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
                  <YAxis {...axisProps} dataKey="nome" type="category" width={150} interval={0} />
                  <Tooltip 
                    {...tooltipProps}
                    formatter={(v: any, _n: any, p: any) => [
                      `${brl(Number(v))} · ${num(p?.payload?.total ?? 0)} atend.`, 
                      "Faturado"
                    ]}
                  />
                  <Bar 
                    dataKey="valor" 
                    fill="var(--chart-4)" 
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(d: any) => setDetalheEspecialidade(d?.payload?.nome ?? null)}
                  />
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
