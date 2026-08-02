import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useFilters } from "@/lib/filters-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num } from "@/lib/format";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/analytics/rentabilidade")({
  head: () => ({ meta: [{ title: "Rentabilidade — Análises" }] }),
  component: RentabilidadePage,
});

function RentabilidadePage() {
  const f = useFilters();

  const abcQ = useQuery({
    queryKey: ["vw_abc_proc", f.from.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_analytics_abc_procedimentos")
        .select("*")
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  const tmQ = useQuery({
    queryKey: ["vw_ticket_esp", f.from.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_analytics_ticket_medio_esp")
        .select("*")
        .limit(100);
      if (error) throw error;
      return data as any[];
    },
  });

  const abc = abcQ.data ?? [];
  const contA = abc.filter((r) => r.classe === "A").length;
  const contB = abc.filter((r) => r.classe === "B").length;
  const contC = abc.filter((r) => r.classe === "C").length;
  const receitaA = abc.filter((r) => r.classe === "A").reduce((s, r) => s + Number(r.receita || 0), 0);

  const scatterData = (tmQ.data ?? []).map((r) => ({
    x: Number(r.volume),
    y: Number(r.ticket_medio ?? 0),
    z: Number(r.receita || 0),
    nome: r.especialidade,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Rentabilidade</h1>
        <p className="text-sm text-muted-foreground">Curva ABC (Pareto) e matriz ticket × volume por especialidade.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Classe A (80% receita)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{num(contA)}</div>
            <div className="text-xs text-muted-foreground mt-1">{brl(receitaA)} · procedimentos essenciais</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Classe B (próximos 15%)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold">{num(contB)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Classe C (cauda longa)</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-semibold text-muted-foreground">{num(contC)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Curva ABC de procedimentos</CardTitle>
          <p className="text-xs text-muted-foreground">Top 20 por receita no período.</p>
        </CardHeader>
        <CardContent className="h-[26rem]">
          {abcQ.isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={abc.slice(0, 20)} margin={{ top: 8, right: 16, left: 8, bottom: 8 }} layout="vertical">
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={compactBrl}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis
                  type="category"
                  dataKey="procedimento"
                  width={210}
                  interval={0}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 29)}…` : v)}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--primary) 12%, transparent)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: 600, marginBottom: 4 }}
                  formatter={(v: any) => [brl(Number(v)), "Receita"]}
                />
                <Bar dataKey="receita" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Ticket médio × Volume (especialidade)</CardTitle></CardHeader>
          <CardContent className="h-80">
            {tmQ.isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis type="number" dataKey="x" name="Volume" />
                  <YAxis type="number" dataKey="y" name="Ticket" tickFormatter={(v) => brl(v)} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    formatter={(v: any, k: any) => k === "y" ? brl(v) : num(v)}
                    labelFormatter={() => ""}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded border bg-popover px-2 py-1 text-xs">
                          <div className="font-medium">{d.nome}</div>
                          <div>Volume: {num(d.x)}</div>
                          <div>Ticket: {brl(d.y)}</div>
                          <div>Receita: {brl(d.z)}</div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill="hsl(var(--primary))" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top 15 procedimentos</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedimento</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Vol.</TableHead>
                  <TableHead>Classe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abc.slice(0, 15).map((r) => (
                  <TableRow key={r.procedimento_id ?? r.procedimento}>
                    <TableCell className="max-w-[200px] truncate">{r.procedimento}</TableCell>
                    <TableCell className="text-right">{brl(Number(r.receita))}</TableCell>
                    <TableCell className="text-right">{num(r.volume)}</TableCell>
                    <TableCell>
                      <Badge variant={r.classe === "A" ? "default" : r.classe === "B" ? "secondary" : "outline"}>
                        {r.classe}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
