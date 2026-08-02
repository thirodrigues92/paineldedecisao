export const chartColors = {
  primary: "var(--chart-1)",
  success: "var(--chart-2)",
  warning: "var(--chart-3)",
  accent: "var(--chart-4)",
  danger: "var(--chart-5)",
} as const;

export const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
} as const;

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
} as const;

export const tooltipProps = {
  contentStyle: {
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--popover-foreground)" },
  cursor: { fill: "color-mix(in oklab, var(--primary) 12%, transparent)" },
} as const;
