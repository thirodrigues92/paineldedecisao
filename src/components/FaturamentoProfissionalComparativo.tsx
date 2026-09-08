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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { brl, num } from "@/lib/format";
import { fetchLabProducaoRows, fetchLabRepasseRows } from "@/lib/dashboard-data";
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
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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

export function FaturamentoProfissionalComparativo() {
  const filters = useFilters();
  const { data: dados = [], isLoading } = useQuery({
    queryKey: ["labProducaoData_prof_comparativo", filters],
    queryFn: () => fetchLabProducaoRows(filters, 30_000),
  });

  const { data: repasses = [] } = useQuery({
    queryKey: ["labRepasse_prof_comparativo", filters],
    queryFn: () => fetchLabRepasseRows(filters, 30_000),
  });

  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [buscaRepasse, setBuscaRepasse] = useState("");
  const [conveniosSel, setConveniosSel] = useState<string[]>([]);


  const handleClick = (nome: string) => {
    if (isCompareMode) {
      setCompare((prev) =>
        prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome]
      );
    } else {
      setSelected(nome);
    }
  };

  const nomeConvenio = (r: any) =>
    (r.convenio_nome || "Particular").trim() || "Particular";

  const listaConvenios = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of dados) {
      const c = nomeConvenio(r);
      map.set(c, (map.get(c) || 0) + Number(r.valor || 0));
    }
    return Array.from(map.entries())
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total);
  }, [dados]);

  const dadosBase = useMemo(
    () =>
      conveniosSel.length === 0
        ? dados
        : dados.filter((r) => conveniosSel.includes(nomeConvenio(r))),
    [dados, conveniosSel]
  );

  const toggleConvenio = (nome: string) =>
    setConveniosSel((prev) =>
      prev.includes(nome) ? prev.filter((c) => c !== nome) : [...prev, nome]
    );

  const {
    treeData,
    totalFaturado,
    chartData,
    tableData,
    activeProfs,
    cats,
    procDataPorProf,
  } = useMemo(() => {
      let baseTotal = 0;
      const profMap = new Map<
        string,
        { name: string; size: number; qtd: number }
      >();

      for (const r of dadosBase) {
        const valor = Number(r.valor || 0);
        const prof = (r.profissional_nome || "Não informado").trim();
        baseTotal += valor;
        const cur = profMap.get(prof) ?? { name: prof, size: 0, qtd: 0 };
        cur.size += valor;
        cur.qtd += 1;
        profMap.set(prof, cur);
      }

      const tData = Array.from(profMap.values())
        .filter((d) => d.size > 0)
        .sort((a, b) => b.size - a.size);

      const activeList = isCompareMode ? compare : selected ? [selected] : [];

      let catChart: any[] = [];
      let tabData: any[] = [];
      let catKeys: string[] = [];
      const procPorProf: Record<
        string,
        { name: string; value: number; qtd: number }[]
      > = {};

      if (activeList.length > 0) {
        const filtered = dadosBase.filter((r) =>
          activeList.includes((r.profissional_nome || "Não informado").trim())
        );

        tabData = filtered
          .map((r) => ({
            id: r.id,
            data: r.data_execucao,
            paciente: r.paciente_nome || "Paciente não identificado",
            medico: (r.profissional_nome || "Não informado").trim(),
            categoria: (r.grupo_nome || "Não classificado").trim(),
            procedimento: r.procedimento_nome || "Sem descrição",
            convenio: r.convenio_nome || "Particular",
            valor: Number(r.valor || 0),
          }))
          .sort((a, b) => b.valor - a.valor);

        // Eixo: categoria; séries: profissionais selecionados
        const catMap = new Map<string, any>();
        for (const r of filtered) {
          const cat = (r.grupo_nome || "Não classificado").trim();
          const prof = (r.profissional_nome || "Não informado").trim();
          const valor = Number(r.valor || 0);
          let cur = catMap.get(cat);
          if (!cur) {
            cur = { name: cat, total: 0 };
            activeList.forEach((p) => {
              cur[p] = 0;
              cur[`${p}_qtd`] = 0;
            });
            catMap.set(cat, cur);
          }
          cur[prof] = (cur[prof] || 0) + valor;
          cur[`${prof}_qtd`] = (cur[`${prof}_qtd`] || 0) + 1;
          cur.total += valor;
        }
        catChart = Array.from(catMap.values()).sort(
          (a, b) => b.total - a.total
        );
        catKeys = activeList;

        // Pizza: procedimentos por profissional (com % de participação)
        for (const prof of activeList) {
          const rowsProf = filtered.filter(
            (r) => (r.profissional_nome || "Não informado").trim() === prof
          );
          const map = new Map<string, { value: number; qtd: number }>();
          for (const r of rowsProf) {
            const proc = (r.procedimento_nome || "Sem descrição").trim();
            const cur = map.get(proc) ?? { value: 0, qtd: 0 };
            cur.value += Number(r.valor || 0);
            cur.qtd += 1;
            map.set(proc, cur);
          }
          const itens = Array.from(map.entries())
            .map(([name, v]) => ({ name, value: v.value, qtd: v.qtd }))
            .sort((a, b) => b.value - a.value);
          const top = itens.slice(0, 7);
          const resto = itens.slice(7);
          if (resto.length > 0) {
            top.push({
              name: "Outros",
              value: resto.reduce((s, i) => s + i.value, 0),
              qtd: resto.reduce((s, i) => s + i.qtd, 0),
            });
          }
          procPorProf[prof] = top;
        }
      }

      return {
        treeData: tData,
        totalFaturado: baseTotal,
        chartData: catChart,
        tableData: tabData,
        activeProfs: activeList,
        cats: catKeys,
        procDataPorProf: procPorProf,
      };
    }, [dadosBase, isCompareMode, selected, compare]);

  const tableDataFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return tableData;
    const qNum = q.replace(/[r$\s.]/g, "").replace(",", ".");
    return tableData.filter((p) => {
      if (
        [p.paciente, p.medico, p.categoria, p.procedimento, p.convenio]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(q))
      )
        return true;
      if (p.data && formataDataCurta(p.data).includes(q)) return true;
      if (qNum && !isNaN(Number(qNum))) {
        return String(p.valor.toFixed(2)).includes(qNum);
      }
      return false;
    });
  }, [tableData, busca]);

  // ---- Repasse (quanto o profissional recebeu) ----
  const chaveProf = (n?: string | null) => (n || "Não informado").trim().toUpperCase();

  const repassesBase = useMemo(
    () =>
      conveniosSel.length === 0
        ? repasses
        : repasses.filter((r) =>
            conveniosSel.includes((r.convenio_nome || "Particular").trim() || "Particular")
          ),
    [repasses, conveniosSel]
  );

  const resumoRepassePorProf = useMemo(() => {
    const map = new Map<string, { repassado: number; bruto: number; qtd: number }>();
    for (const r of repassesBase) {
      const k = chaveProf(r.profissional_nome);
      const cur = map.get(k) ?? { repassado: 0, bruto: 0, qtd: 0 };
      cur.repassado += Number(r.valor_repassado || 0);
      cur.bruto += Number(r.valor || 0);
      cur.qtd += 1;
      map.set(k, cur);
    }
    return map;
  }, [repassesBase]);

  const totalRepassadoGlobal = useMemo(
    () => repassesBase.reduce((s, r) => s + Number(r.valor_repassado || 0), 0),
    [repassesBase]
  );

  const repasseLinhas = useMemo(() => {
    if (activeProfs.length === 0) return [];
    const alvo = new Set(activeProfs.map(chaveProf));
    return repassesBase
      .filter((r) => alvo.has(chaveProf(r.profissional_nome)))
      .map((r) => ({
        id: r.id,
        data: r.data_repasse,
        medico: (r.profissional_nome || "Não informado").trim(),
        paciente: r.paciente_nome || "Paciente não identificado",
        procedimento: r.procedimento_nome || "Sem descrição",
        convenio: r.convenio_nome || "Particular",
        valor: Number(r.valor || 0),
        repassado: Number(r.valor_repassado || 0),
        regra: r.regra_repasse || "—",
        situacao: r.situacao_repasse || "—",
      }))
      .sort((a, b) => b.repassado - a.repassado);
  }, [repassesBase, activeProfs]);

  const repasseLinhasFiltradas = useMemo(() => {
    const q = buscaRepasse.trim().toLowerCase();
    if (!q) return repasseLinhas;
    const qNum = q.replace(/[r$\s.]/g, "").replace(",", ".");
    return repasseLinhas.filter((p) => {
      if (
        [p.paciente, p.medico, p.procedimento, p.convenio, p.regra, p.situacao]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(q))
      )
        return true;
      if (p.data && formataDataCurta(p.data).includes(q)) return true;
      if (qNum && !isNaN(Number(qNum))) {
        return (
          String(p.valor.toFixed(2)).includes(qNum) ||
          String(p.repassado.toFixed(2)).includes(qNum)
        );
      }
      return false;
    });
  }, [repasseLinhas, buscaRepasse]);

  const exportarRepasseCSV = () => {
    const linhas = [
      ["Data", "Medico", "Paciente", "Procedimento", "Convenio", "Valor", "Repassado", "Regra", "Situacao"],
      ...repasseLinhasFiltradas.map((p) => [
        formataDataCurta(p.data),
        p.medico,
        p.paciente,
        p.procedimento,
        p.convenio,
        p.valor.toFixed(2).replace(".", ","),
        p.repassado.toFixed(2).replace(".", ","),
        p.regra,
        p.situacao,
      ]),
    ];
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "repasse-profissionais.csv";
    a.click();
    URL.revokeObjectURL(url);
  };



  const CustomTreemapContent = (props: any) => {
    const { x, y, width, height, index, name, value } = props;
    if (!name || typeof width !== "number" || typeof height !== "number") {
      return <g />;
    }
    const isSelected = activeProfs.includes(name);
    const hasSelection = activeProfs.length > 0;
    const color = PALETTE[(index ?? 0) % PALETTE.length];
    const dimmed = hasSelection && !isSelected;
    const showName = width > 46 && height > 24;
    const showValue = width > 60 && height > 42;

    return (
      <g onClick={() => handleClick(name)} style={{ cursor: "pointer" }}>
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
          className="transition-all duration-300"
        />
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
          Nenhum dado de profissional encontrado no período.
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
              Faturamento por Profissional (Treemap)
            </CardTitle>
            <CardDescription>
              Visualização proporcional e comparação entre profissionais.
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
              <p className="text-[11px] text-muted-foreground mt-1">
                Repassado aos profissionais:{" "}
                <span className="font-medium text-foreground/80">
                  {brl(totalRepassadoGlobal)}
                </span>
                {totalFaturado > 0 && (
                  <span className="ml-1">
                    ({((totalRepassadoGlobal / totalFaturado) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center space-x-2 bg-muted/30 p-1.5 rounded-md border border-border/50">
              <Switch
                id="compare-mode-prof"
                checked={isCompareMode}
                onCheckedChange={(c) => {
                  setIsCompareMode(c);
                  setSelected(null);
                  setCompare([]);
                }}
              />
              <Label
                htmlFor="compare-mode-prof"
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
                    setSelected(null);
                    setCompare([]);
                  }}
                  className={`text-sm ${
                    activeProfs.length === 0
                      ? "font-semibold text-primary"
                      : "font-medium hover:text-primary transition-colors"
                  }`}
                >
                  Profissionais (Treemap)
                </BreadcrumbLink>
              </BreadcrumbItem>

              {activeProfs.length > 0 && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-semibold text-primary text-sm">
                      {isCompareMode
                        ? `${activeProfs.length} profissional(is) comparado(s)`
                        : selected}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {isCompareMode
              ? "Clique em múltiplos profissionais para compará-los por categoria."
              : "Clique num profissional para ver as categorias que ele faturou."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">
              Filtrar por convênio
              {conveniosSel.length > 0 && (
                <span className="ml-2 text-primary font-medium">
                  {conveniosSel.length} selecionado(s)
                </span>
              )}
            </p>
            {conveniosSel.length > 0 && (
              <button
                type="button"
                onClick={() => setConveniosSel([])}
                className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
              >
                Limpar filtro
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {listaConvenios.map((c) => {
              const ativo = conveniosSel.includes(c.nome);
              const dimmed = conveniosSel.length > 0 && !ativo;
              return (
                <button
                  key={c.nome}
                  type="button"
                  onClick={() => toggleConvenio(c.nome)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all hover:bg-muted/60 ${
                    ativo
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border/50 bg-muted/20"
                  } ${dimmed ? "opacity-45" : ""}`}
                  title={`${c.nome} — ${brl(c.total)}`}
                >
                  <span className="truncate max-w-[160px]">{c.nome}</span>
                  <span
                    className={`font-normal whitespace-nowrap ${
                      ativo ? "text-primary/80" : "text-muted-foreground"
                    }`}
                  >
                    {brl(c.total)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {conveniosSel.length === 0
              ? "Nenhum filtro aplicado — todos os convênios (e particular) somados."
              : "Treemap, pizzas e tabela abaixo refletem apenas o(s) convênio(s) marcado(s)."}
          </p>
        </div>

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

        <div className="flex flex-wrap gap-1.5">
          {treeData.map((p, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const isActive = activeProfs.includes(p.name);
            const dimmed = activeProfs.length > 0 && !isActive;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => handleClick(p.name)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all hover:bg-muted/60 ${
                  isActive
                    ? "border-primary/60 bg-muted/60"
                    : "border-border/50 bg-muted/20"
                } ${dimmed ? "opacity-45" : ""}`}
                title={`${p.name} — ${brl(p.size)} (${num(p.qtd)} itens)`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate max-w-[160px]">{p.name}</span>
                <span className="text-muted-foreground font-normal whitespace-nowrap">
                  {brl(p.size)}
                </span>
              </button>
            );
          })}
        </div>

        {activeProfs.length > 0 && (
          <div className="pt-6 border-t border-border animate-in slide-in-from-bottom-4 fade-in duration-500 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-1">
                Repasse ao profissional (o que ele recebeu)
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Comparação entre o que foi faturado e o que foi repassado no
                período selecionado.
              </p>
              <div
                className={`grid gap-4 ${
                  activeProfs.length === 1
                    ? "grid-cols-1"
                    : "grid-cols-1 md:grid-cols-2"
                }`}
              >
                {activeProfs.map((prof) => {
                  const faturado =
                    treeData.find((t) => t.name === prof)?.size ?? 0;
                  const rep = resumoRepassePorProf.get(chaveProf(prof));
                  const repassado = rep?.repassado ?? 0;
                  const retido = faturado - repassado;
                  const pctRepasse =
                    faturado > 0 ? (repassado / faturado) * 100 : 0;
                  const pctTotal =
                    totalFaturado > 0 ? (repassado / totalFaturado) * 100 : 0;
                  return (
                    <div
                      key={prof}
                      className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3"
                    >
                      <p className="text-sm font-semibold truncate">{prof}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Kpi label="Faturado" value={brl(faturado)} />
                        <Kpi label="Repassado" value={brl(repassado)} />
                        <Kpi label="Retido pela clínica" value={brl(retido)} />
                        <Kpi
                          label="% de repasse"
                          value={`${pctRepasse.toFixed(1)}%`}
                        />
                        <Kpi
                          label="% do faturamento total"
                          value={`${pctTotal.toFixed(1)}%`}
                        />
                        <Kpi
                          label="Itens repassados"
                          value={num(rep?.qtd ?? 0)}
                        />
                      </div>
                      {faturado > 0 && repassado === 0 && (
                        <p className="text-[11px] text-amber-500 leading-relaxed">
                          Este profissional tem faturamento no período, mas
                          nenhum repasse lançado ainda — o valor recebido pode
                          aparecer depois que o repasse for gerado.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <h4 className="text-xs font-semibold">
                    Lançamentos de repasse ({num(repasseLinhasFiltradas.length)}) —{" "}
                    {brl(
                      repasseLinhasFiltradas.reduce((s, p) => s + p.repassado, 0)
                    )}
                  </h4>
                  <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-[240px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        value={buscaRepasse}
                        onChange={(e) => setBuscaRepasse(e.target.value)}
                        placeholder="Pesquisar repasse..."
                        className="pl-8 h-8 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={exportarRepasseCSV}
                      disabled={repasseLinhasFiltradas.length === 0}
                      className="rounded-md border border-border/60 px-2 py-1.5 text-[11px] font-medium hover:bg-muted/60 disabled:opacity-40"
                    >
                      Exportar CSV
                    </button>
                  </div>
                </div>
                <div className="rounded-md border bg-card w-full">
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                        <TableRow>
                          <TableHead className="w-[80px]">Data</TableHead>
                          <TableHead>Paciente</TableHead>
                          <TableHead>Procedimento</TableHead>
                          <TableHead>Convênio</TableHead>
                          <TableHead>Regra</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Repassado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {repasseLinhasFiltradas.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center h-28 text-muted-foreground"
                            >
                              {buscaRepasse.trim()
                                ? `Nenhum resultado para "${buscaRepasse.trim()}".`
                                : "Nenhum repasse encontrado no período."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          repasseLinhasFiltradas.map((p, idx) => (
                            <TableRow
                              key={`${p.id}-${idx}`}
                              className="hover:bg-muted/30"
                            >
                              <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                {formataDataCurta(p.data)}
                              </TableCell>
                              <TableCell
                                className="text-xs truncate max-w-[150px]"
                                title={p.paciente}
                              >
                                {p.paciente}
                              </TableCell>
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
                              <TableCell
                                className="text-[11px] text-muted-foreground truncate max-w-[130px]"
                                title={p.regra}
                              >
                                {p.regra}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {brl(p.valor)}
                              </TableCell>
                              <TableCell className="text-right font-medium text-xs text-primary">
                                {brl(p.repassado)}
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

            <div>

              <h3 className="text-sm font-semibold mb-1">
                {isCompareMode
                  ? "Comparativo por Categoria entre Profissionais"
                  : `Categorias faturadas por: ${selected}`}
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Faturamento de cada categoria para o(s) profissional(is)
                selecionado(s).
              </p>
              <div
                style={{
                  height: Math.max(300, chartData.length * 45),
                  width: "100%",
                }}
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
                      vertical
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
                        const qtd = props.payload[`${name}_qtd`] || 0;
                        const ticket = qtd > 0 ? Number(val) / qtd : 0;
                        return [
                          `${brl(Number(val))} (${num(qtd)} itens) — TM: ${brl(
                            ticket
                          )}`,
                          name,
                        ];
                      }}
                    />
                    {isCompareMode && (
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    )}
                    {cats.map((prof, idx) => (
                      <Bar
                        key={prof}
                        dataKey={prof}
                        name={prof}
                        stackId={isCompareMode ? "a" : undefined}
                        fill={
                          PALETTE[
                            treeData.findIndex((t) => t.name === prof) %
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

            <div>
              <h3 className="text-sm font-semibold mb-1">
                Participação dos Procedimentos por Profissional
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Cada pizza mostra, em %, o que o profissional faturou por
                procedimento.
              </p>
              <div
                className={`grid gap-4 ${
                  activeProfs.length === 1
                    ? "grid-cols-1"
                    : activeProfs.length === 2
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
                }`}
              >
                {activeProfs.map((prof) => {
                  const pieData = procDataPorProf[prof] || [];
                  const totalProf = pieData.reduce((s, i) => s + i.value, 0);
                  const profColor =
                    PALETTE[
                      treeData.findIndex((t) => t.name === prof) %
                        PALETTE.length
                    ];
                  return (
                    <div
                      key={prof}
                      className="rounded-lg border border-border/60 bg-muted/10 p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold truncate flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: profColor }}
                          />
                          {prof}
                        </p>
                        <p className="text-xs font-medium text-primary whitespace-nowrap">
                          {brl(totalProf)}
                        </p>
                      </div>
                      <div className="h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="45%"
                              outerRadius="75%"
                              paddingAngle={2}
                              stroke="var(--background)"
                              strokeWidth={1}
                              label={({ percent }) =>
                                percent && percent >= 0.04
                                  ? `${(percent * 100).toFixed(0)}%`
                                  : ""
                              }
                              labelLine={false}
                              fontSize={10}
                            >
                              {pieData.map((_, idx) => (
                                <Cell
                                  key={idx}
                                  fill={PALETTE[idx % PALETTE.length]}
                                  fillOpacity={0.85}
                                />
                              ))}
                            </Pie>
                            <Tooltip
                              {...tooltipProps}
                              formatter={(val, name, props) => {
                                const pct =
                                  totalProf > 0
                                    ? (Number(val) / totalProf) * 100
                                    : 0;
                                return [
                                  `${brl(Number(val))} (${pct.toFixed(1)}%) — ${num(
                                    props.payload.qtd
                                  )} itens`,
                                  name,
                                ];
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {pieData.map((p, idx) => (
                          <span
                            key={p.name}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground"
                            title={`${p.name} — ${brl(p.value)} (${num(p.qtd)} itens)`}
                          >
                            <span
                              className="inline-block h-2 w-2 rounded-sm shrink-0"
                              style={{
                                backgroundColor:
                                  PALETTE[idx % PALETTE.length],
                              }}
                            />
                            <span className="truncate max-w-[120px]">
                              {p.name}
                            </span>
                            <span className="font-medium text-foreground/80">
                              {totalProf > 0
                                ? `${((p.value / totalProf) * 100).toFixed(0)}%`
                                : "0%"}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold">Detalhamento</h3>
                <div className="relative w-full sm:w-[280px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Pesquisar paciente, categoria, procedimento, valor..."
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-card w-full">
                <ScrollArea className="h-[350px]">
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                      <TableRow>
                        <TableHead className="w-[80px]">Data</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Médico</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Convênio</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableDataFiltrada.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center h-32 text-muted-foreground"
                          >
                            {busca.trim()
                              ? `Nenhum resultado para "${busca.trim()}".`
                              : "Nenhum registro associado."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        tableDataFiltrada.map((p, idx) => (
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
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="text-[9px] bg-background"
                              >
                                {p.categoria}
                              </Badge>
                            </TableCell>
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
