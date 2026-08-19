import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const labResetData = createServerFn({ method: "POST" }).handler(async () => {
  console.log("Reiniciando dados do Lab do zero...");
  
  const tables = [
    "lab_faturamento",
    "lab_recebimento",
    "lab_invoice_header",
    "lab_dim_agendamento",
    "lab_sync_log"
  ];
  
  const results: Record<string, any> = {};
  
  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete().neq("id", -1);
    results[table] = error ? error.message : "limpo";
  }
  
  return { ok: true, results };
});
