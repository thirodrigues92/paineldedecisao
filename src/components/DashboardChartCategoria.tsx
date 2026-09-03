import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { brl, num, pct } from "@/lib/format";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { Skeleton } from "@/components/ui/skeleton";

const compactBrl = (n: number) =>
  Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : brl(n);

export function DashboardChartCategoria({ labRows, isLoading }: { labRows: any[], isLoading?: boolean }) {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Faturamento por categoria</CardTitle>
          <p className="text-xs text-muted-foreground">Receitas do período agrupadas por categoria financeira — as menores aparecem no fim da lista.</p>
        </CardHeader>
        <CardContent className="h-[26rem]">
          {isLoading ? <Skeleton className="h-full w-full" /> : topCategorias.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
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
          {isLoading ? <Skeleton className="h-40 w-full" /> : menores.length === 0 ? (
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
  );
}
