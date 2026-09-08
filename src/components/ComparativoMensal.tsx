import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { startOfMonth, subMonths, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { brl, num, pct } from "@/lib/format";
import { fetchLabProducaoRows } from "@/lib/dashboard-data";
import { useFilters } from "@/lib/filters-context";
import { tooltipProps } from "@/lib/chart-theme";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
];

const JANELAS = [6, 12, 18, 24] as const;

type Dimensao = "grupo_nome" | "profissional_nome" | "convenio_nome" | "procedimento_nome";

const DIM_LABEL: Record<Dimensao, string> = {
  grupo_nome: "Categoria",
  profissional_nome: "Profissional",
  convenio_nome: "Convênio/Origem",
  procedimento_nome: "Procedimento",
};

const rotuloMes = (chave: string) => {
  const [ano, mes] = chave.split("-");
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  return format(d, "MMM/yy", { locale: ptBR });
};

export function ComparativoMensal() {
  const filters = useFilters();
  const [janela, setJanela] = useState<number>(12);
  const [dimensao, setDimensao] = useState<Dimensao>("grupo_nome");
  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  const range = useMemo(() => {
    const to = endOfMonth(new Date());
    const from = startOfMonth(subMonths(new Date(), janela - 1));
    return { from, to };
  }, [janela]);

  const { data: dados = [], isLoading } = useQuery({
    queryKey: [
      "comparativoMensal",
      janela,
      filters.unidadeIds,
      filters.profissionalIds,
      filters.convenioTipo,
    ],
    queryFn: () =>
      fetchLabProducaoRows(
        { ...filters, from: range.from, to: range.to, preset: "custom" },
        60_000
      ),
  });

  const meses = useMemo(() => {
    const map = new Map<string, { chave: string; valor: number; qtd: number }>();
    for (let i = janela - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const chave = format(d, "yyyy-MM");
      map.set(chave, { chave, valor: 0, qtd: 0 });
    }
    for (const r of dados) {
      const iso = (r.data_execucao || "").slice(0, 7);
      if (!iso) continue;
      const cur = map.get(iso);
      if (!cur) continue;
      cur.valor += Number(r.valor || 0);
      cur.qtd += 1;
    }
    return Array.from(map.values()).map((m) => ({
      ...m,
      label: rotuloMes(m.chave),
      ticket: m.qtd > 0 ? m.valor / m.qtd : 0,
    }));
  }, [dados, janela]);

  const toggleMes = (chave: string) =>
    setMesesSel((prev) =>
      prev.includes(chave) ? prev.filter((m) => m !== chave) : [...prev, chave]
    );

  const mesesOrdenados = useMemo(
    () => [...mesesSel].sort(),
    [mesesSel]
  );

  const comparativo = useMemo(() => {
    if (mesesOrdenados.length === 0) return [];
    const map = new Map<string, any>();
    for (const r of dados) {
      const mes = (r.data_execucao || "").slice(0, 7);
      if (!mesesOrdenados.includes(mes)) continue;
      let chave = (r as any)[dimensao];
      if (dimensao === "convenio_nome") chave = chave || "Particular";
      chave = String(chave || "Não informado").trim();
      let cur = map.get(chave);
      if (!cur) {
        cur = { name: chave, total: 0 };
        mesesOrdenados.forEach((m) => {
          cur[m] = 0;
          cur[`${m}_qtd`] = 0;
        });
        map.set(chave, cur);
      }
      cur[mes] = (cur[mes] || 0) + Number(r.valor || 0);
      cur[`${mes}_qtd`] = (cur[`${mes}_qtd`] || 0) + 1;
      cur.total += Number(r.valor || 0);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [dados, mesesOrdenados, dimensao]);

  const comparativoFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return comparativo;
    return comparativo.filter((c) => c.name.toLowerCase().includes(q));
  }, [comparativo, busca]);

  const totaisPorMes = useMemo(() => {
    const t: Record<string, number> = {};
    for (const m of mesesOrdenados) {
      t[m] = comparativo.reduce((s, c) => s + (c[m] || 0), 0);
    }
    return t;
  }, [comparativo, mesesOrdenados]);

  const primeiro = mesesOrdenados[0];
  const ultimo = mesesOrdenados[mesesOrdenados.length - 1];
  const mostraVariacao = mesesOrdenados.length >= 2;

  const variacaoGeral =
    mostraVariacao && totaisPorMes[primeiro] > 0
      ? ((totaisPorMes[ultimo] - totaisPorMes[primeiro]) /
          totaisPorMes[primeiro]) *
        100
      : 0;

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div>
            <CardTitle className="text-lg font-bold">
              Comparativo Mensal de Faturamento
            </CardTitle>
            <CardDescription>
              Clique em dois ou mais meses para comparar lado a lado.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(janela)}
              onValueChange={(v) => {
                setJanela(Number(v));
                setMesesSel([]);
              }}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JANELAS.map((j) => (
                  <SelectItem key={j} value={String(j)} className="text-xs">
                    Últimos {j} meses
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dimensao}
              onValueChange={(v) => setDimensao(v as Dimensao)}
            >
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DIM_LABEL) as Dimensao[]).map((d) => (
                  <SelectItem key={d} value={d} className="text-xs">
                    Por {DIM_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mesesSel.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setMesesSel([])}
              >
                Limpar seleção
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Linha do tempo mensal */}
        <div className="w-full h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={meses}
              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p?.chave) toggleMes(p.chave);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
              />
              <Tooltip
                {...tooltipProps}
                cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                formatter={(val: any, _n: any, props: any) => [
                  `${brl(Number(val))} — ${num(props.payload.qtd)} itens (TM ${brl(
                    props.payload.ticket
                  )})`,
                  "Faturado",
                ]}
              />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]} className="cursor-pointer">
                {meses.map((m, idx) => {
                  const ativo = mesesSel.includes(m.chave);
                  return (
                    <Cell
                      key={m.chave}
                      fill={PALETTE[idx % PALETTE.length]}
                      fillOpacity={
                        mesesSel.length === 0 ? 0.7 : ativo ? 0.95 : 0.22
                      }
                      stroke={ativo ? PALETTE[idx % PALETTE.length] : "transparent"}
                      strokeWidth={2}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chips de meses */}
        <div className="flex flex-wrap gap-1.5">
          {meses.map((m, idx) => {
            const ativo = mesesSel.includes(m.chave);
            return (
              <button
                key={m.chave}
                type="button"
                onClick={() => toggleMes(m.chave)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all hover:bg-muted/60 ${
                  ativo
                    ? "border-primary/60 bg-muted/60"
                    : "border-border/50 bg-muted/20"
                } ${mesesSel.length > 0 && !ativo ? "opacity-50" : ""}`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                />
                <span className="capitalize">{m.label}</span>
                <span className="text-muted-foreground font-normal whitespace-nowrap">
                  {brl(m.valor)}
                </span>
              </button>
            );
          })}
        </div>

        {mesesOrdenados.length > 0 && (
          <div className="pt-6 border-t border-border space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Cards de totais */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {mesesOrdenados.map((m, idx) => (
                <div
                  key={m}
                  className="rounded-lg border border-border/60 bg-muted/20 p-3"
                >
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {rotuloMes(m)}
                  </p>
                  <p
                    className="text-lg font-semibold"
                    style={{ color: PALETTE[idx % PALETTE.length] }}
                  >
                    {brl(totaisPorMes[m] || 0)}
                  </p>
                </div>
              ))}
              {mostraVariacao && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Variação {rotuloMes(primeiro)} → {rotuloMes(ultimo)}
                  </p>
                  <p
                    className={`text-lg font-semibold flex items-center gap-1 ${
                      variacaoGeral > 0
                        ? "text-emerald-500"
                        : variacaoGeral < 0
                          ? "text-red-500"
                          : ""
                    }`}
                  >
                    {variacaoGeral > 0 ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : variacaoGeral < 0 ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <Minus className="h-4 w-4" />
                    )}
                    {pct(variacaoGeral)}
                  </p>
                </div>
              )}
            </div>

            {/* Gráfico comparativo por dimensão */}
            <div>
              <h3 className="text-sm font-semibold mb-1">
                Comparativo por {DIM_LABEL[dimensao]}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Barras lado a lado de cada mês selecionado.
              </p>
              <div
                style={{
                  height: Math.max(
                    300,
                    Math.min(comparativoFiltrado.length, 25) *
                      (18 * Math.max(1, mesesOrdenados.length) + 14)
                  ),
                  width: "100%",
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={comparativoFiltrado.slice(0, 25)}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    barSize={14}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      vertical
                      opacity={0.3}
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...tooltipProps}
                      cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                      formatter={(val: any, name: any, props: any) => {
                        const qtd = props.payload[`${name}_qtd`] || 0;
                        return [
                          `${brl(Number(val))} (${num(qtd)} itens)`,
                          rotuloMes(String(name)),
                        ];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                      formatter={(v) => rotuloMes(String(v))}
                    />
                    {mesesOrdenados.map((m) => {
                      const idx = meses.findIndex((x) => x.chave === m);
                      return (
                        <Bar
                          key={m}
                          dataKey={m}
                          name={m}
                          fill={PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length]}
                          radius={[0, 4, 4, 0]}
                        />
                      );
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela comparativa */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold">
                  Tabela comparativa por {DIM_LABEL[dimensao]}
                </h3>
                <div className="relative w-full sm:w-[280px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={`Pesquisar ${DIM_LABEL[dimensao].toLowerCase()}...`}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-card w-full">
                <ScrollArea className="h-[360px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                      <TableRow>
                        <TableHead>{DIM_LABEL[dimensao]}</TableHead>
                        {mesesOrdenados.map((m) => (
                          <TableHead key={m} className="text-right capitalize">
                            {rotuloMes(m)}
                          </TableHead>
                        ))}
                        {mostraVariacao && (
                          <TableHead className="text-right">Variação</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparativoFiltrado.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={mesesOrdenados.length + 2}
                            className="text-center h-32 text-muted-foreground"
                          >
                            Nenhum resultado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        comparativoFiltrado.map((c) => {
                          const base = c[primeiro] || 0;
                          const fim = c[ultimo] || 0;
                          const varPct =
                            base > 0 ? ((fim - base) / base) * 100 : fim > 0 ? 100 : 0;
                          return (
                            <TableRow key={c.name} className="hover:bg-muted/30">
                              <TableCell
                                className="text-xs font-medium truncate max-w-[220px]"
                                title={c.name}
                              >
                                {c.name}
                              </TableCell>
                              {mesesOrdenados.map((m) => (
                                <TableCell
                                  key={m}
                                  className="text-right text-xs whitespace-nowrap"
                                >
                                  {brl(c[m] || 0)}
                                </TableCell>
                              ))}
                              {mostraVariacao && (
                                <TableCell
                                  className={`text-right text-xs font-medium whitespace-nowrap ${
                                    varPct > 0
                                      ? "text-emerald-500"
                                      : varPct < 0
                                        ? "text-red-500"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {pct(varPct)}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
