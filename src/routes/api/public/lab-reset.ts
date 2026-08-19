import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const Route = createFileRoute('/api/public/lab-reset')({
  server: {
    handlers: {
      GET: async () => {
        const tables = [
          "lab_faturamento",
          "lab_recebimento",
          "lab_invoice_header",
          "lab_dim_agendamento",
          "lab_sync_log"
        ];
        
        const results: any = {};
        for (const table of tables) {
          const { error } = await supabaseAdmin.from(table).delete().neq("id", -1);
          results[table] = error ? error.message : "limpo";
        }
        
        return new Response(JSON.stringify({ ok: true, results }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
})
