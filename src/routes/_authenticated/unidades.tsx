import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { brl, num } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/unidades")({
  head: () => ({ meta: [{ title: "Unidades" }] }),
  component: UnidadesPage,
});

function UnidadesPage() {
  const f = useFilters();
  const q = useQuery({
    queryKey: ["unidades-rank", f.from.toISOString(), f.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.from("agendamentos")
        .select("unidade_id, valor_total, unidades(nome_fantasia), status_agendamento(categoria)")
        .gte("data", f.from.toISOString().slice(0, 10))
        .lte("data", f.to.toISOString().slice(0, 10))
        .limit(30000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = (q.data ?? []) as any[];
  const byU = new Map<string, { nome: string; total: number; realizado: number; receita: number }>();
  for (const r of rows) {
    const nome = r.unidades?.nome_fantasia ?? "—";
    const cur = byU.get(nome) ?? { nome, total: 0, realizado: 0, receita: 0 };
    cur.total += 1;
    if (r.status_agendamento?.categoria === "realizado") { cur.realizado += 1; cur.receita += Number(r.valor_total || 0); }
    byU.set(nome, cur);
  }
  const list = Array.from(byU.values()).sort((a, b) => b.receita - a.receita);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Unidades</h1>
        <p className="text-sm text-muted-foreground">Comparativo entre unidades.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {q.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        {list.map((u) => (
          <Card key={u.nome}>
            <CardHeader><CardTitle className="text-base">{u.nome}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-[11px] text-muted-foreground">Agend.</div><div className="font-medium">{num(u.total)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Realiz.</div><div className="font-medium">{num(u.realizado)}</div></div>
              <div><div className="text-[11px] text-muted-foreground">Receita</div><div className="font-medium">{brl(u.receita)}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
