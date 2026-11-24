import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DreItemDrawer, type ItemTarget } from "./DreItemDrawer";
import { fetchItemDre } from "@/lib/dre-items-client";
import {
  buildDreTree,
  DRE_MONTHS,
  type Account,
  type ItemRegime,
  type TreeRow,
} from "@/lib/dre-tree";
import { chartChange, dreChartData, focusTotals, latestDreMonth } from "@/lib/dre-chart-data";
import {
  compareDreMonths,
  comparisonExportRows,
  previousMonth,
  type ComparedRow,
  type MonthPeriod,
} from "@/lib/dre-month-comparison";
import { brl, pct } from "@/lib/format";

const periodLabel = (p: MonthPeriod) => `${DRE_MONTHS[p.month - 1]}/${p.year}`;
const periodKey = (p: MonthPeriod) => `${p.year}-${p.month}`;
const shortMoney = (n: number) =>
  `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
const signed = (n: number, money = true) =>
  `${n > 0 ? "+" : ""}${money ? brl(n) : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`}`;
function ImpactTooltip({
  active,
  payload,
  labelA,
  labelB,
}: {
  active?: boolean;
  payload?: readonly { payload?: ComparedRow }[];
  labelA: string;
  labelB: string;
}) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  return (
    <div className="max-w-80 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-sm">
      <p className="mb-2 font-semibold">{r.name}</p>
      <p>
        A · {labelA}: {brl(r.a)}
      </p>
      <p>
        B · {labelB}: {brl(r.b)}
      </p>
      <p className="mt-2">
        B − A: {signed(r.difference)} ·{" "}
        {r.percent === null ? "sem base percentual" : pct(r.percent)}
      </p>
      <p className={r.impact >= 0 ? "text-success" : "text-destructive"}>
        Efeito no resultado: {signed(r.impact)}
      </p>
    </div>
  );
}

export function DreMonthComparison({
  tree,
  accounts,
  year,
  month,
  regime,
  unit,
  operational,
}: {
  tree: TreeRow[];
  accounts: Account[];
  year: number;
  month: number | null;
  regime: ItemRegime;
  unit: string;
  operational: boolean;
}) {
  const defaultA = { year, month: month ?? latestDreMonth(tree) };
  const [chosenA, setA] = useState<MonthPeriod | null>(null);
  const [chosenB, setB] = useState<MonthPeriod | null>(null);
  const a = chosenA ?? defaultA,
    b = chosenB ?? previousMonth(defaultA);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [drawer, setDrawer] = useState<{ target: ItemTarget; year: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const qa = useQuery({
    queryKey: ["dre-item-year", a.year, regime, unit],
    queryFn: () => fetchItemDre(a.year, regime, unit),
    enabled: a.year !== year,
  });
  const qb = useQuery({
    queryKey: ["dre-item-year", b.year, regime, unit],
    queryFn: () => fetchItemDre(b.year, regime, unit),
    enabled: b.year !== year,
  });
  const treeA = useMemo(
    () => (a.year === year ? tree : buildDreTree(qa.data ?? [], accounts)),
    [a.year, year, tree, qa.data, accounts],
  );
  const treeB = useMemo(
    () => (b.year === year ? tree : buildDreTree(qb.data ?? [], accounts)),
    [b.year, year, tree, qb.data, accounts],
  );
  const loading = (a.year !== year && qa.isPending) || (b.year !== year && qb.isPending);
  const failed = (a.year !== year && qa.isError) || (b.year !== year && qb.isError);
  const totalsA = focusTotals(dreChartData(treeA, operational).months, a.month);
  const totalsB = focusTotals(dreChartData(treeB, operational).months, b.month);
  const groups = useMemo(
    () => compareDreMonths(treeA, treeB, a.month, b.month, operational),
    [treeA, treeB, a.month, b.month, operational],
  );
  const impacts = groups.filter((r) => r.difference !== 0);
  const plotted = showAll ? impacts : impacts.slice(0, 10);
  const extent = Math.max(1, ...plotted.map((r) => Math.abs(r.difference))) * 1.1;
  const selected = groups.find((r) => r.id === selectedId);
  const [categoryPath, setCategoryPath] = useState<string[]>([]);
  const selectedCategory = categoryPath.reduce<ComparedRow | undefined>(
    (r, id) => r?.children.find((c) => c.id === id),
    selected,
  );
  const details = selectedCategory?.children ?? selected?.children ?? [];
  const selectGroup = (r: ComparedRow) => {
    setSelectedId(r.id);
    setCategoryPath([]);
  };
  const openCategory = (r: ComparedRow) => {
    const row = r.rowB ?? r.rowA;
    if (row) setDrawer({ year: b.year, target: { row, month: b.month } });
  };
  const changePeriod = (v: string, set: (p: MonthPeriod) => void) => {
    const [y, m] = v.split("-").map(Number);
    if (y && m) {
      set({ year: y, month: m });
      setSelectedId(null);
      setCategoryPath([]);
      setDrawer(null);
    }
  };
  const years = [
    ...new Set([
      a.year,
      b.year,
      ...Array.from({ length: 12 }, (_, i) => Math.max(new Date().getFullYear(), year) + 1 - i),
    ]),
  ].sort((x, y) => y - x);
  const exportComparison = async () => {
    setExporting(true);
    setExportError(false);
    try {
      const XLSX = await import("xlsx");
      const rows = comparisonExportRows(groups, periodLabel(a), periodLabel(b));
      const sheet = XLSX.utils.json_to_sheet(rows, {
        header: [
          "Grupo",
          "Categoria",
          "Mês A",
          "Mês B",
          "Diferença R$",
          "Diferença %",
          "Período A",
          "Período B",
        ],
      });
      sheet["!cols"] = [40, 50, 20, 20, 20, 18, 16, 16].map((wch) => ({ wch }));
      for (let r = 1; r <= rows.length; r++)
        for (let c = 2; c <= 5; c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r, c })];
          if (cell) cell.z = c === 5 ? "0.00%" : "#,##0.00;[Red]-#,##0.00";
        }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Comparação");
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
          {
            "Mês A": periodLabel(a),
            "Mês B": periodLabel(b),
            Regime: regime,
            Unidade: unit,
            "Somente operacional": operational ? "Sim" : "Não",
          },
        ]),
        "Filtros",
      );
      XLSX.writeFile(workbook, `DRE-comparacao-${periodKey(a)}-${periodKey(b)}.xlsx`);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };
  return (
    <section aria-label="Comparar meses da DRE" className="min-w-0 space-y-5 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Comparar meses</h2>
        <Button
          variant="outline"
          onClick={exportComparison}
          disabled={loading || failed || exporting}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar comparação
        </Button>
      </div>
      <div className="flex flex-wrap gap-4">
        {[
          { label: "Mês A", value: a, set: setA },
          { label: "Mês B", value: b, set: setB },
        ].map((s) => (
          <div key={s.label} className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">{s.label}</label>
            <Select value={periodKey(s.value)} onValueChange={(v) => changePeriod(v, s.set)}>
              <SelectTrigger aria-label={s.label} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.flatMap((y) =>
                  DRE_MONTHS.map((m, i) => (
                    <SelectItem key={`${y}-${i + 1}`} value={`${y}-${i + 1}`}>
                      {m}/{y}
                    </SelectItem>
                  )),
                )}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível exportar a comparação. Tente novamente.
        </p>
      )}
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : failed ? (
        <div role="alert" className="space-y-3 text-sm text-destructive">
          <p>Não foi possível carregar o ano da comparação.</p>
          <Button
            variant="outline"
            onClick={() => {
              if (a.year !== year) qa.refetch();
              if (b.year !== year) qb.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                { key: "revenue", name: "Receita" },
                { key: "expense", name: "Despesa" },
                { key: "result", name: "Resultado" },
                { key: "margin", name: "Margem %" },
              ] as const
            ).map((metric) => {
              const av = totalsA[metric.key],
                bv = totalsB[metric.key],
                change = chartChange(bv, av);
              const good = change
                ? metric.key === "expense"
                  ? change.amount <= 0
                  : change.amount >= 0
                : true;
              const format = (v: number | null) =>
                v === null ? "—" : metric.key === "margin" ? pct(v) : brl(v);
              return (
                <article key={metric.key} className="min-w-0 rounded-md border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">{metric.name}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">A · {periodLabel(a)}</p>
                      <p className="mt-1 break-words text-sm font-semibold tabular-nums">
                        {format(av)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">B · {periodLabel(b)}</p>
                      <p className="mt-1 break-words text-sm font-semibold tabular-nums">
                        {format(bv)}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`mt-3 border-t pt-3 text-xs tabular-nums ${good ? "text-success" : "text-destructive"}`}
                  >
                    B − A:{" "}
                    {change
                      ? `${signed(change.amount, metric.key !== "margin")} (${change.percent === null ? "sem base percentual" : pct(change.percent)})`
                      : "—"}
                  </p>
                  {metric.key === "margin" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Resultado: {signed(totalsB.result - totalsA.result)}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">O que explica a diferença</h3>
              {impacts.length > 10 && (
                <Button variant="link" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Ver os 10 maiores" : "Ver todos"}
                </Button>
              )}
            </div>
            {plotted.length ? (
              <>
                <div className="mt-3 w-full" aria-label="Impacto por grupo da DRE">
                  <ResponsiveContainer width="100%" height={Math.max(240, plotted.length * 44)}>
                    <BarChart
                      layout="vertical"
                      data={plotted}
                      margin={{ top: 10, right: 15, left: 0, bottom: 10 }}
                    >
                      <CartesianGrid
                        stroke="var(--border)"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        domain={[-extent, extent]}
                        ticks={[-extent, -extent / 2, 0, extent / 2, extent]}
                        tickFormatter={shortMoney}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                        tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <ReferenceLine x={0} stroke="var(--foreground)" />
                      <Tooltip
                        content={<ImpactTooltip labelA={periodLabel(a)} labelB={periodLabel(b)} />}
                      />
                      <Bar
                        dataKey="difference"
                        maxBarSize={24}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={(_entry, i) => {
                          const r = plotted[i];
                          if (r) selectGroup(r);
                        }}
                      >
                        {plotted.map((r) => (
                          <Cell
                            key={r.id}
                            fill={r.impact >= 0 ? "var(--success)" : "var(--destructive)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <span className="text-success">● Melhora o resultado</span>
                  <span className="text-destructive">● Piora o resultado</span>
                  <span className="text-muted-foreground">
                    B − A · {periodLabel(b)} − {periodLabel(a)}
                  </span>
                </div>
                <div className="mt-4 grid gap-x-6 divide-y sm:grid-cols-2">
                  {plotted.map((r) => (
                    <Button
                      key={r.id}
                      variant="ghost"
                      className="h-auto justify-between gap-3 whitespace-normal rounded-none px-1 py-2 text-xs"
                      aria-label={`Comparar grupo ${r.name}`}
                      onClick={() => selectGroup(r)}
                    >
                      <span className="min-w-0 break-words text-left">{r.name}</span>
                      <span
                        className={`shrink-0 tabular-nums ${r.impact >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {signed(r.difference)}
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sem diferença entre os meses selecionados.
              </p>
            )}
          </div>
          {selected && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="break-words font-semibold">
                  {selectedCategory?.name ?? selected.name}
                </h3>
                {categoryPath.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCategoryPath((p) => p.slice(0, -1))}
                  >
                    Voltar às categorias
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-3 text-left">Categoria</th>
                      <th className="px-3 text-right">A · {periodLabel(a)}</th>
                      <th className="px-3 text-right">B · {periodLabel(b)}</th>
                      <th className="px-3 text-right">Diferença R$</th>
                      <th className="px-3 text-right">Diferença %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(details.length ? details : [selectedCategory ?? selected]).map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            {r.children.length > 0 && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 shrink-0"
                                aria-label={`Expandir comparação ${r.name}`}
                                onClick={() => setCategoryPath((path) => [...path, r.id])}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="link"
                              className="h-auto whitespace-normal px-0 text-left text-sm"
                              aria-label={`Abrir mês B ${r.name}`}
                              onClick={() => openCategory(r)}
                            >
                              {r.name}
                            </Button>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 text-right tabular-nums">
                          {brl(r.a)}
                        </td>
                        <td className="whitespace-nowrap px-3 text-right tabular-nums">
                          {brl(r.b)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 text-right tabular-nums ${r.impact >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {signed(r.difference)}
                        </td>
                        <td className="whitespace-nowrap px-3 text-right tabular-nums">
                          {r.percent === null ? "—" : pct(r.percent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      <DreItemDrawer
        key={`${drawer?.year}-${drawer?.target.month}-${drawer?.target.row.id}-${regime}-${unit}`}
        target={drawer?.target ?? null}
        year={drawer?.year ?? b.year}
        regime={regime}
        unit={unit}
        onClose={() => setDrawer(null)}
      />
    </section>
  );
}
