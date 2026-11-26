import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DRE_MONTHS } from "@/lib/dre-tree";

type Row = { ordem: number; linha: string; tipo: string; mes: number; valor: number };
type Line = { ordem: number; linha: string; tipo: string; values: number[]; total: number; ref: number | null };

const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function fetchFeegowDre(year: number, regime: string): Promise<Line[]> {
  const { data, error } = await supabase.rpc("fn_dre_feegow", { p_ano: year, p_regime: regime });
  if (error) throw error;
  const { data: ref, error: refError } = await supabase.from("dre_feegow_referencia").select("linha, valor").eq("ano", year);
  if (refError) throw refError;
  const refTotals = new Map<string, number>();
  for (const r of ref ?? []) if (r.linha) refTotals.set(r.linha, (refTotals.get(r.linha) ?? 0) + Number(r.valor ?? 0));
  const lines = new Map<string, Line>();
  for (const r of (data ?? []) as Row[]) {
    const line = lines.get(r.linha) ?? { ordem: r.ordem, linha: r.linha, tipo: r.tipo, values: Array(12).fill(0), total: 0, ref: refTotals.has(r.linha) ? refTotals.get(r.linha)! : null };
    line.values[r.mes - 1] = Number(r.valor);
    line.total += Number(r.valor);
    lines.set(r.linha, line);
  }
  return [...lines.values()].sort((a, b) => a.ordem - b.ordem);
}

export function DreFeegow({ year, regime }: { year: number; regime: string }) {
  const q = useQuery({ queryKey: ["dre-feegow", year, regime], queryFn: () => fetchFeegowDre(year, regime) });
  if (q.isPending) return <Skeleton className="h-96 w-full" />;
  if (q.isError) return <div role="alert" className="space-y-3 text-destructive"><p>Não foi possível carregar a DRE no modelo Feegow.</p><Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></div>;
  const hasRef = q.data.some(l => l.ref !== null);
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Mesmas linhas e categorias da DRE do Feegow. Como no Feegow, a receita de atendimentos aparece em Receita Particular e em Receita Convênio, e o Total de despesas não inclui Repasses. Este modelo considera todas as unidades.</p>
    <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[1800px] text-xs">
      <thead><tr className="border-b bg-muted text-muted-foreground"><th className="sticky left-0 z-20 min-w-64 bg-muted px-3 py-4 text-left">Linha da DRE</th>{DRE_MONTHS.map(m => <th key={m} className="min-w-24 px-2 text-right">{m}</th>)}<th className="min-w-28 px-3 text-right">Total</th>{hasRef && <><th className="min-w-28 px-3 text-right">Relatório Feegow</th><th className="min-w-28 px-3 text-right">Diferença</th></>}</tr></thead>
      <tbody>{q.data.map(l => {
        const strong = l.tipo === "total";
        const diff = l.ref === null ? null : l.total - l.ref;
        return <tr key={l.linha} className={`border-b ${strong ? "bg-muted/50 font-semibold" : ""}`}>
          <td className={`sticky left-0 z-10 px-3 py-2 ${strong ? "bg-muted" : "bg-background"}`}>{l.linha}</td>
          {l.values.map((v, i) => <td key={i} className="px-2 text-right tabular-nums">{brl(v)}</td>)}
          <td className="px-3 text-right font-medium tabular-nums">{brl(l.total)}</td>
          {hasRef && <><td className="px-3 text-right tabular-nums text-muted-foreground">{l.ref === null ? "—" : brl(l.ref)}</td><td className={`px-3 text-right tabular-nums ${diff !== null && Math.abs(diff) > 1 ? "text-destructive" : "text-muted-foreground"}`}>{diff === null ? "—" : brl(diff)}</td></>}
        </tr>;
      })}</tbody>
    </table></div>
  </div>;
}
