import { syncInvoiceItems } from "../../supabase/functions/sync-feegow/fin-itens.ts";

export async function syncFinItens(from: string, to: string) {
  const token = process.env['FEEGOW_API_TOKEN'];
  if (!token) throw new Error("Token Feegow não configurado");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return syncInvoiceItems(supabaseAdmin, token, from, to);
}