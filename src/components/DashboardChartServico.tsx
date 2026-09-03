import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { brl, num, pct } from "@/lib/format";
import { axisProps, gridProps, tooltipProps } from "@/lib/chart-theme";
import { Skeleton } from "@/components/ui/skeleton";
import { categoriaServico } from "@/lib/service-categories";

const compactBrl = (n: number) =>
  Math.abs(n) >= 1000 ? `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k` : brl(n);

export function DashboardChartServico({ 
  labRows, 
  faturadoReal,
  isLoading,
  setDetalhe
}: { 
  labRows: any[];
  faturadoReal: number;
  isLoading?: boolean;
  setDetalhe: (val: string | null) => void;
}) {
  const byServico = new Map<string, any>();
  let classificado = 0;
  for (const r of labRows) {
    const valor = Number(r.valor || 0);
    const nomeProc = r.procedimento_nome ?? "Sem descrição";
    const nome = categoriaServico(nomeProc);
    if (nomeProc) classificado += valor;
    
    const cur = byServico.get(nome) ?? { nome, valor: 0, qtd: 0 };
    cur.valor += valor;
    cur.qtd += 1;
    byServico.set(nome, cur);
  }

  const servicosBase = Array.from(byServico.values()).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor);
  const totalServicos = servicosBase.reduce((s, c) => s + c.valor, 0);
  const servicos = servicosBase.map((c) => ({ ...c, share: totalServicos > 0 ? (c.valor * 100) / totalServicos : 0 }));
  const receitaLote = byServico.get("Faturamento em lote (convênio)")?.valor ?? 0;
  const semDetalhe = byServico.get("Sem detalhamento da Feegow")?.valor ?? 0;
  const coberturaServico = faturadoReal > 0 ? (classificado * 100) / faturadoReal : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Faturamento por tipo de serviço</CardTitle>
          <p className="text-xs text-muted-foreground">
            Receita real do período ({brl(faturadoReal)}) — classificada por procedimento {brl(classificado)} ({pct(coberturaServico)})
            {receitaLote > 0 ? ` · faturas em lote de convênio ${brl(receitaLote)}` : ""}
            {semDetalhe > 0 ? ` · sem detalhamento da Feegow ${brl(semDetalhe)}` : ""}.
            Clique numa barra para ver o que há dentro da categoria.
          </p>
        </CardHeader>
        <CardContent className="h-96">
          {isLoading ? <Skeleton className="h-full w-full" /> : servicos.length === 0 ? (
             <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={servicos} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} type="number" tickFormatter={(v) => compactBrl(Number(v))} />
                <YAxis {...axisProps} dataKey="nome" type="category" width={195} interval={0} />
                <Tooltip
                  {...tooltipProps}
                  formatter={(v: any, _n: any, p: any) => [`${brl(Number(v))} · ${pct(p?.payload?.share ?? 0)} · ${num(p?.payload?.qtd ?? 0)} lanç.`, "Faturamento"]}
                />
                <Bar
                  dataKey="valor"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(d: any) => setDetalhe(d?.payload?.nome ?? null)}
                >
                  {servicos.map((c, i) => (
                    <Cell key={c.nome} fill={i === servicos.length - 1 ? "var(--chart-5)" : "var(--chart-2)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Composição do faturamento</CardTitle>
          <p className="text-xs text-muted-foreground">Quanto cada tipo de serviço representa do total do período.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <Skeleton className="h-64 w-full" /> : servicos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados para os filtros selecionados.</p>
          ) : (
            <>
              {servicos.map((c, i) => (
                <button
                  key={c.nome}
                  type="button"
                  onClick={() => setDetalhe(c.nome)}
                  className="w-full space-y-1 text-left rounded-md px-1 py-0.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate" title={c.nome}>{c.nome}</span>
                    <span className="font-medium shrink-0">{brl(c.valor)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(c.share, 1)}%`, background: `var(--chart-${(i % 5) + 1})` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{pct(c.share)} do total · {num(c.qtd)} lançamentos</div>
                </button>
              ))}
              <p className="pt-2 text-[11px] leading-snug text-muted-foreground border-t border-border">
                Total confere com a receita do período: {brl(totalServicos)} de {brl(faturadoReal)}.
                {receitaLote > 0
                  ? ` ${brl(receitaLote)} vêm de faturas em lote de convênio (a Feegow não abre o procedimento nesse formato).`
                  : ""}
                {semDetalhe > 0
                  ? ` ${brl(semDetalhe)} sem item na fatura — rode a sincronização financeira para reduzir.`
                  : ""}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
