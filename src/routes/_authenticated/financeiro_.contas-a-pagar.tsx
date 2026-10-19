import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/financeiro_/contas-a-pagar")({
  head: () => ({
    meta: [
      { title: "Contas a pagar — Financeiro" },
      { name: "description", content: "Vencimentos, aging e calendário das contas a pagar." },
      { property: "og:title", content: "Contas a pagar — Financeiro" },
      { property: "og:description", content: "Vencimentos, aging e calendário das contas a pagar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContasPagar,
});

type Conta = { id: number; venc: string; fornecedor: string; categoria: string; valor: number; dias: number };
const hojeISO = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const fmt = (s: string) => s.split("-").reverse().join("/");

async function fetchPagar() {
  const sb = supabase as any;
  const [{ data, error }, { data: ult }] = await Promise.all([
    sb.from("financeiro_lancamentos").select("id, data_vencimento, descricao_item, categoria, valor, status")
      .eq("tipo", "despesa").neq("status", "pago").not("data_vencimento", "is", null).limit(5000),
    sb.from("financeiro_lancamentos").select("data_vencimento").eq("tipo", "despesa")
      .not("data_vencimento", "is", null).order("data_vencimento", { ascending: false }).limit(1),
  ]);
  if (error) throw error;
  const h = hojeISO().getTime();
  const contas: Conta[] = (data ?? []).map((r: any) => {
    const [y, m, d] = r.data_vencimento.split("-").map(Number);
    return {
      id: r.id, venc: r.data_vencimento, fornecedor: (r.descricao_item ?? "").trim() || "Sem descrição",
      categoria: r.categoria ?? "Não classificado", valor: Number(r.valor || 0),
      dias: Math.round((new Date(y, m - 1, d).getTime() - h) / 86400000),
    };
  });
  return { contas, ultimaData: (ult?.[0]?.data_vencimento as string | undefined) ?? null };
}

const FAIXAS = [
  { k: "vencido", label: "Vencido", ok: (d: number) => d < 0 },
  { k: "0-7", label: "0–7 dias", ok: (d: number) => d >= 0 && d <= 7 },
  { k: "8-15", label: "8–15 dias", ok: (d: number) => d >= 8 && d <= 15 },
  { k: "16-30", label: "16–30 dias", ok: (d: number) => d >= 16 && d <= 30 },
  { k: "30+", label: "Mais de 30", ok: (d: number) => d > 30 },
];

function ContasPagar() {
  const q = useQuery({ queryKey: ["contas-pagar"], queryFn: fetchPagar });
  const [forn, setForn] = useState("__all__");
  const [cat, setCat] = useState("__all__");
  const [faixa, setFaixa] = useState<string | null>(null);
  const [mesCal, setMesCal] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const todas = q.data?.contas ?? [];
  const fornecedores = useMemo(() => [...new Set(todas.map((c) => c.fornecedor))].sort(), [todas]);
  const categorias = useMemo(() => [...new Set(todas.map((c) => c.categoria))].sort(), [todas]);
  const filtradas = todas.filter((c) => (forn === "__all__" || c.fornecedor === forn) && (cat === "__all__" || c.categoria === cat));
  const lista = filtradas.filter((c) => !faixa || FAIXAS.find((f) => f.k === faixa)!.ok(c.dias)).sort((a, b) => a.venc.localeCompare(b.venc));

  const ult = q.data?.ultimaData;
  const semFuturo = !q.isLoading && !todas.some((c) => c.dias >= 0);

  const porDia = new Map<string, number>();
  for (const c of filtradas) porDia.set(c.venc, (porDia.get(c.venc) ?? 0) + c.valor);
  const ano = mesCal.getFullYear(), mes = mesCal.getMonth();
  const diasMes = new Date(ano, mes + 1, 0).getDate();
  const offset = new Date(ano, mes, 1).getDay();
  const celulas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => i + 1)];
  const iso = (d: number) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const hoje = hojeISO();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contas a pagar</h1>
          <p className="text-sm text-muted-foreground">Despesas em aberto · {num(filtradas.length)} contas · {brl(filtradas.reduce((s, c) => s + c.valor, 0))}</p>
        </div>
        <div className="flex gap-2">
          <Select value={forn} onValueChange={setForn}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Todos os fornecedores</SelectItem>{fornecedores.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent><SelectItem value="__all__">Todas as categorias</SelectItem>{categorias.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {semFuturo && (
        <div className="rounded-md border border-warning/50 bg-warning/15 p-3 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Sincronização financeira desatualizada — última data: {ult ? fmt(ult).slice(0, 5) : "—"}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {FAIXAS.map((f) => {
          const itens = filtradas.filter((c) => f.ok(c.dias));
          const ativo = faixa === f.k;
          return (
            <Card key={f.k} onClick={() => setFaixa(ativo ? null : f.k)}
              className={`cursor-pointer transition ${ativo ? "ring-2 ring-primary" : ""} ${f.k === "vencido" && itens.length ? "border-destructive/60" : ""}`}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{f.label}</div>
                <div className={`text-xl font-semibold mt-1 ${f.k === "vencido" && itens.length ? "text-destructive" : ""}`}>{brl(itens.reduce((s, c) => s + c.valor, 0))}</div>
                <div className="text-xs text-muted-foreground">{num(itens.length)} contas</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Lista priorizada {faixa && `· ${FAIXAS.find((f) => f.k === faixa)!.label}`}</CardTitle></CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto">
            {q.isLoading ? <Skeleton className="h-60 w-full" /> : lista.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta em aberto.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left"><tr><th className="py-1">Vencimento</th><th>Fornecedor</th><th>Categoria</th><th className="text-right">Valor</th></tr></thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className={`border-t border-border ${c.dias < 0 ? "text-destructive bg-destructive/5" : ""}`}>
                      <td className="py-1.5 whitespace-nowrap pr-2">{fmt(c.venc)}<div className="text-[10px]">{c.dias < 0 ? `${-c.dias} dias atrás` : c.dias === 0 ? "hoje" : `em ${c.dias} dias`}</div></td>
                      <td className="pr-2">{c.fornecedor}</td>
                      <td className="pr-2 text-muted-foreground">{c.categoria}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{brl(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="capitalize">{mesCal.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</CardTitle>
            <div className="flex gap-1">
              <Button size="icon" variant="outline" onClick={() => setMesCal(new Date(ano, mes - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" onClick={() => setMesCal(new Date(ano, mes + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => <div key={d} className="text-center text-muted-foreground py-1">{d}</div>)}
              {celulas.map((d, i) => {
                if (!d) return <div key={i} />;
                const v = porDia.get(iso(d));
                const passado = new Date(ano, mes, d) < hoje;
                return (
                  <div key={i} className={`min-h-16 rounded-md border border-border p-1 ${v ? (passado ? "bg-destructive/15" : "bg-primary/10") : ""}`}>
                    <div className="text-muted-foreground">{d}</div>
                    {v ? <div className={`font-medium tabular-nums text-[11px] ${passado ? "text-destructive" : ""}`}>{brl(v)}</div> : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
