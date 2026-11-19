import { collectPlanoContas } from "./feegow-plano-contas";

export async function syncPlanoContas(token: string) {
  const rows = await collectPlanoContas(async (page, perPage) => {
    const res = await fetch("https://api.feegow.com/v1/api/core/financial/base/financial-category", {
      method: "POST", headers: { "x-access-token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ page, perPage }), signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`Plano de contas Feegow HTTP ${res.status}`);
    return res.json();
  });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from("fin_plano_contas").upsert(rows.slice(i, i + 500) as any, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}