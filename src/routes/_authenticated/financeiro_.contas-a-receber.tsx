import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro_/contas-a-receber")({
  head: () => ({
    meta: [
      { title: "Contas a receber — Financeiro" },
      { name: "description", content: "Saldo em aberto por convênio, aging, prazo médio de recebimento e reserva de glosa." },
      { property: "og:title", content: "Contas a receber — Financeiro" },
      { property: "og:description", content: "Saldo em aberto por convênio, aging, prazo médio de recebimento e reserva de glosa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContasReceber,
});

type Rec = { valor: number; status: string; venc: string | null; pag: string | null; exec: string | null; conv: string; isConv: boolean };

async function fetchReceber(): Promise<Rec[]> {
  const sb = supabase as any;
  const out: Rec[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("vw_contas_receber")
      .select("id, valor, status, data_vencimento, data_pagamento, data_execucao, convenio_nome, is_convenio")
      .order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.push({
      valor: Number(r.valor || 0), status: r.status ?? "", venc: r.data_vencimento, pag: r.data_pagamento,
      exec: r.data_execucao, conv: r.convenio_nome ?? "Particular", isConv: !!r.is_convenio,
    });
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const hoje = () => new Date().toISOString().slice(0, 10);
const FAIXAS = [
  { label: "0–30 dias", ok: (d: number) => d <= 30 },
  { label: "31–60 dias", ok: (d: number) => d > 30 && d <= 60 },
  { label: "61–90 dias", ok: (d: number) => d > 60 && d <= 90 },
  { label: "Mais de 90", ok: (d: number) => d > 90 },
];

function ContasReceber() {
  const q = useQuery({ queryKey: ["contas-receber"], queryFn: fetchReceber });
  const [reservaPct, setReservaPct] = useState(7.5);
  const rows = q.data ?? [];
  const abertos = rows.filter((r) => r.status !== "pago");
  const h = hoje();
  const idade = (r: Rec) => Math.max(0, dias(r.exec ?? r.venc ?? h, h));

  const porConv = useMemo(() => {
    const m = new Map<string, { conv: string; isConv: boolean; aberto: number; qtdAberto: number; somaDias: number; qtdPmr: number }>();
    for (const r of rows) {
      const a = m.get(r.conv) ?? { conv: r.conv, isConv: r.isConv, aberto: 0, qtdAberto: 0, somaDias: 0, qtdPmr: 0 };
      if (r.status !== "pago") { a.aberto += r.valor; a.qtdAberto += 1; }
      else if (r.exec && r.pag) { const d = dias(r.exec, r.pag); if (d >= 0) { a.somaDias += d; a.qtdPmr += 1; } }
      m.set(r.conv, a);
    }
    return [...m.values()].map((a) => ({ ...a, pmr: a.qtdPmr ? a.somaDias / a.qtdPmr : null }));
  }, [rows]);

  const comSaldo = porConv.filter((c) => c.aberto > 0).sort((a, b) => b.aberto - a.aberto);
  const ranking = porConv.filter((c) => c.pmr != null && c.qtdPmr >= 3).sort((a, b) => (b.pmr ?? 0) - (a.pmr ?? 0)).slice(0, 15);
  const maxPmr = Math.max(1, ...ranking.map((r) => r.pmr ?? 0));
  const saldoTotal = abertos.reduce((s, r) => s + r.valor, 0);
  const saldoConv = abertos.filter((r) => r.isConv).reduce((s, r) => s + r.valor, 0);
  const pagosPmr = rows.filter((r) => r.status === "pago" && r.exec && r.pag && dias(r.exec, r.pag) >= 0);
  const pmrGeral = pagosPmr.length ? pagosPmr.reduce((s, r) => s + dias(r.exec!, r.pag!), 0) / pagosPmr.length : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contas a receber</h1>
        <p className="text-sm text-muted-foreground">Receitas em aberto e prazo médio de recebimento por convênio.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Saldo em aberto" value={q.isLoading ? "..." : brl(saldoTotal)} sub={`${num(abertos.length)} lançamentos`} />
        <Kpi label="PMR geral" value={q.isLoading ? "..." : pmrGeral != null ? `${Math.round(pmrGeral)} dias` : "sem dados"} sub="atendimento → pagamento" />
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Reserva sugerida de glosa</div>
          <div className="text-xl font-semibold mt-1">{brl(saldoConv * reservaPct / 100)}</div>
          <div className="text-xs text-muted-foreground mb-2">{reservaPct.toLocaleString("pt-BR")}% de {brl(saldoConv)} (convênios em aberto)</div>
          <Slider min={5} max={10} step={0.5} value={[reservaPct]} onValueChange={(v) => setReservaPct(v[0])} />
        </CardContent></Card>
        <Kpi label="Taxa de glosa" value="sem dados" sub="nenhuma glosa registrada na Feegow" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {FAIXAS.map((f) => {
          const it = abertos.filter((r) => f.ok(idade(r)));
          return <Kpi key={f.label} label={`Aging ${f.label}`} value={brl(it.reduce((s, r) => s + r.valor, 0))} sub={`${num(it.length)} lançamentos`} />;
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Saldo em aberto por convênio</CardTitle></CardHeader>
          <CardContent>
            {q.isLoading ? <Skeleton className="h-60 w-full" /> : comSaldo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum valor em aberto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left"><tr><th className="py-1">Convênio</th><th className="text-right">Lanç.</th><th className="text-right">Em aberto</th><th className="text-right">PMR</th></tr></thead>
                <tbody>{comSaldo.map((c) => (
                  <tr key={c.conv} className="border-t border-border">
                    <td className="py-1.5">{c.conv}</td>
                    <td className="text-right">{num(c.qtdAberto)}</td>
                    <td className="text-right tabular-nums">{brl(c.aberto)}</td>
                    <td className="text-right">{c.pmr != null ? `${Math.round(c.pmr)} d` : "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quem mais demora a pagar (PMR)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {q.isLoading ? <Skeleton className="h-60 w-full" /> : ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados suficientes de pagamento.</p>
            ) : ranking.map((r, i) => (
              <div key={r.conv} className="text-sm">
                <div className="flex justify-between"><span>{i + 1}. {r.conv}</span><span className="font-medium">{Math.round(r.pmr!)} dias</span></div>
                <div className="h-2 rounded bg-muted mt-1"><div className="h-2 rounded bg-warning" style={{ width: `${((r.pmr ?? 0) / maxPmr) * 100}%` }} /></div>
                <div className="text-[10px] text-muted-foreground">{num(r.qtdPmr)} pagamentos</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}
