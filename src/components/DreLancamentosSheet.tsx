import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { brl, num } from "@/lib/format";
import { fetchLancamentosGrupo, FIXAS, type Regime } from "@/lib/dre";

export type DreDrawerAlvo = {
  grupo: string; titulo: string; from: string; to: string;
  cmpFrom?: string; cmpTo?: string;
} | null;

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function Coluna({ titulo, grupo, from, to, regime }: { titulo: string; grupo: string; from: string; to: string; regime: Regime }) {
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["dre-lanc", grupo, from, to, regime],
    queryFn: () => fetchLancamentosGrupo(grupo, from, to, regime),
  });
  const rows = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const all = q.data ?? [];
    return b ? all.filter((r) => `${r.descricao} ${r.categoria} ${fmt(r.data)} ${r.valor}`.toLowerCase().includes(b)) : all;
  }, [q.data, busca]);
  const total = rows.reduce((s, r) => s + r.valor, 0);

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <div className="text-sm font-semibold">{titulo}</div>
        <div className="text-xs text-muted-foreground">{fmt(from)} a {fmt(to)}</div>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar lançamento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="text-sm text-muted-foreground">{num(rows.length)} lançamentos · <b className="text-foreground">{brl(total)}</b>{(q.data?.length ?? 0) >= 1000 && " (1.000 maiores)"}</div>
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
  );
}

export function DreLancamentosSheet({ alvo, regime, onClose }: { alvo: DreDrawerAlvo; regime: Regime; onClose: () => void }) {
  const dupla = !!(alvo?.cmpFrom && alvo?.cmpTo);
  return (
    <Sheet open={!!alvo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className={`w-full overflow-y-auto ${dupla ? "sm:max-w-5xl" : "sm:max-w-lg"}`}>
        <SheetHeader>
          <SheetTitle>{alvo?.titulo}</SheetTitle>
          <SheetDescription>
            {regime === "caixa" ? "Caixa" : "Competência"}
            {alvo?.grupo === FIXAS && " · despesas fixas"}
          </SheetDescription>
        </SheetHeader>
        {alvo && (
          <div className={`mt-4 grid gap-6 ${dupla ? "md:grid-cols-2 md:divide-x md:divide-border" : ""}`}>
            <Coluna key={`a-${alvo.grupo}-${alvo.from}`} titulo="Período selecionado" grupo={alvo.grupo} from={alvo.from} to={alvo.to} regime={regime} />
            {dupla && (
              <div className="md:pl-6 min-w-0">
                <Coluna key={`b-${alvo.grupo}-${alvo.cmpFrom}`} titulo="Período de comparação" grupo={alvo.grupo} from={alvo.cmpFrom!} to={alvo.cmpTo!} regime={regime} />
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
