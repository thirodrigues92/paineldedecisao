import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num } from "@/lib/format";
import { fetchLancamentosGrupo, FIXAS, type Regime } from "@/lib/dre";

export type DreDrawerAlvo = { grupo: string; titulo: string; from: string; to: string } | null;

export function DreLancamentosSheet({ alvo, regime, onClose }: { alvo: DreDrawerAlvo; regime: Regime; onClose: () => void }) {
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["dre-lanc", alvo?.grupo, alvo?.from, alvo?.to, regime],
    queryFn: () => fetchLancamentosGrupo(alvo!.grupo, alvo!.from, alvo!.to, regime),
    enabled: !!alvo,
  });
  const rows = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const all = q.data ?? [];
    return b ? all.filter((r) => `${r.descricao} ${r.categoria} ${r.data} ${r.valor}`.toLowerCase().includes(b)) : all;
  }, [q.data, busca]);
  const total = rows.reduce((s, r) => s + r.valor, 0);
  const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

  return (
    <Sheet open={!!alvo} onOpenChange={(o) => { if (!o) { setBusca(""); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{alvo?.titulo}</SheetTitle>
          <SheetDescription>
            {alvo && `${fmt(alvo.from)} a ${fmt(alvo.to)} · ${regime === "caixa" ? "Caixa" : "Competência"}`}
            {alvo?.grupo === FIXAS && " · despesas fixas"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <Input placeholder="Buscar lançamento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="text-sm text-muted-foreground">{num(rows.length)} lançamentos · <b className="text-foreground">{brl(total)}</b>{(q.data?.length ?? 0) >= 1000 && " (mostrando os 1.000 maiores)"}</div>
          {q.isLoading ? <Skeleton className="h-40 w-full" /> : q.isError ? (
            <p className="text-sm text-destructive">Não foi possível carregar os lançamentos.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r, i) => (
                <li key={i} className="py-2 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.descricao}</div>
                    <div className="text-xs text-muted-foreground">{fmt(r.data)} · {r.categoria}</div>
                  </div>
                  <div className="tabular-nums shrink-0">{brl(r.valor)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
