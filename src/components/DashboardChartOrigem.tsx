import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis } from "recharts";
import { brl, num, pct } from "@/lib/format";
import { tooltipProps } from "@/lib/chart-theme";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardChartOrigem({ 
  labRows, 
  faturadoReal, 
  setDetalheOrigem, 
  setDetalhePagamento,
  isLoading
}: { 
  labRows: any[]; 
  faturadoReal: number;
  setDetalheOrigem: (val: string | null) => void;
  setDetalhePagamento: (val: string | null) => void;
  isLoading?: boolean;
}) {
  const donut = [
    { name: "Particular", value: labRows.filter((r: any) => r.convenio_nome === "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
    { name: "Convênio",   value: labRows.filter((r: any) => r.convenio_nome !== "Particular").reduce((s, r) => s + Number(r.valor || 0), 0) },
  ];

  const byConvenio = new Map<string, { nome: string; valor: number; qtd: number }>();
  for (const r of labRows) {
    const nome = (r.convenio_nome ?? "").trim() || "Particular";
    const cur = byConvenio.get(nome) ?? { nome, valor: 0, qtd: 0 };
    cur.valor += Number(r.valor || 0);
    cur.qtd += 1;
    byConvenio.set(nome, cur);
  }
  const conveniosBreakdown = Array.from(byConvenio.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  
  const paymentData = Array.from(
    labRows
      .filter((r: any) => r.convenio_nome === "Particular")
      .reduce((acc: Map<string, { value: number; qtd: number }>, r: any) => {
        const raw = (r.forma_pagamento as string) || "Não informado";
        const category = raw.includes(",") ? "Múltiplas Formas" : raw;
        
        const cur = acc.get(category) ?? { value: 0, qtd: 0 };
        cur.value += Number(r.valor || 0);
        cur.qtd += 1;
        acc.set(category, cur);
        return acc;
      }, new Map<string, { value: number; qtd: number }>())  )
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, d]) => ({ 
      name, 
      value: d.value, 
      qtd: d.qtd,
      percent: faturadoReal > 0 ? (d.value * 100) / faturadoReal : 0
    }));

  const containerHeight = Math.max(150, paymentData.length * 45 + 40);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Particular vs. Convênio (receita)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72 w-full">
          {isLoading ? <Skeleton className="h-full w-full" /> : donut.every((d) => d.value === 0) ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
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
          </div>
          {donut.find(d => d.name === "Particular")?.value! > 0 && (
            <div className="mt-8 pt-6 border-t border-border">
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-4 text-center">Formas de Pagamento (Particular)</p>
              <div className="w-full">
                <div style={{ height: `${containerHeight}px` }} className="w-full relative">
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
                        onClick={(d: any) => setDetalhePagamento(d.name)}
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
          {isLoading ? <Skeleton className="h-40 w-full" /> : conveniosBreakdown.length === 0 ? (
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
  );
}
