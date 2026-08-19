import { createFileRoute } from '@tanstack/react-router'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

export const Route = createFileRoute('/api/public/lab-reset')({
  server: {
    handlers: {
      GET: async () => {
        try {
          // Limpando usando filtros baseados nas PKs reais descobertas em migrações anteriores
          const res1 = await supabaseAdmin.from("lab_faturamento").delete().neq("item_id", -1);
          const res2 = await supabaseAdmin.from("lab_recebimento").delete().neq("pagamento_id", -1);
          const res3 = await supabaseAdmin.from("lab_invoice_header").delete().neq("invoice_id", -1);
          const res4 = await supabaseAdmin.from("lab_dim_agendamento").delete().neq("agendamento_id", -1);
          const res5 = await supabaseAdmin.from("lab_sync_log").delete().neq("id", '00000000-0000-0000-0000-000000000000' as any);
          
          return new Response(JSON.stringify({ 
            ok: true, 
            message: "Dados limpos",
            results: {
              faturamento: res1.status,
              recebimento: res2.status,
              header: res3.status,
              agenda: res4.status,
              log: res5.status
            }
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
})
