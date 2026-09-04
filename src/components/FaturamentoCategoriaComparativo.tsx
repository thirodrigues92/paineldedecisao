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
  Treemap,
  Legend,
} from "recharts";
import { brl, num } from "@/lib/format";
import { fetchLabProducaoRows } from "@/lib/dashboard-data";
import { useFilters } from "@/lib/filters-context";
import { tooltipProps } from "@/lib/chart-theme";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const formataDataCurta = (isoDate: string | null) => {
  if (!isoDate) return "--";
  const parts = isoDate.split("T")[0].split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
};

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#65a30d",
  "#be123c",
];

export function FaturamentoCategoriaComparativo() {
  const filters = useFilters();
  const { data: dados = [], isLoading } = useQuery({
    queryKey: ["labProducaoData_categoria_comparativo", filters],
    queryFn: () => fetchLabProducaoRows(filters, 30_000),
  });

  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [compareCats, setCompareCats] = useState<string[]>([]);

  const handleCatClick = (catName: string) => {
    if (isCompareMode) {
      setCompareCats((prev) =>
        prev.includes(catName)
          ? prev.filter((c) => c !== catName)
          : [...prev, catName]
      );
    } else {
      setSelectedCat(catName);
    }
  };

  const { treeData, totalFaturado, chartData, tableData, activeCats } =
    useMemo(() => {
      let baseTotal = 0;
      const catMap = new Map<
        string,
        { name: string; size: number; qtd: number }
      >();

      for (const r of dados) {
        const valor = Number(r.valor || 0);
        const cat = (r.grupo_nome || "Não classificado").trim();
        baseTotal += valor;
        const cur = catMap.get(cat) ?? { name: cat, size: 0, qtd: 0 };
        cur.size += valor;
        cur.qtd += 1;
        catMap.set(cat, cur);
      }

      let tData = Array.from(catMap.values())
        .filter((d) => d.size > 0)
        .sort((a, b) => b.size - a.size);

      let activeCatsList = isCompareMode
        ? compareCats
        : selectedCat
          ? [selectedCat]
          : [];

      let medData: any[] = [];
      let tabData: any[] = [];

      if (activeCatsList.length > 0) {
        const filtered = dados.filter((r) =>
          activeCatsList.includes((r.grupo_nome || "Não classificado").trim())
        );

        tabData = filtered
          .map((r) => ({
            id: r.id,
            data: r.data_execucao,
            paciente: r.paciente_nome || "Paciente não identificado",
            medico: r.profissional_nome || "Não informado",
            categoria: (r.grupo_nome || "Não classificado").trim(),
            procedimento: r.procedimento_nome || "Sem descrição",
            convenio: r.convenio_nome || "Particular",
            valor: Number(r.valor || 0),
          }))
          .sort((a, b) => b.valor - a.valor);

        const medMap = new Map<string, any>();

        for (const r of filtered) {
          const med = r.profissional_nome || "Não informado";
          const cat = (r.grupo_nome || "Não classificado").trim();
          const valor = Number(r.valor || 0);

          let cur = medMap.get(med);
          if (!cur) {
            cur = { name: med, total: 0, qtdTotal: 0 };
            activeCatsList.forEach((c) => {
              cur[c] = 0;
              cur[`${c}_qtd`] = 0;
            });
            medMap.set(med, cur);
          }

          cur[cat] = (cur[cat] || 0) + valor;
          cur[`${cat}_qtd`] = (cur[`${cat}_qtd`] || 0) + 1;
          cur.total += valor;
          cur.qtdTotal += 1;
        }

        medData = Array.from(medMap.values()).sort(
          (a, b) => b.total - a.total
        );
      }

      return {
        treeData: tData,
        totalFaturado: baseTotal,
        chartData: medData,
        tableData: tabData,
        activeCats: activeCatsList,
      };
    }, [dados, isCompareMode, selectedCat, compareCats]);

  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, index, name, value } = props;
    const isSelected = activeCats.includes(name);
    const hasSelection = activeCats.length > 0;
    const color = PALETTE[index % PALETTE.length];
    const dimmed = hasSelection && !isSelected;
    const showName = width > 46 && height > 24;
    const showValue = width > 60 && height > 42;

    return (
      <g onClick={() => handleCatClick(name)} style={{ cursor: "pointer" }}>
        {/* bloco com cantos arredondados, borda sutil na mesma cor escurecida */}
        <rect
          x={x + 2}
          y={y + 2}
          width={Math.max(0, width - 4)}
          height={Math.max(0, height - 4)}
          rx={8}
          ry={8}
          fill={color}
          fillOpacity={dimmed ? 0.2 : isSelected ? 0.85 : 0.55}
          stroke={dimmed ? "transparent" : color}
          strokeWidth={1}
          strokeOpacity={0.7}
          className="transition-all duration-300 hover:fill-opacity-90"
        />
        {/* anel de seleção em tom claro da própria cor (sem branco estourado) */}
        {isSelected && (
          <rect
            x={x + 2}
            y={y + 2}
            width={Math.max(0, width - 4)}
            height={Math.max(0, height - 4)}
            rx={8}
            ry={8}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeOpacity={0.9}
            pointerEvents="none"
          />
        )}
        {showName && (
          <text
            x={x + 10}
            y={y + 17}
            textAnchor="start"
            fill="var(--foreground)"
            fillOpacity={dimmed ? 0.45 : 0.85}
            fontSize={11}
            fontWeight={500}
            pointerEvents="none"
          >
            {name.length * 6.2 > width - 16
              ? `${name.slice(0, Math.max(3, Math.floor((width - 16) / 6.2)))}…`
              : name}
          </text>
        )}
        {showValue && (
          <text
            x={x + 10}
            y={y + 32}
            textAnchor="start"
            fill="var(--foreground)"
            fillOpacity={dimmed ? 0.35 : 0.6}
            fontSize={10}
            fontWeight={400}
            pointerEvents="none"
          >
            {brl(value)}
          </text>
        )}
      </g>
    );
  };

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

  if (treeData.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum dado de categoria encontrado no período.
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
              Faturamento por Categoria (Treemap)
            </CardTitle>
            <CardDescription>
              Visualização proporcional e análise por médico.
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Total Faturado Global
              </p>
              <p className="text-xl font-semibold text-primary">
                {brl(totalFaturado)}
              </p>
            </div>
            <div className="flex items-center space-x-2 bg-muted/30 p-1.5 rounded-md border border-border/50">
              <Switch
                id="compare-mode"
                checked={isCompareMode}
                onCheckedChange={(c) => {
                  setIsCompareMode(c);
                  setSelectedCat(null);
                  setCompareCats([]);
                }}
              />
              <Label
                htmlFor="compare-mode"
                className="text-xs cursor-pointer font-medium"
              >
                Modo de Comparação
              </Label>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-muted/20 p-3 rounded-lg border border-border/50 mt-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedCat(null);
                    setCompareCats([]);
                  }}
                  className={`text-sm ${
                    activeCats.length === 0
                      ? "font-semibold text-primary"
                      : "font-medium hover:text-primary transition-colors"
                  }`}
                >
                  Categorias (Treemap)
                </BreadcrumbLink>
              </BreadcrumbItem>

              {activeCats.length > 0 && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-primary text-sm">
                      {isCompareMode
                        ? `${activeCats.length} categoria(s) comparada(s)`
                        : selectedCat}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isCompareMode
              ? "Clique em múltiplas caixas para compará-las entre os médicos."
              : "Clique numa categoria para ver os médicos que a faturaram."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Treemap */}
        <div className="w-full h-[240px] animate-in fade-in duration-500">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treeData}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="transparent"
              content={<CustomTreemapContent />}
            >
              <Tooltip
                formatter={(value) => [brl(Number(value)), "Faturado"]}
                labelFormatter={() => ""}
              />
            </Treemap>
          </ResponsiveContainer>
        </div>

        {/* Legenda completa — garante que TODAS as categorias apareçam, mesmo as de bloco pequeno */}
        <div className="flex flex-wrap gap-1.5">
          {treeData.map((cat, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const isActive = activeCats.includes(cat.name);
            const dimmed = activeCats.length > 0 && !isActive;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => handleCatClick(cat.name)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all hover:bg-muted/60 ${
                  isActive
                    ? "border-primary/60 bg-muted/60"
                    : "border-border/50 bg-muted/20"
                } ${dimmed ? "opacity-45" : ""}`}
                title={`${cat.name} — ${brl(cat.size)} (${num(cat.qtd)} itens)`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[160px]">{cat.name}</span>
                <span className="text-muted-foreground font-normal whitespace-nowrap">
                  {brl(cat.size)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detalhamento por Médicos (Modo Normal e Comparação) */}
        {activeCats.length > 0 && (
          <div className="pt-6 border-t border-border animate-in slide-in-from-bottom-4 fade-in duration-500 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-1">
                {isCompareMode
                  ? "Comparativo de Médicos por Categoria"
                  : `Médicos que faturaram: ${selectedCat}`}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Gráfico das categorias selecionadas faturada(s) por
                profissional.
              </p>
              <div
                style={{ height: Math.max(300, chartData.length * 45), width: "100%" }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                    barSize={isCompareMode ? 16 : 24}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      vertical={true}
                      opacity={0.3}
                    />
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={140}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      {...tooltipProps}
                      cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                      formatter={(val, name, props) => {
                        const qName = `${name}_qtd`;
                        const qtd = props.payload[qName] || 0;
                        const ticket = qtd > 0 ? Number(val) / qtd : 0;
                        return [
                          `${brl(Number(val))} (${num(
                            qtd
                          )} itens) — TM: ${brl(ticket)}`,
                          name,
                        ];
                      }}
                    />
                    {isCompareMode && (
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
                      />
                    )}

                    {activeCats.map((cat, idx) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        name={cat}
                        stackId={isCompareMode ? "a" : undefined}
                        fill={
                          PALETTE[
                            treeData.findIndex((t) => t.name === cat) %
                              PALETTE.length
                          ] || PALETTE[idx % PALETTE.length]
                        }
                        radius={!isCompareMode ? [0, 4, 4, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela de Lançamentos */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Detalhamento</h3>
              <div className="rounded-md border bg-card w-full">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                      <TableRow>
                        <TableHead className="w-[80px]">Data</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Médico</TableHead>
                        {(isCompareMode || activeCats.length > 1) && (
                          <TableHead>Categoria</TableHead>
                        )}
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={isCompareMode ? 7 : 6}
                            className="text-center h-32 text-muted-foreground"
                          >
                            Nenhum registro associado.
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableData.map((p, idx) => (
                          <TableRow
                            key={`${p.id}-${idx}`}
                            className="hover:bg-muted/30"
                          >
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {formataDataCurta(p.data)}
                            </TableCell>
                            <TableCell
                              className="font-medium text-xs truncate max-w-[150px]"
                              title={p.paciente}
                            >
                              {p.paciente}
                            </TableCell>
                            <TableCell
                              className="text-xs truncate max-w-[120px]"
                              title={p.medico}
                            >
                              {p.medico}
                            </TableCell>
                            {(isCompareMode || activeCats.length > 1) && (
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] bg-background"
                                >
                                  {p.categoria}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell
                              className="text-xs truncate max-w-[150px]"
                              title={p.procedimento}
                            >
                              {p.procedimento}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className="text-[9px] bg-muted whitespace-nowrap"
                              >
                                {p.convenio}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-xs">
                              {brl(p.valor)}
                            </TableCell>
                          </TableRow>
                        ))
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
