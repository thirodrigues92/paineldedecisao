import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const syncReceitaFinanceiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Somente administradores podem sincronizar receitas");
    if (data.to < data.from || (Date.parse(data.to) - Date.parse(data.from)) > 32 * 86400000) throw new Error("Sincronize até um mês por vez");
    const { syncReceitaBaixada } = await import("./financeiro-receita.server");
    return syncReceitaBaixada(data.from, data.to);
  });