/** Edge deployment packages only the functions directory; keep source ID parsing here. */
export function feegowIntegerId(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 && id <= 2147483647 ? id : null;
}

export type PlanoConta = {
  id: number; nome: string; tipo: "income" | "expense"; posicao: string | null;
  parent_id: number | null; nivel: number; atualizado_em: string; payload_raw: Record<string, unknown>;
};

export function mapPlanoContas(rows: Record<string, unknown>[], atualizado_em: string): PlanoConta[] {
  return rows.flatMap((r) => {
    const id = feegowIntegerId(r.id);
    if (id === null || (r.type !== "income" && r.type !== "expense")) return [];
    const posicao = String(r.position ?? "").trim() || null;
    return [{ id, nome: String(r.name ?? "").trim(), tipo: r.type,
      posicao, parent_id: feegowIntegerId(r.parentId), nivel: posicao ? posicao.split(".").length : 0,
      atualizado_em, payload_raw: r }];
  });
}

export async function collectPlanoContas(fetchPage: (page: number, perPage: number) => Promise<{ data: Record<string, unknown>[]; pages: number }>) {
  const rows: Record<string, unknown>[] = [];
  let pages = 1;
  for (let page = 1; page <= pages; page++) {
    const result = await fetchPage(page, 1000);
    if (!Array.isArray(result.data) || !Number.isInteger(result.pages) || result.pages < page) {
      throw new Error("Paginação inválida do plano de contas Feegow");
    }
    pages = result.pages;
    rows.push(...result.data);
  }
  return [...new Map(mapPlanoContas(rows, new Date().toISOString()).map(r => [r.id, r])).values()];
}