import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { itemContribution, type ItemRegime, type Scope, type Summary } from "./dre-tree";
export type DrawerItem = Database["public"]["Views"]["vw_dre_itens_tela"]["Row"] & { contribution: number };
export async function fetchItemDre(year: number, regime: ItemRegime, unit: string): Promise<Summary[]> {
  const rows: Summary[] = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await supabase.rpc("fn_dre_tela", { p_ano: year, p_regime: regime, ...(unit !== "all" ? { p_unidade: Number(unit) } : {}) }).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}
export async function fetchDreAccounts() {
  const [accounts, units] = await Promise.all([supabase.from("fin_plano_contas").select("id,nome,posicao,parent_id").order("id"), supabase.from("unidades").select("unidade_id,nome_fantasia").order("nome_fantasia")]);
  if (accounts.error) throw accounts.error;
  if (units.error) throw units.error;
  return { accounts: accounts.data ?? [], units: units.data ?? [] };
}
export async function fetchDreItems(year: number, regime: ItemRegime, unit: string, scope: Scope, month: number | null): Promise<DrawerItem[]> {
  const dateCol = regime === "pagamento" ? "data_pagamento" : "data_competencia";
  const start = `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
  const end = month === null || month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const rows: DrawerItem[] = [];
  for (let offset = 0;; offset += 1000) {
    let q = supabase.from("vw_dre_itens_tela").select("*").gte(dateCol, start).lt(dateCol, end).order(dateCol).order("item_id").range(offset, offset + 999);
    if (unit !== "all") q = q.eq("unidade_id", Number(unit));
    if (scope.group) q = q.eq("grupo_chave", scope.group);
    if (scope.categories?.length) q = q.in("categoria_id", scope.categories);
    if (scope.procedure) q = q.eq("procedimento_grupo", scope.procedure);
    if (scope.total === "receitas") q = q.eq("tipo_transacao", "C");
    if (scope.total === "despesas") q = q.eq("tipo_transacao", "D");
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []).map(i => ({ ...i, contribution: itemContribution(i, scope) })));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}