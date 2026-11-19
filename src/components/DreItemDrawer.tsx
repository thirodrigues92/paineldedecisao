import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchDreItems } from "@/lib/dre-items-client";
import { DRE_MONTHS, type ItemRegime, type TreeRow } from "@/lib/dre-tree";
import { brl } from "@/lib/format";
export type ItemTarget = { row: TreeRow; month: number | null };
export function DreItemDrawer({ target, year, regime, unit, onClose }: { target: ItemTarget | null; year: number; regime: ItemRegime; unit: string; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(100);
  const q = useQuery({ queryKey: ["dre-items-drawer", year, regime, unit, target?.row.id, target?.month], enabled: target !== null, queryFn: () => target ? fetchDreItems(year, regime, unit, target.row.scope, target.month) : Promise.resolve([]) });
  const filtered = useMemo(() => {
    const needle = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return (q.data ?? []).filter(i => `${i.pessoa_nome ?? ""} ${i.categoria_nome ?? ""} ${i.descricao ?? ""} ${i.item_id ?? ""} ${i.data_pagamento ?? ""} ${i.data_competencia ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(needle));
  }, [search, q.data]);
  return <Sheet open={target !== null} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-5xl">
      <SheetHeader><SheetTitle>{target?.row.name}</SheetTitle><SheetDescription>{target?.month ? DRE_MONTHS[target.month - 1] : "Jan–Dez"} / {year} · {regime === "pagamento" ? "Pagamento" : "Competência"}</SheetDescription></SheetHeader>
      <div className="mt-6 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Pesquisar itens da DRE" className="pl-9" placeholder="Pesquisar fornecedor, paciente, categoria ou descrição" value={search} onChange={e => { setSearch(e.target.value); setLimit(100); }} /></div>
        {q.isPending ? <Skeleton className="h-48" /> : q.isError ? <div className="text-destructive">Não foi possível carregar os itens. <Button variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button></div> : <>
          <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>{filtered.length.toLocaleString("pt-BR")} itens</span><span className="font-semibold text-foreground">{brl(filtered.reduce((s, i) => s + i.contribution, 0))}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-3 pr-3">Data</th><th className="pr-3">Fornecedor / Paciente</th><th className="pr-3">Categoria</th><th className="pr-3">Descrição</th><th className="text-right">Valor</th></tr></thead><tbody>
            {filtered.slice(0, limit).map(i => <tr key={i.item_id} className="border-b"><td className="whitespace-nowrap py-3 pr-3 align-top">{(regime === "pagamento" ? i.data_pagamento : i.data_competencia)?.split("-").reverse().join("/") ?? "—"}</td><td className="max-w-48 pr-3 align-top">{i.pessoa_nome ?? (i.grupo_linha?.toUpperCase() === "REPASSES" && /^(dr\.?|dra\.?|doutor|doutora)\s/i.test(i.categoria_nome ?? "") ? i.categoria_nome : "Não informado na origem")}</td><td className="max-w-48 pr-3 align-top">{i.categoria_nome ?? "SEM CATEGORIA"}</td><td className="max-w-72 pr-3 align-top"><div>{i.descricao}</div><div className="mt-1 text-xs text-muted-foreground">Item {i.item_id} · Conta {i.invoice_id ?? "—"}</div></td><td className={`whitespace-nowrap text-right align-top tabular-nums ${i.contribution < 0 ? "text-destructive" : ""}`}>{brl(i.contribution)}</td></tr>)}
          </tbody></table></div>
          {filtered.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum item encontrado.</p>}
          {filtered.length > limit && <Button variant="outline" onClick={() => setLimit(v => v + 100)}>Carregar mais itens</Button>}
        </>}
      </div>
    </SheetContent>
  </Sheet>;
}