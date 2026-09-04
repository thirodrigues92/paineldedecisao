import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useFilters } from "@/lib/filters-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { RefreshCw, LayoutGrid, BarChart2, SlidersHorizontal, Filter, FilterX, Check } from "lucide-react";
import { GlobalFilters } from "@/components/GlobalFilters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/faturamento-dinamico")({
  component: FaturamentoDinamicoPage,
});

type Dimensao = "profissional" | "convenio" | "grupo_procedimento" | "procedimento" | "mes_ano";
type Metrica = "valor_faturado" | "valor_recebido" | "quantidade";

const DIMENSAO_LABELS: Record<Dimensao, string> = {
  profissional: "Profissional",
  convenio: "Convênio/Origem",
  grupo_procedimento: "Grupo de Proced.",
  procedimento: "Procedimento",
  mes_ano: "Mês/Ano",
};

const METRICA_LABELS: Record<Metrica, string> = {
  valor_faturado: "Valor Faturado (R$)",
  valor_recebido: "Valor Recebido (R$)",
  quantidade: "Qtd. Procedimentos",
};

const METRICA_SHORT_LABELS: Record<Metrica, string> = {
  valor_faturado: "Faturado",
  valor_recebido: "Recebido",
  quantidade: "Qtd.",
};

const METRICAS_DISPONIVEIS: Metrica[] = ["valor_faturado", "valor_recebido", "quantidade"];

// Paleta de cores VIVAS para os gráficos dinâmicos
const CHART_COLORS = [
  "#3b82f6", // Azul Vivo
  "#22c55e", // Verde Vivo
  "#f59e0b", // Âmbar Vivo
  "#ef4444", // Vermelho Vivo
  "#8b5cf6", // Roxo Vivo
  "#f97316", // Laranja Vivo
  "#06b6d4", // Ciano Vivo
  "#ec4899", // Rosa Vivo
  "#84cc16", // Lima Vivo
  "#14b8a6",  // Turquesa Vivo
];

function formatValorMetrica(metrica: Metrica, valor: number | undefined | null): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return "-";
  if (metrica === "quantidade") {
    return Math.round(valor).toLocaleString("pt-BR");
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function isKeyMetrica(key: string): key is Metrica {
  return key === "valor_faturado" || key === "valor_recebido" || key === "quantidade";
}

function FaturamentoDinamicoPage() {
  const filters = useFilters();
  const [linha, setLinha] = useState<Dimensao>("profissional");
  const [coluna, setColuna] = useState<Dimensao | "none">("none");
  const [metricas, setMetricas] = useState<Metrica[]>(["valor_faturado"]);
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  // Filtros locais para drill-down
  const [filtroProfissionais, setFiltroProfissionais] = useState<string[]>([]);
  const [filtroConvenios, setFiltroConvenios] = useState<string[]>([]);
  const [filtroProcedimentos, setFiltroProcedimentos] = useState<string[]>([]);
  const [filtroGrupos, setFiltroGrupos] = useState<string[]>([]);

  const umaMetrica = metricas.length === 1;
  const metricaUnica = umaMetrica ? metricas[0] : null;

  const toggleMetrica = (m: Metrica) => {
    setMetricas((prev) => {
      if (prev.includes(m)) {
        const proximas = prev.filter((x) => x !== m);
        return proximas.length > 0 ? proximas : prev; // nunca deixa sem métrica
      }
      return [...prev, m];
    });
  };

  // Busca consolidada dos dados
  const { data: rawData, isLoading } = useQuery({
    queryKey: ["faturamento-dinamico", filters.from, filters.to, filters.unidadeIds, filters.profissionalIds],
    queryFn: async () => {
      const ds = format(filters.from, "yyyy-MM-dd");
      const de = format(filters.to, "yyyy-MM-dd");

      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        let query = supabase
          .from("lab_producao_feegow")
          .select("data_execucao, profissional_nome, procedimento_nome, grupo_nome, convenio_nome, valor, valor_pago")
          .gte("data_execucao", ds)
          .lte("data_execucao", de);

        if (filters.unidadeIds.length > 0) {
          query = query.in("unidade_id", filters.unidadeIds);
        }
        if (filters.profissionalIds.length > 0) {
          query = query.in("profissional_id", filters.profissionalIds);
        }

        const { data, error } = await query.range(from, from + pageSize - 1);

        if (error) {
          console.error("Erro buscando dados:", error);
          throw error;
        }

        if (!data || data.length === 0) break;
        allData = [...allData, ...data];

        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData;
    },
  });

  // Extrair opções únicas para os filtros
  const filterOptions = useMemo(() => {
    if (!rawData) return { profissionais: [], convenios: [], procedimentos: [], grupos: [] };
    return {
      profissionais: Array.from(new Set(rawData.map((d) => d.profissional_nome || "Sem Profissional"))).sort(),
      convenios: Array.from(new Set(rawData.map((d) => d.convenio_nome || "Sem Convênio"))).sort(),
      procedimentos: Array.from(new Set(rawData.map((d) => d.procedimento_nome || "Sem Procedimento"))).sort(),
      grupos: Array.from(new Set(rawData.map((d) => d.grupo_nome || "Sem Grupo"))).sort(),
    };
  }, [rawData]);

  // Aplicar filtros locais aos dados brutos
  const filteredData = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter((item) => {
      const p = item.profissional_nome || "Sem Profissional";
      const c = item.convenio_nome || "Sem Convênio";
      const pr = item.procedimento_nome || "Sem Procedimento";
      const g = item.grupo_nome || "Sem Grupo";

      if (filtroProfissionais.length > 0 && !filtroProfissionais.includes(p)) return false;
      if (filtroConvenios.length > 0 && !filtroConvenios.includes(c)) return false;
      if (filtroProcedimentos.length > 0 && !filtroProcedimentos.includes(pr)) return false;
      if (filtroGrupos.length > 0 && !filtroGrupos.includes(g)) return false;

      return true;
    });
  }, [rawData, filtroProfissionais, filtroConvenios, filtroProcedimentos, filtroGrupos]);

  // Processamento do Pivot (Matriz) baseado nos dados filtrados e nas métricas selecionadas
  const { rows, colunasAtivas, totaisPorColuna, totaisGeral } = useMemo(() => {
    if (filteredData.length === 0 || metricas.length === 0) {
      return { rows: [], colunasAtivas: [], totaisPorColuna: {} as Record<string, Record<Metrica, number>>, totaisGeral: {} as Record<Metrica, number> };
    }

    const zeros = (): Record<Metrica, number> => ({
      valor_faturado: 0,
      valor_recebido: 0,
      quantidade: 0,
    });

    const pivot: Record<string, { cols: Record<string, Record<Metrica, number>>; total: Record<Metrica, number> }> = {};
    const colunasSet = new Set<string>();

    const getValDimensao = (linhaOriginal: any, dim: Dimensao) => {
      switch (dim) {
        case "profissional": return linhaOriginal.profissional_nome || "Sem Profissional";
        case "convenio": return linhaOriginal.convenio_nome || "Sem Convênio";
        case "grupo_procedimento": return linhaOriginal.grupo_nome || "Sem Grupo";
        case "procedimento": return linhaOriginal.procedimento_nome || "Sem Procedimento";
        case "mes_ano": {
          if (!linhaOriginal.data_execucao) return "Sem Data";
          try {
            return format(parseISO(linhaOriginal.data_execucao), "MMM/yyyy", { locale: ptBR });
          } catch {
            return "Data Inválida";
          }
        }
        default: return "-";
      }
    };

    filteredData.forEach((item) => {
      const rKey = getValDimensao(item, linha);
      const cKey = coluna === "none" ? "Geral" : getValDimensao(item, coluna);

      const valoresItem: Record<Metrica, number> = {
        valor_faturado: Number(item.valor) || 0,
        valor_recebido: Number(item.valor_pago) || 0,
        quantidade: 1,
      };

      colunasSet.add(cKey);

      if (!pivot[rKey]) {
        pivot[rKey] = { cols: {}, total: zeros() };
      }
      if (!pivot[rKey].cols[cKey]) {
        pivot[rKey].cols[cKey] = zeros();
      }

      metricas.forEach((m) => {
        pivot[rKey].cols[cKey][m] += valoresItem[m];
        pivot[rKey].total[m] += valoresItem[m];
      });
    });

    const metricaOrdenacao = metricas[0];
    const rowsOrdenadas = Object.entries(pivot)
      .map(([name, dados]) => ({ name, cols: dados.cols, total: dados.total }))
      .sort((a, b) => (b.total[metricaOrdenacao] ?? 0) - (a.total[metricaOrdenacao] ?? 0));

    const colunasOrdenadas = Array.from(colunasSet).sort();

    const totaisPorColunaFinal: Record<string, Record<Metrica, number>> = {};
    const totaisGeralFinal = zeros();

    rowsOrdenadas.forEach((row) => {
      Object.entries(row.cols).forEach(([c, vals]) => {
        if (!totaisPorColunaFinal[c]) totaisPorColunaFinal[c] = zeros();
        metricas.forEach((m) => {
          const v = vals[m] ?? 0;
          totaisPorColunaFinal[c][m] += v;
          totaisGeralFinal[m] += v;
        });
      });
    });

    return {
      rows: rowsOrdenadas,
      colunasAtivas: colunasOrdenadas,
      totaisPorColuna: totaisPorColunaFinal,
      totaisGeral: totaisGeralFinal,
    };
  }, [filteredData, linha, coluna, metricas]);

  // Dados formatados para o Recharts
  const graficoData = useMemo(() => {
    if (coluna === "none") {
      return rows.map((row) => {
        const item: Record<string, any> = { name: row.name };
        metricas.forEach((m) => {
          item[m] = row.total[m] ?? 0;
        });
        return item;
      });
    }

    if (umaMetrica && metricaUnica) {
      return rows.map((row) => {
        const item: Record<string, any> = { name: row.name };
        colunasAtivas.forEach((c) => {
          item[c] = row.cols[c]?.[metricaUnica] ?? 0;
        });
        return item;
      });
    }

    // Múltiplas métricas + quebra de coluna: o gráfico consolida totais por métrica
    return rows.map((row) => {
      const item: Record<string, any> = { name: row.name };
      metricas.forEach((m) => {
        item[m] = row.total[m] ?? 0;
      });
      return item;
    });
  }, [rows, coluna, metricas, colunasAtivas, umaMetrica, metricaUnica]);

  const barKeys: string[] =
    coluna !== "none" && umaMetrica && metricaUnica ? colunasAtivas : metricas;
  const stacked = coluna !== "none" && umaMetrica;
  const eixoSomenteMoeda = metricas.every((m) => m !== "quantidade");

  const toggleSerie = (payload: any) => {
    const key = payload?.dataKey ?? payload?.value;
    if (typeof key !== "string") return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatEixo = (value: number) => {
    const abs = Math.abs(value);
    const compact =
      abs >= 1_000_000
        ? `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
        : abs >= 1_000
          ? `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mil`
          : Math.round(value).toLocaleString("pt-BR");
    return eixoSomenteMoeda ? `R$ ${compact}` : compact;
  };

  const tooltipFormatter = (value: any, name: any) => {
    const label = String(name ?? "");
    const metricaDoLabel = metricas.find((m) => m === label || METRICA_LABELS[m] === label || METRICA_SHORT_LABELS[m] === label);
    if (metricaDoLabel) {
      return [formatValorMetrica(metricaDoLabel, Number(value ?? 0)), METRICA_LABELS[metricaDoLabel]];
    }
    if (metricaUnica) {
      return [formatValorMetrica(metricaUnica, Number(value ?? 0)), label];
    }
    return [String(value ?? ""), label];
  };

  const hasFiltrosAtivos = filtroProfissionais.length > 0 || filtroConvenios.length > 0 || filtroProcedimentos.length > 0 || filtroGrupos.length > 0;
  const colSpanVazio =
    1 +
    (coluna !== "none"
      ? colunasAtivas.length * metricas.length + metricas.length
      : metricas.length);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="p-6 space-y-6 flex-1 max-w-7xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <SlidersHorizontal className="w-8 h-8" />
              Faturamento Dinâmico
            </h1>
            <p className="text-muted-foreground mt-1">
              Análise flexível tipo "Tabela Dinâmica" (Pivot) sobre a produção da clínica.
            </p>
          </div>
          <div className="shrink-0">
            <GlobalFilters />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Painel de Controles da Pivot */}
          <Card className="border-border shadow-sm">
            <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Linhas (Eixo Principal)</label>
                <Select value={linha} onValueChange={(v: Dimensao) => setLinha(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DIMENSAO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Colunas (Quebra Opcional)</label>
                <Select value={coluna} onValueChange={(v: any) => setColuna(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma (Apenas Total)</SelectItem>
                    {Object.entries(DIMENSAO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} disabled={k === linha}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Métricas (selecione uma ou várias)</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {METRICAS_DISPONIVEIS.map((m) => {
                    const ativa = metricas.includes(m);
                    return (
                      <Button
                        key={m}
                        type="button"
                        variant={ativa ? "default" : "outline"}
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => toggleMetrica(m)}
                      >
                        {ativa && <Check className="w-3.5 h-3.5" />}
                        {METRICA_SHORT_LABELS[m]}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Marque mais de uma métrica para comparar, por exemplo, valor e quantidade juntos.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Painel de Filtros Detalhados */}
          <Card className="border-border shadow-sm bg-muted/10">
            <CardHeader className="px-4 py-3 border-b flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filtros Detalhados da Tabela
              </CardTitle>
              {hasFiltrosAtivos && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFiltroProfissionais([]);
                    setFiltroConvenios([]);
                    setFiltroProcedimentos([]);
                    setFiltroGrupos([]);
                  }}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  <FilterX className="w-3 h-3 mr-1" />
                  Limpar Todos
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <MultiSelectFilter
                title="Profissionais"
                options={filterOptions.profissionais}
                selected={filtroProfissionais}
                onChange={setFiltroProfissionais}
              />
              <MultiSelectFilter
                title="Convênios"
                options={filterOptions.convenios}
                selected={filtroConvenios}
                onChange={setFiltroConvenios}
              />
              <MultiSelectFilter
                title="Grupos"
                options={filterOptions.grupos}
                selected={filtroGrupos}
                onChange={setFiltroGrupos}
              />
              <MultiSelectFilter
                title="Procedimentos"
                options={filterOptions.procedimentos}
                selected={filtroProcedimentos}
                onChange={setFiltroProcedimentos}
              />
            </CardContent>
          </Card>
        </div>

        {/* Área de Resultados */}
        <Tabs defaultValue="table" className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="table" className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" /> Tabela
              </TabsTrigger>
              <TabsTrigger value="chart" className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4" /> Gráfico
              </TabsTrigger>
            </TabsList>
            {isLoading && <span className="text-sm text-muted-foreground font-mono flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Calculando...</span>}
          </div>

          <TabsContent value="table" className="p-0 outline-none">
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    {!umaMetrica && coluna !== "none" ? (
                      <>
                        <TableRow className="bg-muted/50">
                          <TableHead rowSpan={2} className="w-[250px] font-bold">{DIMENSAO_LABELS[linha]}</TableHead>
                          {colunasAtivas.map((c) => (
                            <TableHead key={c} colSpan={metricas.length} className="text-center border-x">{c}</TableHead>
                          ))}
                          <TableHead colSpan={metricas.length} className="text-center font-bold bg-muted/70 border-l">Total da Linha</TableHead>
                        </TableRow>
                        <TableRow className="bg-muted/40">
                          {colunasAtivas.flatMap((c) => metricas.map((m) => (
                            <TableHead key={`${c}|${m}`} className="text-right text-xs font-medium">{METRICA_SHORT_LABELS[m]}</TableHead>
                          )))}
                          {metricas.map((m) => (
                            <TableHead key={`total|${m}`} className="text-right text-xs font-medium">{METRICA_SHORT_LABELS[m]}</TableHead>
                          ))}
                        </TableRow>
                      </>
                    ) : (
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[250px] font-bold">{DIMENSAO_LABELS[linha]}</TableHead>
                        {coluna !== "none" && colunasAtivas.map((c) => (
                          <TableHead key={c} className="text-right font-medium">{c}</TableHead>
                        ))}
                        {!umaMetrica && coluna === "none" ? (
                          metricas.map((m) => (
                            <TableHead key={m} className="text-right font-medium">{METRICA_LABELS[m]}</TableHead>
                          ))
                        ) : (
                          <TableHead className="text-right font-bold bg-muted/70">
                            {metricaUnica ? METRICA_LABELS[metricaUnica] : "Total"}
                          </TableHead>
                        )}
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {!isLoading && rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={colSpanVazio} className="text-center py-8 text-muted-foreground">
                          Nenhum dado encontrado para os filtros selecionados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          {coluna === "none" ? (
                            metricas.map((m) => (
                              <TableCell key={m} className="text-right">
                                {formatValorMetrica(m, row.total[m])}
                              </TableCell>
                            ))
                          ) : !umaMetrica ? (
                            <>
                              {colunasAtivas.map((c) => metricas.map((m) => (
                                <TableCell key={`${c}|${m}`} className="text-right">
                                  {formatValorMetrica(m, row.cols[c]?.[m])}
                                </TableCell>
                              )))}
                              {metricas.map((m) => (
                                <TableCell key={`total|${m}`} className="text-right font-bold bg-muted/20">
                                  {formatValorMetrica(m, row.total[m])}
                                </TableCell>
                              ))}
                            </>
                          ) : (
                            <>
                              {colunasAtivas.map((c) => (
                                <TableCell key={c} className="text-right">
                                  {formatValorMetrica(metricaUnica as Metrica, row.cols[c]?.[metricaUnica as Metrica])}
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-bold bg-muted/20">
                                {formatValorMetrica(metricaUnica as Metrica, row.total[metricaUnica as Metrica])}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))
                    )}
                    {rows.length > 0 && (
                      <TableRow className="border-t-2 border-border bg-muted/60 font-bold hover:bg-muted/60">
                        <TableCell>TOTAL GERAL</TableCell>
                        {coluna === "none" ? (
                          metricas.map((m) => (
                            <TableCell key={m} className="text-right text-base text-primary">
                              {formatValorMetrica(m, totaisGeral[m])}
                            </TableCell>
                          ))
                        ) : !umaMetrica ? (
                          <>
                            {colunasAtivas.flatMap((c) => metricas.map((m) => (
                              <TableCell key={`${c}|${m}|total`} className="text-right">
                                {formatValorMetrica(m, totaisPorColuna[c]?.[m])}
                              </TableCell>
                            )))}
                            {metricas.map((m) => (
                              <TableCell key={`total|${m}|total`} className="text-right text-primary">
                                {formatValorMetrica(m, totaisGeral[m])}
                              </TableCell>
                            ))}
                          </>
                        ) : (
                          <>
                            {colunasAtivas.map((c) => (
                              <TableCell key={c} className="text-right">
                                {formatValorMetrica(metricaUnica as Metrica, totaisPorColuna[c]?.[metricaUnica as Metrica])}
                              </TableCell>
                            ))}
                            <TableCell className="text-right text-base text-primary">
                              {formatValorMetrica(metricaUnica as Metrica, totaisGeral[metricaUnica as Metrica])}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="chart" className="p-0 outline-none">
            <Card>
              <CardHeader>
                <CardTitle>
                  {!umaMetrica
                    ? `Comparativo de métricas por ${DIMENSAO_LABELS[linha]}`
                    : `${METRICA_LABELS[metricaUnica as Metrica]} por ${DIMENSAO_LABELS[linha]}`}
                </CardTitle>
                <CardDescription>
                  {coluna !== "none" && umaMetrica ? (
                    <>Segmentado por {DIMENSAO_LABELS[coluna as Dimensao]}</>
                  ) : coluna !== "none" ? (
                    <>Barras agrupadas representam os totais de cada métrica. O detalhamento por {DIMENSAO_LABELS[coluna as Dimensao]} está na aba Tabela.</>
                  ) : (
                    <>Métricas: {metricas.map((m) => METRICA_LABELS[m]).join(" • ")}</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {graficoData.length === 0 ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Sem dados para plotar o gráfico.
                  </div>
                ) : (
                  <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={graficoData.slice(0, 50)}
                        margin={{ top: 20, right: 30, left: 40, bottom: 80 }}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          interval={0}
                          height={80}
                          className="fill-muted-foreground"
                        />
                        <YAxis
                          domain={[0, "auto"]}
                          tickFormatter={(value: number) => formatEixo(value)}
                          className="fill-muted-foreground"
                          tick={{ fontSize: 11 }}
                          width={70}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: any) => tooltipFormatter(value, name)}
                          cursor={{ fill: "var(--accent)", opacity: 0.2 }}
                          contentStyle={{ backgroundColor: "var(--background)", borderColor: "var(--border)", borderRadius: "6px" }}
                        />
                        <Legend
                          onClick={(payload: any) => toggleSerie(payload)}
                          wrapperStyle={{ cursor: "pointer", paddingTop: "16px" }}
                        />
                        {barKeys.map((k, i) => {
                          const cor = CHART_COLORS[i % CHART_COLORS.length];
                          const rotulo = isKeyMetrica(k) ? METRICA_LABELS[k] : k;
                          return (
                            <Bar
                              key={k}
                              dataKey={k}
                              name={rotulo}
                              fill={cor}
                              stackId={stacked ? "a" : undefined}
                              radius={[4, 4, 0, 0]}
                              hide={hiddenSeries.has(k)}
                            />
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {graficoData.length > 50 && (
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    *O gráfico exibe os top 50 registros principais. Ajuste os filtros detalhados para refinar sua análise.
                  </p>
                )}
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Dica: clique nos itens da legenda para mostrar ou ocultar séries do gráfico.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Componente auxiliar de Filtro Múltiplo estilo Combobox do Shadcn
function MultiSelectFilter({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((i) => i !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 border-dashed flex gap-2", selected.length > 0 && "border-primary/50")}
        >
          {title}
          {selected.length > 0 && (
            <>
              <span className="w-[1px] h-4 bg-border" />
              <Badge variant="secondary" className="px-1 font-normal lg:hidden rounded-sm">{selected.length}</Badge>
              <div className="hidden space-x-1 lg:flex">
                {selected.length > 2 ? (
                  <Badge variant="secondary" className="px-1 font-normal rounded-sm">
                    {selected.length} selec.
                  </Badge>
                ) : (
                  selected.map((o) => (
                    <Badge variant="secondary" key={o} className="px-1 font-normal truncate max-w-[100px] rounded-sm">
                      {o}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Buscar em ${title.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    toggle(option);
                  }}
                >
                  <div className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                    selected.includes(option) ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"
                  )}>
                    <Check className={cn("h-4 w-4")} />
                  </div>
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div className="p-1">
                <CommandItem
                  value="__clear_all__"
                  onSelect={() => { onChange([]); setOpen(false); }}
                  className="justify-center text-center text-sm cursor-pointer"
                >
                  Limpar seleção
                </CommandItem>
              </div>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
