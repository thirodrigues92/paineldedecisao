import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { DashboardDateFilter } from "@/components/DashboardDateFilter";
import { useFilters } from "@/lib/filters-context";
import { supabase } from "@/integrations/supabase/client";
import { axisProps, tooltipProps } from "@/lib/chart-theme";
import { brl, num, pct } from "@/lib/format";
import { dreQueryKey, fetchDre, mesesEntre, totais } from "@/lib/dre";

export const Route = createFileRoute("/_authenticated/financeiro_/repasse")({
  head: () => ({
    meta: [
      { title: "Repasse médico — Financeiro" },
      { name: "description", content: "Receita, repasse e rentabilidade por médico e especialidade." },
      { property: "og:title", content: "Repasse médico — Financeiro" },
      { property: "og:description", content: "Receita, repasse e rentabilidade por médico e especialidade." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepassePage,
});

type Med = { profissional_id: number; nome: string; especialidade: string; receita: number; qtd_atend: number; apurado: number; pago: number; pendente: number };
type SortKey = "receita" | "apurado" | "pendente" | "pctRep" | "rentab";

function RepassePage() {
  const f = useFilters();
  const de = format(f.from, "yyyy-MM-dd"), ate = format(f.to, "yyyy-MM-dd");
  const [busca, setBusca] = useState("");
  const [ord, setOrd] = useState<SortKey>("receita");

  const q = useQuery({
    queryKey: ["fin-repasse", de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fin_repasse_medico", { p_from: de, p_to: ate });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, receita: +r.receita, apurado: +r.apurado, pago: +r.pago, pendente: +r.pendente, qtd_atend: +r.qtd_atend })) as Med[];
    },
  });
  const dre = useQuery({ queryKey: dreQueryKey("competencia"), queryFn: () => fetchDre("competencia") });
  const insumosTotal = totais(dre.data ?? [], mesesEntre(f.from, f.to))["Insumos e apoio"] ?? 0;

  const meds = q.data ?? [];
  const receitaTotal = meds.reduce((s, m) => s + m.receita, 0);
  const linhas = useMemo(() => meds.map((m) => {
    const insumos = receitaTotal ? insumosTotal * (m.receita / receitaTotal) : 0;
    return { ...m, insumos, pctRep: m.receita ? (m.apurado / m.receita) * 100 : 0, rentab: m.receita - m.apurado - insumos };
  }), [meds, receitaTotal, insumosTotal]);
  const filtradas = linhas
    .filter((l) => !busca || `${l.nome} ${l.especialidade}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b[ord] - a[ord]);

  const esp = useMemo(() => {
    const m = new Map<string, { nome: string; receita: number; repasse: number; rentab: number; medicos: number }>();
    for (const l of linhas) {
      const a = m.get(l.especialidade) ?? { nome: l.especialidade, receita: 0, repasse: 0, rentab: 0, medicos: 0 };
      a.receita += l.receita; a.repasse += l.apurado; a.rentab += l.rentab; a.medicos += 1;
      m.set(l.especialidade, a);
    }
    return [...m.values()].sort((a, b) => b.receita - a.receita);
  }, [linhas]);

  const tot = linhas.reduce((s, l) => ({ ap: s.ap + l.apurado, pg: s.pg + l.pago, pe: s.pe + l.pendente, rt: s.rt + l.rentab }), { ap: 0, pg: 0, pe: 0, rt: 0 });
  const top = [...linhas].sort((a, b) => b.rentab - a.rentab).slice(0, 12);

  const Th = ({ k, children }: { k: SortKey; children: string }) => (
    <th className={`text-right px-2 cursor-pointer ${ord === k ? "text-foreground" : ""}`} onClick={() => setOrd(k)}>{children}{ord === k ? " ↓" : ""}</th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Repasse médico</h1>
          <p className="text-sm text-muted-foreground">Receita faturada x repasse apurado na Feegow · insumos rateados pela receita.</p>
        </div>
        <DashboardDateFilter />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Receita gerada" v={brl(receitaTotal)} />
        <Kpi label="Repasse apurado" v={brl(tot.ap)} sub={receitaTotal ? `${pct((tot.ap / receitaTotal) * 100)} da receita` : ""} />
        <Kpi label="Repasse pago" v={brl(tot.pg)} />
        <Kpi label="Repasse pendente" v={brl(tot.pe)} />
        <Kpi label="Rentabilidade" v={brl(tot.rt)} sub="receita – repasse – insumos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Ranking de rentabilidade</CardTitle></CardHeader>
          <CardContent className="h-[440px]">
            {q.isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis {...axisProps} type="number" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis {...axisProps} type="category" dataKey="nome" width={170} fontSize={11} />
                  <Tooltip {...tooltipProps} formatter={(v: any, n: any) => [brl(Number(v)), n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="apurado" name="Repasse" stackId="a" fill="var(--chart-5)" />
                  <Bar dataKey="insumos" name="Insumos" stackId="a" fill="var(--chart-4)" />
                  <Bar dataKey="rentab" name="Rentabilidade" stackId="a" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por especialidade</CardTitle></CardHeader>
          <CardContent className="h-[440px]">
            {q.isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={esp.slice(0, 12)} margin={{ bottom: 60 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis {...axisProps} dataKey="nome" fontSize={10} angle={-35} textAnchor="end" interval={0} height={70} />
                  <YAxis {...axisProps} fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip {...tooltipProps} formatter={(v: any, n: any, p: any) => [`${brl(Number(v))}${p.payload.receita ? ` · ${pct((Number(v) / p.payload.receita) * 100)}` : ""}`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="receita" name="Receita" fill="var(--chart-1)" />
                  <Bar dataKey="repasse" name="Repasse" fill="var(--chart-5)" />
                  <Bar dataKey="rentab" name="Rentabilidade" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Por médico</CardTitle>
          <Input placeholder="Buscar médico ou especialidade..." value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {q.isLoading ? <Skeleton className="h-60 w-full" /> : q.isError ? <p className="text-sm text-destructive">Erro ao carregar o repasse.</p> : (
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Médico</th><th className="text-left">Especialidade</th>
                  <Th k="receita">Receita</Th><Th k="apurado">Apurado</Th><th className="text-right px-2">Pago</th>
                  <Th k="pendente">Pendente</Th><Th k="pctRep">% repasse</Th><th className="text-right px-2">Insumos</th><Th k="rentab">Rentabilidade</Th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.profissional_id} className="border-t border-border">
                    <td className="py-1.5">{l.nome}<div className="text-[10px] text-muted-foreground">{num(l.qtd_atend)} atendimentos</div></td>
                    <td className="text-muted-foreground">{l.especialidade}</td>
                    <td className="text-right px-2 tabular-nums">{brl(l.receita)}</td>
                    <td className="text-right px-2 tabular-nums">{brl(l.apurado)}</td>
                    <td className="text-right px-2 tabular-nums">{brl(l.pago)}</td>
                    <td className={`text-right px-2 tabular-nums ${l.pendente > 0 ? "text-warning" : ""}`}>{brl(l.pendente)}</td>
                    <td className={`text-right px-2 ${l.pctRep > 50 ? "text-destructive" : ""}`}>{l.receita ? pct(l.pctRep) : "—"}</td>
                    <td className="text-right px-2 tabular-nums text-muted-foreground">{brl(l.insumos)}</td>
                    <td className={`text-right px-2 tabular-nums font-medium ${l.rentab < 0 ? "text-destructive" : "text-success"}`}>{brl(l.rentab)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold mt-1">{v}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</CardContent></Card>;
}
