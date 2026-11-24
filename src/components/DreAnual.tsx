import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { setIA } from "@/lib/ia-assistente-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeDrePeople } from "@/lib/dre-person.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DreItemDrawer, type ItemTarget } from "@/components/DreItemDrawer";
import { fetchDreAccounts, fetchItemDre } from "@/lib/dre-items-client";
import { annual, buildDreTree, DRE_MONTHS, flattenTree, revenuePercent, type ItemRegime, type TreeRow } from "@/lib/dre-tree";
import { brl, pct } from "@/lib/format";
import { DreChartControls, DreChartPanel } from "@/components/DreChartPanel";
import { latestDreMonth } from "@/lib/dre-chart-data";
import { DreMonthComparison } from "@/components/DreMonthComparison";

export function DreAnual() {
  const completePeople = useServerFn(completeDrePeople);
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const admin = useQuery({ queryKey: ["dre-complete-names-admin"], queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    return !error && data === true;
  } });
  const completeNames = async () => {
    setCompleting(true); setCompletionMessage("");
    let processed = 0, failures = 0;
    try {
      while (true) {
        const result = await completePeople();
        processed += result.processados; failures += result.falhas;
        setCompletionMessage(`${processed.toLocaleString("pt-BR")} contas consultadas · ${result.pendentes.toLocaleString("pt-BR")} pendentes · ${failures} falhas`);
        if (result.pendentes === 0) break;
        if (result.processados === 0) throw new Error("Sem progresso");
      }
    } catch { setCompletionMessage(`Preenchimento interrompido após ${processed.toLocaleString("pt-BR")} contas; tente novamente para continuar.`); }
    finally { await queryClient.invalidateQueries({ queryKey: ["dre-items-drawer"] }); setCompleting(false); }
  };
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [regime, setRegime] = useState<ItemRegime>("pagamento");
  const [unit, setUnit] = useState("all");
  useEffect(() => { setIA({ dreFiltros: { ano: year, regime, unidade: unit } }); return () => setIA({ dreFiltros: null }); }, [year, regime, unit]);
  const [focusMonth, setFocusMonth] = useState<number | null | undefined>(undefined);
  const [operational, setOperational] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<ItemTarget | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const lookup = useQuery({ queryKey: ["dre-accounts-units"], queryFn: fetchDreAccounts });
  const q = useQuery({ queryKey: ["dre-item-year", year, regime, unit], queryFn: () => fetchItemDre(year, regime, unit) });
  const tree = useMemo(() => buildDreTree(q.data ?? [], lookup.data?.accounts ?? []), [q.data, lookup.data]);
  const month = focusMonth === undefined ? latestDreMonth(tree) : focusMonth;
  const previousData = queryClient.getQueryData<Parameters<typeof buildDreTree>[0]>(["dre-item-year", year - 1, regime, unit]);
  const previousTree = previousData ? buildDreTree(previousData, lookup.data?.accounts ?? []) : undefined;
  const revenueRow = tree.find(r => r.total === "receitas");
  const revenue = revenueRow ? annual(revenueRow) : 0;
  const reset = () => { setTarget(null); setExpanded(new Set()); setFocusMonth(undefined); };
  const toggle = (id: string) => setExpanded(old => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const exportExcel = async () => {
    setExporting(true); setExportError(false);
    try {
      const XLSX = await import("xlsx");
      const rows = flattenTree(tree).map(({ row: r, depth }) => ({ Linha: `${"  ".repeat(depth)}${r.name}`, Nível: depth + 1, ...Object.fromEntries(DRE_MONTHS.map((m, i) => [m, r.months[i]])), Total: annual(r), "% da receita": revenuePercent(annual(r), revenue) === null ? null : Number(revenuePercent(annual(r), revenue)) / 100 }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 55 }, { wch: 8 }, ...Array.from({ length: 13 }, () => ({ wch: 18 })), { wch: 16 }];
      for (let r = 1; r <= rows.length; r++) for (let c = 2; c < 16; c++) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell) cell.z = c === 15 ? "0.00%" : '#,##0.00;[Red]-#,##0.00'; }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "DRE");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Ano: year, Regime: regime === "pagamento" ? "Pagamento" : "Competência", Unidade: unit === "all" ? "Todas as unidades" : lookup.data?.units.find(u => String(u.unidade_id) === unit)?.nome_fantasia ?? unit, Origem: "Feegow — itens de contas", Observação: "Linhas filhas detalham as linhas superiores; não somar todos os níveis." }]), "Filtros");
      XLSX.writeFile(workbook, `DRE-${year}-${regime}.xlsx`);
    } catch { setExportError(true); } finally { setExporting(false); }
  };
  const renderRows = (rows: TreeRow[], depth = 0): ReactNode => rows.map(r => {
    const total = annual(r);
    const isWarning = r.name.includes("SEM CATEGORIA") && r.months.some(v => v !== 0);
    const positive = r.total === "receitas" || (r.total !== "despesas" && total >= 0);
    const tone = isWarning ? "dre-row-warning" : r.total ? positive ? "dre-row-positive" : "dre-row-negative" : "";
    const percent = revenuePercent(total, revenue);
    return <FragmentRow key={r.id} row={r} depth={depth} expanded={expanded.has(r.id)} tone={tone} total={total} percent={percent} onToggle={() => toggle(r.id)} onValue={month => setTarget({ row: r, month })}>
      {expanded.has(r.id) ? renderRows(r.children, depth + 1) : null}
    </FragmentRow>;
  });
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">DRE</h1><p className="mt-1 text-sm text-muted-foreground">Demonstrativo de resultado · {year}</p></div><Button onClick={exportExcel} disabled={exporting || q.isPending || q.isError || lookup.isPending || lookup.isError}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar Excel</Button></header>
    <div className="flex flex-wrap items-end gap-5 border-y py-4">
      <div className="space-y-2"><label className="text-xs font-medium text-muted-foreground">Ano</label><Select value={String(year)} onValueChange={v => { setYear(Number(v)); reset(); }}><SelectTrigger aria-label="Ano da DRE" className="w-28"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 10 }, (_, i) => currentYear + 1 - i).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><div className="text-xs font-medium text-muted-foreground">Regime</div><ToggleGroup type="single" value={regime} onValueChange={v => { if (v === "pagamento" || v === "competencia") { setRegime(v); reset(); } }} variant="outline"><ToggleGroupItem value="pagamento">Pagamento</ToggleGroupItem><ToggleGroupItem value="competencia">Competência</ToggleGroupItem></ToggleGroup></div>
      <div className="min-w-0 space-y-2"><label className="text-xs font-medium text-muted-foreground">Unidade</label><Select value={unit} onValueChange={v => { setUnit(v); reset(); }}><SelectTrigger aria-label="Unidade da DRE" className="w-64 max-w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as unidades</SelectItem><SelectItem value="0">Sem unidade na origem</SelectItem>{lookup.data?.units.filter(u => u.unidade_id !== 0).map(u => <SelectItem key={u.unidade_id} value={String(u.unidade_id)}>{u.nome_fantasia}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {admin.data && <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={completing} onClick={completeNames}>{completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {completing ? "Completando nomes…" : "Completar nomes"}</Button>{completionMessage && <p role="status" className="text-sm text-muted-foreground">{completionMessage}</p>}</div>}
    {exportError && <p role="alert" className="text-sm text-destructive">Não foi possível exportar o Excel. Tente novamente.</p>}
    {q.isPending || lookup.isPending ? <Skeleton className="h-96 w-full" /> : q.isError || lookup.isError ? <div role="alert" className="space-y-3 text-destructive"><p>Não foi possível carregar a DRE.</p><Button variant="outline" onClick={() => { q.refetch(); lookup.refetch(); }}>Tentar novamente</Button></div> : <>
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Sem itens no período e unidade selecionados.</p>}
      <div className="dre-annual-scroll overflow-x-auto rounded-md border"><table className="w-full min-w-[1900px] text-xs"><thead><tr className="border-b bg-muted text-muted-foreground"><th className="sticky left-0 z-20 min-w-72 bg-muted px-3 py-4 text-left">Plano de Contas</th>{DRE_MONTHS.map(m => <th key={m} className="min-w-28 px-2 text-right">{m}</th>)}<th className="min-w-32 px-3 text-right">Total</th><th className="min-w-28 px-3 text-right">% da receita</th></tr></thead><tbody>{renderRows(tree)}</tbody></table></div>
      <div className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Análise gráfica</h2>
        <div className="flex flex-wrap items-end gap-5"><DreChartControls month={month} onMonth={setFocusMonth} operational={operational} onOperational={setOperational} /></div>
      </div>
      <DreChartPanel tree={tree} {...(previousTree ? { previousTree } : {})} month={month} onMonth={setFocusMonth} operational={operational} onTarget={setTarget} year={year} />
      <DreMonthComparison key={`${year}-${regime}-${unit}`} tree={tree} accounts={lookup.data?.accounts ?? []} year={year} month={month} regime={regime} unit={unit} operational={operational} />
    </>}
    <DreItemDrawer key={`${target?.row.id}-${target?.month}-${year}-${regime}-${unit}`} target={target} year={year} regime={regime} unit={unit} onClose={() => setTarget(null)} />
  </div>;
}
function FragmentRow({ row: r, depth, expanded, tone, total, percent, onToggle, onValue, children }: { row: TreeRow; depth: number; expanded: boolean; tone: string; total: number; percent: number | null; onToggle: () => void; onValue: (month: number | null) => void; children: ReactNode }) {
  return <Fragment><tr className={`border-b ${tone} ${r.total ? "font-semibold" : ""}`}><td className="dre-name-cell sticky left-0 z-10 max-w-96 bg-background px-3 py-2"><div className={`flex min-h-7 items-center gap-1 ${depth === 0 ? "" : depth === 1 ? "pl-4" : depth === 2 ? "pl-8" : depth === 3 ? "pl-12" : "pl-16"}`}>
    {r.children.length > 0 ? <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`${expanded ? "Recolher" : "Expandir"} ${r.name}`} onClick={onToggle}>{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</Button> : <span className="w-7 shrink-0" />}<span className="break-words">{r.name}</span></div></td>
    {r.months.map((v, i) => <td key={i} className="px-1 text-right tabular-nums"><Button variant="ghost" className={`h-9 w-full justify-end whitespace-nowrap px-1 text-xs ${v < 0 ? "text-destructive" : ""}`} aria-label={`${r.name}, ${DRE_MONTHS[i]}, ${brl(v)}`} onClick={() => onValue(i + 1)}>{brl(v)}</Button></td>)}<td className="px-2 text-right tabular-nums"><Button variant="ghost" className="h-9 w-full justify-end whitespace-nowrap px-1 text-xs font-semibold" aria-label={`${r.name}, Total, ${brl(total)}`} onClick={() => onValue(null)}>{brl(total)}</Button></td><td className="px-3 text-right tabular-nums">{percent === null ? "—" : pct(percent)}</td></tr>{children}</Fragment>;
}
