import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart,
} from "recharts";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { brl, num, pct, downloadCsv } from "@/lib/format";
import {
  dashboardQueryKey, fetchDashboardAppointments, fetchPacientesRegioes,
  type DashboardAppointment,
} from "@/lib/dashboard-data";
import { isAplicacaoInjetavel } from "@/lib/injectables";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics/aplicacoes")({
  head: () => ({
    meta: [
      { title: "Aplicações Injetáveis — Painel de Decisão Clínica" },
      { name: "description", content: "Receita, volume, comparecimento e rentabilidade das aplicações injetáveis da clínica." },
      { property: "og:title", content: "Aplicações Injetáveis — Painel de Decisão Clínica" },
      { property: "og:description", content: "Receita, volume, comparecimento e rentabilidade das aplicações injetáveis da clínica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AplicacoesPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="text-sm text-destructive">Erro ao carregar: {error.message}</div>
  ),
});

const compactBrl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(Number(v) || 0);

const mesLabel = (iso: string) => {
  const [y, m] = iso.split("-");
  return `${m}/${y.slice(2)}`;
};

const META_NO_SHOW = 15;

type Ordenacao = "receita" | "volume" | "ticket";

function AplicacoesPage() {
  const f = useFilters();

  const q = useQuery({
    queryKey: dashboardQueryKey("analytics-aplicacoes", f),
    queryFn: () => fetchDashboardAppointments(f, 30_000),
  });
  const regioesQ = useQuery({
    queryKey: ["pacientes-regioes"],
    queryFn: () => fetchPacientesRegioes(),
    staleTime: 10 * 60_000,
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  const [tiposSelecionados, setTiposSelecionados] = useState<string[]>([]);
  const [bairroFiltro, setBairroFiltro] = useState<string>("todos");
  const [ticketRange, setTicketRange] = useState<[number, number]>([0, 1000]);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("receita");
  const [metricaRegiao, setMetricaRegiao] = useState<"volume" | "receita">("volume");

  const regioes = regioesQ.data;

  // ---- classificação ----
  const { aplicacoes, outros } = useMemo(() => {
    const ap: DashboardAppointment[] = [];
    const ou: DashboardAppointment[] = [];
    for (const r of rows) (isAplicacaoInjetavel(r.procedimentos?.nome) ? ap : ou).push(r);
    return { aplicacoes: ap, outros: ou };
  }, [rows]);

  const tiposDisponiveis = useMemo(
    () => Array.from(new Set(aplicacoes.map((r) => r.procedimentos?.nome ?? "Sem procedimento"))).sort(),
    [aplicacoes],
  );
  const bairrosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const r of aplicacoes) {
      const b = r.paciente_id != null ? regioes?.get(r.paciente_id)?.bairro : null;
      if (b) s.add(b);
    }
    return Array.from(s).sort();
  }, [aplicacoes, regioes]);

  // ---- filtros locais ----
  const filtradas = useMemo(() => {
    return aplicacoes.filter((r) => {
      const nome = r.procedimentos?.nome ?? "Sem procedimento";
      if (tiposSelecionados.length && !tiposSelecionados.includes(nome)) return false;
      const valor = Number(r.valor_total || 0);
      if (valor < ticketRange[0] || valor > ticketRange[1]) return false;
      if (bairroFiltro !== "todos") {
        const b = r.paciente_id != null ? regioes?.get(r.paciente_id)?.bairro : null;
        if (b !== bairroFiltro) return false;
      }
      return true;
    });
  }, [aplicacoes, tiposSelecionados, ticketRange, bairroFiltro, regioes]);

  const isNoShow = (r: DashboardAppointment) => r.status_agendamento?.categoria === "no_show";
  const isRealizado = (r: DashboardAppointment) => r.status_agendamento?.categoria === "realizado";

  // ---- séries mensais ----
  const mensal = useMemo(() => {
    const map = new Map<string, { mes: string; receitaAplicacoes: number; receitaOutros: number; volume: number; realizados: number; noShows: number }>();
    const touch = (mes: string) =>
      map.get(mes) ?? { mes, receitaAplicacoes: 0, receitaOutros: 0, volume: 0, realizados: 0, noShows: 0 };
    for (const r of filtradas) {
      const mes = String(r.data).slice(0, 7);
      const cur = touch(mes);
      cur.receitaAplicacoes += Number(r.valor_total || 0);
      cur.volume += 1;
      if (isRealizado(r)) cur.realizados += 1;
      if (isNoShow(r)) cur.noShows += 1;
      map.set(mes, cur);
    }
    for (const r of outros) {
      const mes = String(r.data).slice(0, 7);
      const cur = touch(mes);
      cur.receitaOutros += Number(r.valor_total || 0);
      map.set(mes, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);
  }, [filtradas, outros]);

  // ---- KPIs ----
  const receitaAplic = filtradas.reduce((s, r) => s + Number(r.valor_total || 0), 0);
  const receitaOutros = outros.reduce((s, r) => s + Number(r.valor_total || 0), 0);
  const receitaTotal = receitaAplic + receitaOutros;
  const volumeAplic = filtradas.length;
  const volumeTotal = volumeAplic + outros.length;
  const ticketAplic = volumeAplic ? receitaAplic / volumeAplic : 0;
  const ticketOutros = outros.length ? receitaOutros / outros.length : 0;
  const noShowAplic = volumeAplic ? (filtradas.filter(isNoShow).length / volumeAplic) * 100 : 0;
  const noShowOutros = outros.length ? (outros.filter(isNoShow).length / outros.length) * 100 : 0;
  const shareReceita = receitaTotal ? (receitaAplic / receitaTotal) * 100 : 0;
  const shareVolume = volumeTotal ? (volumeAplic / volumeTotal) * 100 : 0;

  const ultimoMes = mensal.at(-1);
  const penultimoMes = mensal.at(-2);
  const variacaoMoM =
    penultimoMes && penultimoMes.receitaAplicacoes > 0
      ? ((ultimoMes!.receitaAplicacoes - penultimoMes.receitaAplicacoes) / penultimoMes.receitaAplicacoes) * 100
      : null;

  // ---- top aplicações ----
  const porAplicacao = useMemo(() => {
    const map = new Map<string, { nome: string; volume: number; receita: number; noShows: number; profissionais: Set<number> }>();
    for (const r of filtradas) {
      const nome = r.procedimentos?.nome ?? "Sem procedimento";
      const cur = map.get(nome) ?? { nome, volume: 0, receita: 0, noShows: 0, profissionais: new Set<number>() };
      cur.volume += 1;
      cur.receita += Number(r.valor_total || 0);
      if (isNoShow(r)) cur.noShows += 1;
      if (r.profissional_id != null) cur.profissionais.add(r.profissional_id);
      map.set(nome, cur);
    }
    return Array.from(map.values()).map((v) => ({
      nome: v.nome,
      volume: v.volume,
      receita: v.receita,
      ticket: v.volume ? v.receita / v.volume : 0,
      taxaNoShow: v.volume ? (v.noShows / v.volume) * 100 : 0,
      profissionais: v.profissionais.size,
    }));
  }, [filtradas]);

  const topAplicacoes = useMemo(() => {
    const sorted = [...porAplicacao].sort((a, b) =>
      ordenacao === "volume" ? b.volume - a.volume : ordenacao === "ticket" ? b.ticket - a.ticket : b.receita - a.receita,
    );
    return sorted.slice(0, 10);
  }, [porAplicacao, ordenacao]);

  // ---- regiões ----
  const porRegiao = useMemo(() => {
    const map = new Map<string, { bairro: string; total: number; receita: number; noShows: number }>();
    for (const r of filtradas) {
      const bairro = (r.paciente_id != null ? regioes?.get(r.paciente_id)?.bairro : null) ?? null;
      if (!bairro) continue;
      const cur = map.get(bairro) ?? { bairro, total: 0, receita: 0, noShows: 0 };
      cur.total += 1;
      cur.receita += Number(r.valor_total || 0);
      if (isNoShow(r)) cur.noShows += 1;
      map.set(bairro, cur);
    }
    return Array.from(map.values())
      .map((v) => ({ ...v, taxaNoShow: v.total ? (v.noShows / v.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filtradas, regioes]);

  // ---- região × tipo de aplicação (empilhado) ----
  const regiaoPorTipo = useMemo(() => {
    // 5 aplicações mais relevantes viram séries; o resto agrupa em "Outras".
    const tops = [...porAplicacao]
      .sort((a, b) => (metricaRegiao === "receita" ? b.receita - a.receita : b.volume - a.volume))
      .slice(0, 5)
      .map((a) => a.nome);
    const series = [...tops, "Outras"];

    const map = new Map<string, Record<string, number> & { bairro: string; _total: number }>();
    for (const r of filtradas) {
      const bairro = (r.paciente_id != null ? regioes?.get(r.paciente_id)?.bairro : null) ?? null;
      if (!bairro) continue;
      const nome = r.procedimentos?.nome ?? "Sem procedimento";
      const key = tops.includes(nome) ? nome : "Outras";
      const cur = map.get(bairro) ?? ({ bairro, _total: 0 } as Record<string, number> & { bairro: string; _total: number });
      const inc = metricaRegiao === "receita" ? Number(r.valor_total || 0) : 1;
      cur[key] = (cur[key] ?? 0) + inc;
      cur._total += inc;
      map.set(bairro, cur);
    }
    const dados = Array.from(map.values()).sort((a, b) => b._total - a._total).slice(0, 10);
    const usadas = series.filter((s) => dados.some((d) => (d[s] ?? 0) > 0));
    return { dados, series: usadas };
  }, [filtradas, regioes, porAplicacao, metricaRegiao]);

  // ---- profissionais ----
  const porProfissional = useMemo(() => {
    const map = new Map<string, { profissional: string; total: number; receita: number; realizadas: number; noShows: number }>();
    for (const r of filtradas) {
      const nome = r.profissionais?.nome ?? "Sem profissional";
      const cur = map.get(nome) ?? { profissional: nome, total: 0, receita: 0, realizadas: 0, noShows: 0 };
      cur.total += 1;
      cur.receita += Number(r.valor_total || 0);
      if (isRealizado(r)) cur.realizadas += 1;
      if (isNoShow(r)) cur.noShows += 1;
      map.set(nome, cur);
    }
    return Array.from(map.values())
      .map((v) => ({ ...v, ticket: v.total ? v.receita / v.total : 0, taxaNoShow: v.total ? (v.noShows / v.total) * 100 : 0 }))
      .sort((a, b) => b.receita - a.receita);
  }, [filtradas]);

  // ---- forecast (regressão linear sobre a série mensal) ----
  const forecast = useMemo(() => {
    const base = mensal.slice(-6).map((m, i) => ({ i, mes: m.mes, receita: m.receitaAplicacoes, volume: m.volume }));
    const serie: { mes: string; receita: number | null; volume: number | null; projecao: number | null }[] = base.map((b) => ({
      mes: b.mes, receita: b.receita, volume: b.volume, projecao: null,
    }));
    if (base.length < 2) return { serie, projecao90: null as number | null };

    const n = base.length;
    const sx = base.reduce((s, b) => s + b.i, 0);
    const sy = base.reduce((s, b) => s + b.receita, 0);
    const sxy = base.reduce((s, b) => s + b.i * b.receita, 0);
    const sxx = base.reduce((s, b) => s + b.i * b.i, 0);
    const denom = n * sxx - sx * sx;
    const slope = denom ? (n * sxy - sx * sy) / denom : 0;
    const intercept = (sy - slope * sx) / n;

    serie[serie.length - 1].projecao = base[n - 1].receita;
    const last = base[n - 1];
    const [y, m] = last.mes.split("-").map(Number);
    let acumulado = 0;
    for (let k = 1; k <= 2; k++) {
      const d = new Date(y, m - 1 + k, 1);
      const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const valor = Math.max(0, intercept + slope * (last.i + k));
      acumulado += valor;
      serie.push({ mes, receita: null, volume: null, projecao: valor });
    }
    return { serie, projecao90: acumulado };
  }, [mensal]);

  // ---- oportunidades ----
  const oportunidades = useMemo(() => {
    return porAplicacao
      .map((a) => {
        if (a.taxaNoShow > 20)
          return { ...a, tom: "warn" as const, texto: `No-show de ${pct(a.taxaNoShow)} — confirmar por WhatsApp 24h antes.` };
        if (a.volume < 20 && a.ticket > 500)
          return { ...a, tom: "info" as const, texto: `Ticket de ${brl(a.ticket)} com apenas ${num(a.volume)} aplicações — espaço para expandir agenda.` };
        if (a.volume >= 20)
          return { ...a, tom: "ok" as const, texto: `${num(a.volume)} aplicações e ${brl(a.receita)} no período — fluxo consolidado.` };
        return { ...a, tom: "neutral" as const, texto: `${num(a.volume)} aplicações no período — volume ainda baixo para conclusão.` };
      })
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6);
  }, [porAplicacao]);

  const loading = q.isLoading;
  const semDados = !loading && filtradas.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Aplicações Injetáveis</h1>
          <p className="text-sm text-muted-foreground">
            Receita, comparecimento e rentabilidade das aplicações (Tirzepatida, vitaminas IM, toxina botulínica e afins).
          </p>
        </div>
        <Badge variant="outline" className="text-[11px]">
          Estoque e validade chegam quando o módulo Produtos do Feegow for liberado
        </Badge>
      </div>

      {/* Filtros locais */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="min-w-52">
            <div className="text-xs text-muted-foreground mb-1">Tipo de aplicação</div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-52 justify-start font-normal">
                  {tiposSelecionados.length ? `${tiposSelecionados.length} selecionado(s)` : "Todas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-h-72 overflow-auto" align="start">
                {tiposDisponiveis.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma aplicação no período.</p>
                ) : tiposDisponiveis.map((t) => (
                  <label key={t} className="flex items-start gap-2 py-1 text-xs cursor-pointer">
                    <Checkbox
                      checked={tiposSelecionados.includes(t)}
                      onCheckedChange={(v) =>
                        setTiposSelecionados((prev) => (v ? [...prev, t] : prev.filter((x) => x !== t)))
                      }
                    />
                    <span className="leading-tight">{t}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <div className="min-w-52">
            <div className="text-xs text-muted-foreground mb-1">Região (bairro)</div>
            <Select value={bairroFiltro} onValueChange={setBairroFiltro}>
              <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todos">Todos os bairros</SelectItem>
                {bairrosDisponiveis.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-60 flex-1 max-w-sm">
            <div className="text-xs text-muted-foreground mb-1">
              Faixa de ticket: {brl(ticketRange[0])} – {brl(ticketRange[1])}
            </div>
            <Slider
              value={ticketRange}
              min={0}
              max={1000}
              step={50}
              onValueChange={(v) => setTicketRange([v[0], v[1]] as [number, number])}
            />
          </div>

          {(tiposSelecionados.length > 0 || bairroFiltro !== "todos" || ticketRange[0] !== 0 || ticketRange[1] !== 1000) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTiposSelecionados([]); setBairroFiltro("todos"); setTicketRange([0, 1000]); }}
            >
              Limpar
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Seção 1 — KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi
          label="Receita de aplicações"
          value={loading ? "…" : brl(receitaAplic)}
          color="var(--chart-2)"
          sub={
            variacaoMoM == null
              ? `${pct(shareReceita)} da receita da clínica`
              : `${variacaoMoM >= 0 ? "↑" : "↓"} ${pct(Math.abs(variacaoMoM))} vs. mês anterior · ${pct(shareReceita)} da clínica`
          }
        />
        <Kpi
          label="Volume de aplicações"
          value={loading ? "…" : num(volumeAplic)}
          color="var(--chart-4)"
          sub={`${pct(shareVolume)} dos agendamentos do período`}
        />
        <Kpi
          label="Ticket médio"
          value={loading ? "…" : brl(ticketAplic)}
          color="var(--chart-1)"
          sub={`vs. ${brl(ticketOutros)} nos demais procedimentos`}
        />
        <Kpi
          label="Taxa de no-show"
          value={loading ? "…" : pct(noShowAplic)}
          color={noShowAplic < 15 ? "var(--chart-2)" : noShowAplic <= 20 ? "var(--chart-3)" : "var(--destructive)"}
          sub={`vs. ${pct(noShowOutros)} nos demais procedimentos`}
        />
      </div>

      {semDados && (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          Sem aplicações injetáveis nesse período/filtro. Amplie o intervalo de datas ou limpe os filtros locais.
        </CardContent></Card>
      )}

      {/* Seção 2 — grid 2x2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Receita: aplicações vs. restante da clínica</CardTitle>
            <p className="text-xs text-muted-foreground">
              {loading ? "Carregando…" :
                `Aplicações representam ${pct(shareReceita)} da receita — ${
                  variacaoMoM == null ? "histórico curto para tendência" :
                  variacaoMoM > 5 ? "crescendo" : variacaoMoM < -5 ? "caindo" : "estável"}.`}
            </p>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? <Skeleton className="h-full w-full" /> : mensal.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mensal}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="mes" tickFormatter={mesLabel} />
                  <YAxis {...axisProps} tickFormatter={compactBrl} width={70} />
                  <Tooltip
                    {...tooltipProps}
                    labelFormatter={(l) => `Mês ${mesLabel(String(l))}`}
                    formatter={(v: number, n: string) => [brl(Number(v)), n === "receitaAplicacoes" ? "Aplicações" : "Demais procedimentos"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "receitaAplicacoes" ? "Aplicações" : "Demais procedimentos")} />
                  <Area type="monotone" dataKey="receitaAplicacoes" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.55} />
                  <Area type="monotone" dataKey="receitaOutros" stackId="1" stroke="var(--muted-foreground)" fill="var(--muted-foreground)" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Top 10 aplicações</CardTitle>
              <p className="text-xs text-muted-foreground">Volume e ticket médio lado a lado.</p>
            </div>
            <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receita">Por receita</SelectItem>
                <SelectItem value="volume">Por volume</SelectItem>
                <SelectItem value="ticket">Por ticket médio</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? <Skeleton className="h-full w-full" /> : topAplicacoes.length === 0 ? <Vazio /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topAplicacoes} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis {...axisProps} type="number" />
                  <YAxis
                    {...axisProps}
                    type="category"
                    dataKey="nome"
                    width={170}
                    tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                  />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: number, n: string) => [n === "ticket" ? brl(Number(v)) : num(Number(v)), n === "ticket" ? "Ticket médio" : "Volume"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "ticket" ? "Ticket médio (R$)" : "Volume")} />
                  <Bar dataKey="volume" fill="var(--chart-4)" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="ticket" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aplicações por região</CardTitle>
            <p className="text-xs text-muted-foreground">Top 10 bairros — receita em barra, no-show em linha.</p>
          </CardHeader>
          <CardContent className="h-80">
            {loading || regioesQ.isLoading ? <Skeleton className="h-full w-full" /> : porRegiao.length === 0 ? (
              <Vazio>Sem bairro cadastrado nos pacientes destas aplicações.</Vazio>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={porRegiao} margin={{ bottom: 40 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="bairro" interval={0} angle={-35} textAnchor="end" height={60} />
                  <YAxis {...axisProps} yAxisId="l" tickFormatter={compactBrl} width={70} />
                  <YAxis {...axisProps} yAxisId="r" orientation="right" tickFormatter={(v) => `${v}%`} width={45} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: number, n: string) => [n === "receita" ? brl(Number(v)) : pct(Number(v)), n === "receita" ? "Receita" : "No-show"]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "receita" ? "Receita" : "No-show %")} />
                  <Bar yAxisId="l" dataKey="receita" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="taxaNoShow" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Qual aplicação em cada região</CardTitle>
              <p className="text-xs text-muted-foreground">Top 10 bairros — barras empilhadas pelas 5 aplicações mais relevantes.</p>
            </div>
            <Select value={metricaRegiao} onValueChange={(v) => setMetricaRegiao(v as "volume" | "receita")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="volume">Por volume</SelectItem>
                <SelectItem value="receita">Por receita</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-96">
            {loading || regioesQ.isLoading ? <Skeleton className="h-full w-full" /> : regiaoPorTipo.dados.length === 0 ? (
              <Vazio>Sem bairro cadastrado nos pacientes destas aplicações.</Vazio>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regiaoPorTipo.dados} margin={{ bottom: 10 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="bairro" interval={0} angle={-35} textAnchor="end" height={100} />
                  <YAxis {...axisProps} tickFormatter={(v) => (metricaRegiao === "receita" ? compactBrl(Number(v)) : num(Number(v)))} width={70} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(v: number, n: string) => [metricaRegiao === "receita" ? brl(Number(v)) : num(Number(v)), n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} verticalAlign="top" align="left" />
                  {regiaoPorTipo.series.map((s, i) => (
                    <Bar key={s} dataKey={s} stackId="a" fill={`var(--chart-${(i % 5) + 1})`} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>



        <Card>
          <CardHeader>
            <CardTitle>No-show: aplicações vs. demais</CardTitle>
            <p className="text-xs text-muted-foreground">Meta da clínica: {META_NO_SHOW}%.</p>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {loading ? <Skeleton className="h-40 w-full" /> : (
              <>
                <Bullet label="Aplicações injetáveis" valor={noShowAplic} total={volumeAplic} />
                <Bullet label="Demais procedimentos" valor={noShowOutros} total={outros.length} />
                <p className="text-xs text-muted-foreground">
                  {noShowAplic < noShowOutros
                    ? `Pacientes de aplicação faltam ${pct(noShowOutros - noShowAplic)} menos que a média — vale ampliar a agenda desse fluxo.`
                    : `Aplicações faltam ${pct(noShowAplic - noShowOutros)} a mais que a média — reforce a confirmação prévia.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Seção 3 — profissionais */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Rentabilidade por profissional</CardTitle>
            <p className="text-xs text-muted-foreground">
              Linha destacada quando o ticket supera a média ({brl(ticketAplic)}) ou o no-show passa de 20%.
            </p>
          </div>
          <Button
            variant="outline" size="sm"
            disabled={!porProfissional.length}
            onClick={() => downloadCsv("aplicacoes-por-profissional.csv", porProfissional.map((p) => ({
              Profissional: p.profissional, Aplicacoes: p.total, Receita: p.receita.toFixed(2),
              TicketMedio: p.ticket.toFixed(2), Realizadas: p.realizadas, NoShows: p.noShows,
              TaxaNoShow: p.taxaNoShow.toFixed(2),
            })))}
          >
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 w-full" /> : porProfissional.length === 0 ? <Vazio /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Profissional</TableHead>
                    <TableHead className="text-right">Aplicações</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead className="text-right">Realizadas</TableHead>
                    <TableHead className="text-right">No-show</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {porProfissional.map((p) => (
                    <TableRow key={p.profissional}>
                      <TableCell className="font-medium">{p.profissional}</TableCell>
                      <TableCell className="text-right">{num(p.total)}</TableCell>
                      <TableCell className="text-right">{brl(p.receita)}</TableCell>
                      <TableCell className={`text-right ${p.ticket > ticketAplic ? "text-[var(--chart-2)] font-medium" : ""}`}>
                        {brl(p.ticket)}
                      </TableCell>
                      <TableCell className="text-right">{num(p.realizadas)}</TableCell>
                      <TableCell className={`text-right ${p.taxaNoShow > 20 ? "text-destructive font-medium" : ""}`}>
                        {pct(p.taxaNoShow)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 4 — tendência e projeção */}
      <Card>
        <CardHeader>
          <CardTitle>Tendência e projeção</CardTitle>
          <p className="text-xs text-muted-foreground">
            {forecast.projecao90 == null
              ? "Projeção exige ao menos 2 meses de histórico no filtro atual."
              : `Mantido o ritmo atual, as aplicações somam ${brl(forecast.projecao90)} nos próximos 60 dias.`}
          </p>
        </CardHeader>
        <CardContent className="h-80">
          {loading ? <Skeleton className="h-full w-full" /> : forecast.serie.length === 0 ? <Vazio /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={forecast.serie}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="mes" tickFormatter={mesLabel} />
                <YAxis {...axisProps} tickFormatter={compactBrl} width={70} />
                <Tooltip
                  {...tooltipProps}
                  labelFormatter={(l) => `Mês ${mesLabel(String(l))}`}
                  formatter={(v: number, n: string) => [
                    n === "volume" ? num(Number(v)) : brl(Number(v)),
                    n === "receita" ? "Receita realizada" : n === "projecao" ? "Projeção" : "Volume",
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "receita" ? "Receita" : v === "projecao" ? "Projeção" : "Volume")} />
                <Line type="monotone" dataKey="receita" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="projecao" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
                <Line type="monotone" dataKey="volume" stroke="var(--chart-4)" strokeWidth={1.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Seção 5 — oportunidades */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Oportunidades de crescimento</h2>
        {loading ? <Skeleton className="h-24 w-full" /> : oportunidades.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">Sem aplicações no filtro atual.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {oportunidades.map((o) => {
              const cor = o.tom === "warn" ? "var(--chart-3)" : o.tom === "info" ? "var(--chart-4)" : o.tom === "ok" ? "var(--chart-2)" : "var(--muted-foreground)";
              return (
                <Card key={o.nome} className="border-l-4" style={{ borderLeftColor: cor }}>
                  <CardContent className="p-4">
                    <div className="text-sm font-medium leading-tight">{o.nome}</div>
                    <div className="text-xs text-muted-foreground mt-1">{o.texto}</div>
                    <div className="text-xs mt-2 flex gap-3">
                      <span>{num(o.volume)} aplic.</span>
                      <span>{brl(o.receita)}</span>
                      <span>{pct(o.taxaNoShow)} no-show</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl xl:text-3xl font-bold mt-2 tracking-tight tabular-nums truncate" style={{ color }} title={value}>{value}</div>
        <div className="text-xs text-muted-foreground mt-2">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Bullet({ label, valor, total }: { label: string; valor: number; total: number }) {
  const cor = valor < 15 ? "var(--chart-2)" : valor <= 20 ? "var(--chart-3)" : "var(--destructive)";
  const largura = Math.min(100, (valor / 40) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: cor }}>{pct(valor)}</span>
      </div>
      <div className="relative h-3 mt-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${largura}%`, background: cor }} />
        <div className="absolute top-0 h-full w-px bg-foreground/70" style={{ left: `${(META_NO_SHOW / 40) * 100}%` }} />
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{num(total)} agendamentos · meta {META_NO_SHOW}%</div>
    </div>
  );
}

function Vazio({ children }: { children?: string }) {
  return (
    <div className="h-full min-h-32 w-full grid place-items-center text-center text-sm text-muted-foreground px-6">
      {children ?? "Sem aplicações nesse período."}
    </div>
  );
}
