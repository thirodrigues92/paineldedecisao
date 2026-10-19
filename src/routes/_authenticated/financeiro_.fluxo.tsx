import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea, ReferenceLine, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { axisProps, tooltipProps } from "@/lib/chart-theme";
import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro_/fluxo")({
  head: () => ({
    meta: [
      { title: "Fluxo de caixa projetado — Financeiro" },
      { name: "description", content: "Projeção diária de saldo para 30, 60 e 90 dias." },
      { property: "og:title", content: "Fluxo de caixa projetado — Financeiro" },
      { property: "og:description", content: "Projeção diária de saldo para 30, 60 e 90 dias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FluxoPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diff = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

type Evento = { data: string; tipo: "entrada" | "pagar" | "recorrente"; valor: number; desc: string };

async function fetchBase() {
  const sb = supabase as any;
  const rec: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("vw_contas_receber")
      .select("id, valor, status, data_vencimento, data_pagamento, data_execucao, convenio_nome, is_convenio").order("id").range(from, from + 999);
    if (error) throw error;
    rec.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  const hoje = new Date();
  const desde = iso(new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1));
  const [{ data: pagar, error: e1 }, { data: cats, error: e2 }, { data: desp, error: e3 }] = await Promise.all([
    sb.from("financeiro_lancamentos").select("data_vencimento, descricao_item, categoria, valor").eq("tipo", "despesa").neq("status", "pago").not("data_vencimento", "is", null).limit(5000),
    sb.from("vw_dre_categorias").select("categoria_origem, grupo_dre"),
    sb.from("financeiro_lancamentos").select("data_vencimento, categoria, valor").eq("tipo", "despesa").gte("data_vencimento", desde).limit(5000),
  ]);
  if (e1 || e2 || e3) throw e1 || e2 || e3;
  return { rec, pagar: pagar ?? [], cats: cats ?? [], desp: desp ?? [] };
}

function FluxoPage() {
  const q = useQuery({ queryKey: ["fin-fluxo"], queryFn: fetchBase });
  const [horizonte, setHorizonte] = useState(30);
  const [saldoIni, setSaldoIni] = useState("0");

  const { serie, eventos, recorrentes, minimo } = useMemo(() => {
    const hojeD = new Date(); const hoje = iso(hojeD);
    const fim = iso(addDays(hojeD, horizonte));
    const evs: Evento[] = [];
    if (!q.data) return { serie: [], eventos: evs, recorrentes: [] as any[], minimo: 0 };
    const { rec, pagar, cats, desp } = q.data;

    // PMR por convênio
    const pm = new Map<string, { s: number; n: number }>();
    for (const r of rec) if (r.status === "pago" && r.data_execucao && r.data_pagamento) {
      const d = diff(r.data_execucao, r.data_pagamento); if (d < 0) continue;
      const a = pm.get(r.convenio_nome) ?? { s: 0, n: 0 }; a.s += d; a.n++; pm.set(r.convenio_nome, a);
    }
    const geral = [...pm.values()].reduce((x, a) => ({ s: x.s + a.s, n: x.n + a.n }), { s: 0, n: 0 });
    const pmrGeral = geral.n ? geral.s / geral.n : 30;
    for (const r of rec) if (r.status !== "pago") {
      const base = r.data_execucao ?? r.data_vencimento ?? hoje;
      let data = hoje;
      if (r.is_convenio) { const a = pm.get(r.convenio_nome); const p = a?.n ? a.s / a.n : pmrGeral; data = iso(addDays(parse(base), Math.round(p))); }
      if (data < hoje) data = hoje;
      evs.push({ data, tipo: "entrada", valor: Number(r.valor || 0), desc: r.convenio_nome ?? "Particular" });
    }
    for (const p of pagar) {
      const data = p.data_vencimento < hoje ? hoje : p.data_vencimento;
      evs.push({ data, tipo: "pagar", valor: Number(p.valor || 0), desc: p.descricao_item ?? p.categoria ?? "Conta" });
    }
    // Recorrentes: Pessoal e Ocupação, média dos 3 últimos meses fechados por categoria, no dia habitual
    const grupoDe = new Map<string, string>(cats.map((c: any) => [c.categoria_origem, c.grupo_dre]));
    const mesAtual = hoje.slice(0, 7);
    const porCat = new Map<string, { grupo: string; total: number; meses: Set<string>; dias: number[] }>();
    for (const d of desp) {
      const cat = d.categoria ?? "Não classificado"; const g = grupoDe.get(cat);
      if ((g !== "Pessoal" && g !== "Ocupação") || d.data_vencimento.slice(0, 7) >= mesAtual) continue;
      const a = porCat.get(cat) ?? { grupo: g, total: 0, meses: new Set(), dias: [] };
      a.total += Number(d.valor || 0); a.meses.add(d.data_vencimento.slice(0, 7)); a.dias.push(Number(d.data_vencimento.slice(8, 10)));
      porCat.set(cat, a);
    }
    const recs = [...porCat.entries()].map(([cat, a]) => {
      const freq = new Map<number, number>(); a.dias.forEach((x) => freq.set(x, (freq.get(x) ?? 0) + 1));
      const dia = [...freq.entries()].sort((x, y) => y[1] - x[1])[0][0];
      return { cat, grupo: a.grupo, media: a.total / 3, dia };
    });
    for (let m = 0; m <= Math.ceil(horizonte / 28); m++) {
      for (const r of recs) {
        const ref = new Date(hojeD.getFullYear(), hojeD.getMonth() + m, 1);
        const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
        const data = iso(new Date(ref.getFullYear(), ref.getMonth(), Math.min(r.dia, ultimo)));
        if (data < hoje || data > fim) continue;
        // Não duplica se já houver conta agendada da mesma categoria no mês
        if (pagar.some((p: any) => p.categoria === r.cat && p.data_vencimento.slice(0, 7) === data.slice(0, 7))) continue;
        evs.push({ data, tipo: "recorrente", valor: r.media, desc: `${r.cat} (média 3 meses)` });
      }
    }
    let saldo = Number(saldoIni.replace(/\./g, "").replace(",", ".")) || 0;
    const s: any[] = []; let min = saldo;
    for (let i = 0; i <= horizonte; i++) {
      const d = iso(addDays(hojeD, i));
      const doDia = evs.filter((e) => e.data === d);
      const ent = doDia.filter((e) => e.tipo === "entrada").reduce((x, e) => x + e.valor, 0);
      const pag = doDia.filter((e) => e.tipo === "pagar").reduce((x, e) => x + e.valor, 0);
      const rc = doDia.filter((e) => e.tipo === "recorrente").reduce((x, e) => x + e.valor, 0);
      saldo += ent - pag - rc; min = Math.min(min, saldo);
      s.push({ dia: d.slice(8, 10) + "/" + d.slice(5, 7), entradas: ent, saidas: -(pag + rc), saldo });
    }
    return { serie: s, eventos: evs.filter((e) => e.data <= fim).sort((a, b) => a.data.localeCompare(b.data)), recorrentes: recs, minimo: min };
  }, [q.data, horizonte, saldoIni]);

  const soma = (t: Evento["tipo"]) => eventos.filter((e) => e.tipo === t).reduce((x, e) => x + e.valor, 0);
  const final = serie.length ? serie[serie.length - 1].saldo : 0;
  const diaNeg = serie.find((s) => s.saldo < 0)?.dia;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fluxo de caixa projetado</h1>
          <p className="text-sm text-muted-foreground">Recebimentos previstos pelo prazo médio de cada convênio, contas agendadas e despesas recorrentes.</p>
        </div>
        <div className="flex items-end gap-3">
          <div><Label className="text-xs">Saldo inicial (R$)</Label><Input className="w-36 h-9" value={saldoIni} onChange={(e) => setSaldoIni(e.target.value)} /></div>
          <ToggleGroup type="single" variant="outline" value={String(horizonte)} onValueChange={(v) => v && setHorizonte(Number(v))}>
            {[30, 60, 90].map((h) => <ToggleGroupItem key={h} value={String(h)}>{h} dias</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi l="Recebimentos previstos" v={brl(soma("entrada"))} />
        <Kpi l="Contas a pagar" v={brl(soma("pagar"))} />
        <Kpi l="Recorrentes estimadas" v={brl(soma("recorrente"))} />
        <Kpi l={`Saldo em ${horizonte} dias`} v={brl(final)} tone={final < 0} />
        <Kpi l="Menor saldo" v={brl(minimo)} tone={minimo < 0} sub={diaNeg ? `negativo a partir de ${diaNeg}` : "sem dia negativo"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Saldo projetado diário</CardTitle></CardHeader>
        <CardContent className="h-[440px]">
          {q.isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis {...axisProps} dataKey="dia" fontSize={11} interval={horizonte > 30 ? 6 : 2} />
                <YAxis {...axisProps} fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                {minimo < 0 && <ReferenceArea y1={minimo * 1.1} y2={0} fill="var(--destructive)" fillOpacity={0.12} />}
                <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
                <Tooltip {...tooltipProps} formatter={(v: any, n: any) => [brl(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="entradas" name="Entradas" fill="var(--chart-2)" fillOpacity={0.6} />
                <Bar dataKey="saidas" name="Saídas" fill="var(--chart-5)" fillOpacity={0.6} />
                <Line dataKey="saldo" name="Saldo" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Movimentos previstos</CardTitle></CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {eventos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum movimento previsto.</p> : (
              <table className="w-full text-sm"><tbody>
                {eventos.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{e.data.split("-").reverse().join("/")}</td>
                    <td className="pr-2">{e.desc}<div className="text-[10px] text-muted-foreground">{e.tipo === "entrada" ? "a receber" : e.tipo === "pagar" ? "conta agendada" : "recorrente"}</div></td>
                    <td className={`text-right tabular-nums ${e.tipo === "entrada" ? "text-success" : "text-destructive"}`}>{e.tipo === "entrada" ? "+" : "–"}{brl(e.valor)}</td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Despesas recorrentes consideradas</CardTitle></CardHeader>
          <CardContent>
            {recorrentes.length === 0 ? <p className="text-sm text-muted-foreground">Sem histórico de Pessoal/Ocupação nos últimos 3 meses.</p> : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left"><tr><th className="py-1">Categoria</th><th>Grupo</th><th className="text-right">Dia</th><th className="text-right">Média/mês</th></tr></thead>
                <tbody>{recorrentes.sort((a, b) => b.media - a.media).map((r) => (
                  <tr key={r.cat} className="border-t border-border"><td className="py-1.5">{r.cat}</td><td className="text-muted-foreground">{r.grupo}</td><td className="text-right">{r.dia}</td><td className="text-right tabular-nums">{brl(r.media)}</td></tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ l, v, sub, tone }: { l: string; v: string; sub?: string; tone?: boolean }) {
  return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={`text-xl font-semibold mt-1 ${tone ? "text-destructive" : ""}`}>{v}</div>{sub && <div className="text-xs text-muted-foreground">{sub}</div>}</CardContent></Card>;
}
