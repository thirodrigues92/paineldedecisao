import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { brl, num, pct } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/profissionais")({
  head: () => ({ meta: [{ title: "Profissionais" }] }),
  component: ProfPage,
});

function ProfPage() {
  const f = useFilters();
  const q = useQuery({
    queryKey: ["prof-rank", f.from.toISOString(), f.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("agendamentos")
        .select("profissional_id, valor_total, profissionais(nome), status_agendamento(categoria)")
        .gte("data", f.from.toISOString().slice(0, 10))
        .lte("data", f.to.toISOString().slice(0, 10))
        .limit(30000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];
  const byProf = new Map<string, { nome: string; total: number; realizado: number; noshow: number; receita: number }>();
  for (const r of rows) {
    const nome = r.profissionais?.nome ?? "—";
    const cur = byProf.get(nome) ?? { nome, total: 0, realizado: 0, noshow: 0, receita: 0 };
    cur.total += 1;
    if (r.status_agendamento?.categoria === "realizado") { cur.realizado += 1; cur.receita += Number(r.valor_total || 0); }
    if (r.status_agendamento?.categoria === "no_show") cur.noshow += 1;
    byProf.set(nome, cur);
  }
  const list = Array.from(byProf.values()).sort((a, b) => b.receita - a.receita);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profissionais</h1>
        <p className="text-sm text-muted-foreground">Produção por profissional no período.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Ranking por receita realizada</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? <Skeleton className="h-64 w-full" /> : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left py-2">Profissional</th>
                    <th className="text-right">Agend.</th>
                    <th className="text-right">Realizados</th>
                    <th className="text-right">No-show</th>
                    <th className="text-right">Ocupação</th>
                    <th className="text-right">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const denom = p.realizado + p.noshow;
                    return (
                      <tr key={p.nome} className="border-t border-border">
                        <td className="py-2">{p.nome}</td>
                        <td className="text-right">{num(p.total)}</td>
                        <td className="text-right">{num(p.realizado)}</td>
                        <td className="text-right">{num(p.noshow)}</td>
                        <td className="text-right">{denom > 0 ? pct((p.realizado * 100) / denom) : "—"}</td>
                        <td className="text-right font-medium">{brl(p.receita)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
