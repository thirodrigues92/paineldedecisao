import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/heatmap")({
  head: () => ({ meta: [{ title: "Heatmap da Agenda" }] }),
  component: HeatmapPage,
});

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORAS = Array.from({ length: 13 }, (_, i) => 7 + i); // 7h..19h

function HeatmapPage() {
  const f = useFilters();
  const q = useQuery({
    queryKey: ["heatmap", f.from.toISOString(), f.to.toISOString(), f.unidadeIds],
    queryFn: async () => {
      let query = supabase
        .from("agendamentos")
        .select("data, horario, status_agendamento(categoria)")
        .gte("data", f.from.toISOString().slice(0, 10))
        .lte("data", f.to.toISOString().slice(0, 10));
      if (f.unidadeIds.length) query = query.in("unidade_id", f.unidadeIds);
      const { data, error } = await query.limit(30000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const grid: Record<string, { total: number; realizado: number }> = {};
  for (const r of (q.data ?? []) as any[]) {
    const d = new Date(r.data + "T00:00:00").getDay();
    const h = Number(String(r.horario).slice(0, 2));
    const key = `${d}-${h}`;
    grid[key] ??= { total: 0, realizado: 0 };
    grid[key].total += 1;
    if (r.status_agendamento?.categoria === "realizado") grid[key].realizado += 1;
  }
  const max = Math.max(1, ...Object.values(grid).map((g) => g.total));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Heatmap da Agenda</h1>
        <p className="text-sm text-muted-foreground">Densidade de agendamentos por dia da semana e hora.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Ocupação por horário</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading ? <Skeleton className="h-72 w-full" /> : (
            <div className="overflow-auto">
              <table className="text-xs border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th></th>
                    {HORAS.map((h) => <th key={h} className="w-10 text-muted-foreground font-normal">{h}h</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DIAS.map((dia, di) => (
                    <tr key={dia}>
                      <td className="pr-2 text-muted-foreground">{dia}</td>
                      {HORAS.map((h) => {
                        const cell = grid[`${di}-${h}`];
                        const intensity = cell ? cell.total / max : 0;
                        const bg = `color-mix(in oklab, var(--primary) ${Math.round(intensity * 90)}%, transparent)`;
                        return (
                          <td key={h} className="w-10 h-8 rounded text-center" style={{ background: bg }} title={cell ? `${cell.total} agend. (${cell.realizado} realizados)` : "0"}>
                            {cell ? cell.total : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
