import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
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
import { Switch } from "@/components/ui/switch";
import { DRE_MONTHS, type TreeRow } from "@/lib/dre-tree";
import {
  chartChange,
  dreChartData,
  expenseSlices,
  focusTotals,
  focusValue,
} from "@/lib/dre-chart-data";
import { brl, pct } from "@/lib/format";
import type { ItemTarget } from "./DreItemDrawer";

const colors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--dre-chart-six)",
  "var(--dre-chart-seven)",
  "var(--muted-foreground)",
];
const groupColor = (id: string) =>
  colors[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) % colors.length] ??
  colors[0];
const shortBrl = (n: number) =>
  Math.abs(n) >= 1000000
    ? `R$ ${(n / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : Math.abs(n) >= 1000
      ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`
      : brl(n);
const axis = { fill: "var(--muted-foreground)", fontSize: 11 };
type Monthly = ReturnType<typeof dreChartData>["months"][number];

export function DreChartControls({
  month,
  onMonth,
  operational,
  onOperational,
}: {
  month: number | null;
  onMonth: (m: number | null) => void;
  operational: boolean;
  onOperational: (v: boolean) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Mês em foco</label>
        <Select
          value={month === null ? "all" : String(month)}
          onValueChange={(v) => onMonth(v === "all" ? null : Number(v))}
        >
          <SelectTrigger aria-label="Mês em foco" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Ano todo</SelectItem>
            {DRE_MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <Switch
          aria-label="Somente operacional"
          checked={operational}
          onCheckedChange={onOperational}
        />
        Somente operacional
      </label>
    </>
  );
}
function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: Monthly }[];
}) {
  const m = payload?.[0]?.payload;
  if (!active || !m) return null;
  return (
    <div className="rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-sm">
      <p className="mb-2 font-semibold">{m.name}</p>
      {[
        ["Receita", brl(m.revenue)],
        ["Despesa", brl(m.expense)],
        ["Resultado", brl(m.result)],
        ["Margem", m.margin === null ? "—" : pct(m.margin)],
      ].map(([name, value]) => (
        <div key={name} className="flex justify-between gap-6">
          <span>{name}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
function MoneyTooltip({
  active,
  payload,
  denominator,
}: {
  active?: boolean;
  payload?: readonly { payload?: { name: string; value: number } }[];
  denominator: number;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="max-w-72 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-sm">
      <p className="font-medium">{d.name}</p>
      <p className="mt-1 tabular-nums">
        {brl(d.value)} · {denominator ? pct((d.value / denominator) * 100) : "—"}
      </p>
    </div>
  );
}
export function DreChartPanel({
  tree,
  previousTree,
  month,
  onMonth,
  operational,
  onTarget,
  year,
}: {
  tree: TreeRow[];
  previousTree?: TreeRow[];
  month: number | null;
  onMonth: (m: number | null) => void;
  operational: boolean;
  onTarget: (target: ItemTarget) => void;
  year: number;
}) {
  const data = useMemo(() => dreChartData(tree, operational), [tree, operational]);
  const focus = focusTotals(data.months, month);
  const previousMonths = previousTree ? dreChartData(previousTree, operational).months : null;
  const previous =
    month === null
      ? previousTree?.some((r) => r.months.some((v) => v !== 0)) && previousMonths
        ? focusTotals(previousMonths, null)
        : null
      : month > 1
        ? focusTotals(data.months, month - 1)
        : previousMonths?.[11] && previousTree?.some((r) => (r.months[11] ?? 0) !== 0)
          ? focusTotals(previousMonths, 12)
          : null;
  const slices = expenseSlices(data.groups, month);
  const [selection, setSelection] = useState<string | null>(null);
  const selected = slices.find((s) => s.id === selection) ?? slices[0];
  const detail = (selected?.id === "other" ? selected.rows : (selected?.rows[0]?.children ?? []))
    .map((row) => ({ name: row.name, value: focusValue(row, month), row }))
    .filter((r) => r.value !== 0)
    .sort((a, b) => b.value - a.value);
  const label = month === null ? `Ano todo · ${year}` : `${DRE_MONTHS[month - 1]} · ${year}`;
  const chooseMonth = (_entry: unknown, index: number) => {
    const m = data.months[index];
    if (m) onMonth(m.month);
  };
  const cards = [
    {
      name: "Receita",
      key: "revenue",
      value: focus.revenue,
      before: previous?.revenue ?? null,
      expense: false,
    },
    {
      name: "Despesa",
      key: "expense",
      value: focus.expense,
      before: previous?.expense ?? null,
      expense: true,
    },
    {
      name: "Resultado",
      key: "result",
      value: focus.result,
      before: previous?.result ?? null,
      expense: false,
    },
    {
      name: "Margem",
      key: "margin",
      value: focus.margin,
      before: previous?.margin ?? null,
      expense: false,
    },
  ] as const;
  return (
    <section aria-label="Gráficos da DRE" className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Panorama financeiro</h2>
        <span className="text-sm text-muted-foreground">
          {label}
          {operational ? " · Operacional" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const change = chartChange(c.value, c.before);
          const better = change ? (c.expense ? change.amount <= 0 : change.amount >= 0) : true;
          const Icon = (change?.amount ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight;
          return (
            <article key={c.key} className="min-w-0 rounded-md border bg-card p-4">
              <h3 className="text-sm text-muted-foreground">
                {c.name}
                {c.key === "margin" ? " %" : ""}
              </h3>
              <p
                className={`mt-2 break-words text-xl font-semibold tabular-nums ${c.key === "result" && (c.value ?? 0) < 0 ? "text-destructive" : ""}`}
              >
                {c.value === null ? "—" : c.key === "margin" ? pct(c.value) : brl(c.value)}
              </p>
              {change && (
                <>
                  <div
                    className={`mt-3 flex flex-wrap items-center gap-1 text-xs ${better ? "text-success" : "text-destructive"}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>
                      {change.amount > 0 ? "+" : ""}
                      {c.key === "margin"
                        ? `${change.amount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`
                        : brl(change.amount)}
                    </span>
                    <span>
                      (
                      {change.percent === null
                        ? "sem base percentual"
                        : `${change.percent > 0 ? "+" : ""}${pct(change.percent)}`}
                      )
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    vs.{" "}
                    {month === null
                      ? year - 1
                      : month === 1
                        ? `Dez ${year - 1}`
                        : DRE_MONTHS[month - 2]}
                    {c.key === "margin" && previous
                      ? ` · Resultado ${brl(focus.result - previous.result)}`
                      : ""}
                  </p>
                </>
              )}
            </article>
          );
        })}
      </div>
      <div className="min-w-0 border-y py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Receita x Despesa</h3>
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-success">● Receita</span>
            <span className="text-destructive">● Despesa</span>
            <span className="dre-result-legend">● Resultado</span>
          </div>
        </div>
        <div className="h-80 w-full" aria-label="Receita x Despesa por mês">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data.months}
              margin={{ top: 15, right: 10, left: 10, bottom: 5 }}
              onClick={(state) => {
                if (typeof state?.activeTooltipIndex === "number") {
                  const m = data.months[state.activeTooltipIndex];
                  if (m) onMonth(m.month);
                }
              }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={shortBrl}
                tick={axis}
                width={82}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<MonthTooltip />} />
              <Bar
                dataKey="revenue"
                name="Receita"
                fill="var(--success)"
                radius={[3, 3, 0, 0]}
                onClick={chooseMonth}
                cursor="pointer"
                isAnimationActive={false}
              >
                {data.months.map((m) => (
                  <Cell key={m.month} fillOpacity={month === null || month === m.month ? 1 : 0.3} />
                ))}
              </Bar>
              <Bar
                dataKey="expense"
                name="Despesa"
                fill="var(--destructive)"
                radius={[3, 3, 0, 0]}
                onClick={chooseMonth}
                cursor="pointer"
                isAnimationActive={false}
              >
                {data.months.map((m) => (
                  <Cell key={m.month} fillOpacity={month === null || month === m.month ? 1 : 0.3} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="result"
                name="Resultado"
                stroke="var(--dre-chart-result)"
                strokeWidth={2}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; payload?: Monthly }) =>
                  p.cx === undefined || p.cy === undefined || !p.payload ? (
                    <g />
                  ) : (
                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={month === p.payload.month ? 6 : 4}
                      fill={p.payload.result < 0 ? "var(--destructive)" : "var(--dre-chart-result)"}
                      opacity={month === null || month === p.payload.month ? 1 : 0.4}
                      onClick={() => p.payload && onMonth(p.payload.month)}
                      className="cursor-pointer"
                    />
                  )
                }
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {data.months.map((m) => (
            <Button
              key={m.month}
              size="sm"
              variant={month === m.month ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              aria-label={`Focar ${m.name}`}
              aria-pressed={month === m.month}
              onClick={() => onMonth(m.month)}
            >
              {m.name}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-4 font-semibold">Para onde vai o dinheiro</h3>
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <div className="relative h-72 w-full" aria-label="Distribuição das despesas por grupo">
              {slices.length ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={slices}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="68%"
                        outerRadius="92%"
                        paddingAngle={2}
                        onClick={(_entry, i) => {
                          const s = slices[i];
                          if (s) setSelection(s.id);
                        }}
                        cursor="pointer"
                        isAnimationActive={false}
                      >
                        {slices.map((s) => (
                          <Cell
                            key={s.id}
                            fill={s.id === "other" ? "var(--muted-foreground)" : groupColor(s.id)}
                            stroke="var(--background)"
                            opacity={s.id === selected?.id ? 1 : 0.7}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<MoneyTooltip denominator={focus.expense} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-40 text-center">
                      <p className="text-xs text-muted-foreground">Despesas</p>
                      <p
                        title={brl(focus.expense)}
                        className="mt-1 break-words text-lg font-semibold"
                      >
                        {shortBrl(focus.expense)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {focus.revenue ? pct((focus.expense / focus.revenue) * 100) : "—"} da
                        receita
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem despesas neste período.
                </div>
              )}
            </div>
            <div className="space-y-1">
              {slices.map((s) => (
                <Button
                  key={s.id}
                  variant={selected?.id === s.id ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start gap-2 px-2 py-2 text-xs"
                  aria-label={`Detalhar grupo ${s.name}`}
                  aria-pressed={selected?.id === s.id}
                  onClick={() => setSelection(s.id)}
                >
                  <svg width="10" height="10" className="shrink-0" aria-hidden="true">
                    <circle
                      cx="5"
                      cy="5"
                      r="5"
                      fill={s.id === "other" ? "var(--muted-foreground)" : groupColor(s.id)}
                    />
                  </svg>
                  <span className="min-w-0 flex-1 whitespace-normal text-left">{s.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {brl(s.value)}
                    <span className="ml-2 text-muted-foreground">
                      {focus.expense ? pct((s.value / focus.expense) * 100) : "—"}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <div className="min-w-0 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="break-words text-sm font-semibold">
                {selected?.name ?? "Despesas por categoria"}
              </h4>
              {selected && selected.id !== "other" && selected.rows[0] && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal py-2 text-xs"
                  onClick={() => {
                    const row = selected.rows[0];
                    if (row) onTarget({ row, month });
                  }}
                >
                  Ver todas as despesas do grupo
                </Button>
              )}
            </div>
            {detail.length ? (
              <>
                <div className="mt-4 w-full" aria-label={`Categorias de ${selected?.name}`}>
                  <ResponsiveContainer width="100%" height={Math.max(220, detail.length * 42)}>
                    <BarChart
                      layout="vertical"
                      data={detail}
                      margin={{ top: 5, right: 110, left: 0, bottom: 5 }}
                    >
                      <XAxis
                        type="number"
                        tickFormatter={shortBrl}
                        tick={axis}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={axis}
                        width={100}
                        tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<MoneyTooltip denominator={selected?.value ?? 0} />} />
                      <Bar
                        dataKey="value"
                        fill={groupColor(selected?.id ?? "")}
                        radius={[0, 3, 3, 0]}
                        maxBarSize={22}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={(_entry, i) => {
                          const d = detail[i];
                          if (d) onTarget({ row: d.row, month });
                        }}
                      >
                        <LabelList
                          dataKey="value"
                          content={(props) => {
                            const value = Number(props.value);
                            const x = Number(props.x) + Math.max(Number(props.width), 0) + 5;
                            const y = Number(props.y) + Number(props.height) / 2;
                            if (!Number.isFinite(value) || !Number.isFinite(x) || !Number.isFinite(y)) return <g />;
                            return <text x={x} y={y} dominantBaseline="middle" fill="var(--foreground)" fontSize={10}>{shortBrl(value)} · {selected?.value ? pct(value / selected.value * 100) : "—"}</text>;
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 divide-y border-y">
                  {detail.map((d) => (
                    <Button
                      key={d.row.id}
                      variant="ghost"
                      className="h-auto w-full justify-between gap-3 whitespace-normal rounded-none px-1 py-2 text-xs"
                      aria-label={`Abrir despesas ${d.name}`}
                      onClick={() => onTarget({ row: d.row, month })}
                    >
                      <span className="min-w-0 break-words text-left">{d.name}</span>
                      <span className="shrink-0 text-right tabular-nums">
                        {brl(d.value)}
                        <span className="mt-0.5 block text-muted-foreground">
                          {selected?.value ? pct((d.value / selected.value) * 100) : "—"} do grupo
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem categorias com valores neste período.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
