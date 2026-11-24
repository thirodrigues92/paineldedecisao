import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const completeDrePeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("Somente administradores podem completar nomes.");
    const token = process.env['FEEGOW_API_TOKEN'];
    if (!token) throw new Error("Token Feegow não configurado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { completeAccountPeople } = await import("../../supabase/functions/sync-feegow/conta-pessoa");
    return completeAccountPeople(supabaseAdmin, token);
  });