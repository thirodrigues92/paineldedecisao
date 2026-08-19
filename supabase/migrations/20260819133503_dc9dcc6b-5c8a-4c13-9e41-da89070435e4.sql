-- 1. Resolver o problema de GRANTs que impede a visualização no front-end
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_recebimento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_categoria TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_centro_custo TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_procedimento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_agendamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_invoice_header TO authenticated;
GRANT SELECT ON public.lab_vw_faturado_x_recebido TO authenticated;

-- 2. Garantir permissões para a service_role (usada pela Edge Function)
GRANT ALL ON public.lab_faturamento TO service_role;
GRANT ALL ON public.lab_recebimento TO service_role;
GRANT ALL ON public.lab_sync_log TO service_role;
GRANT ALL ON public.lab_dim_categoria TO service_role;
GRANT ALL ON public.lab_dim_centro_custo TO service_role;
GRANT ALL ON public.lab_dim_procedimento TO service_role;
GRANT ALL ON public.lab_dim_agendamento TO service_role;
GRANT ALL ON public.lab_invoice_header TO service_role;

-- 3. Corrigir/Adicionar Policies de RLS para liberar leitura
ALTER TABLE public.lab_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_recebimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_centro_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_procedimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_agendamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_invoice_header ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to lab_faturamento" ON public.lab_faturamento;
CREATE POLICY "Allow authenticated full access to lab_faturamento" ON public.lab_faturamento FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to lab_recebimento" ON public.lab_recebimento;
CREATE POLICY "Allow authenticated full access to lab_recebimento" ON public.lab_recebimento FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to lab_sync_log" ON public.lab_sync_log;
CREATE POLICY "Allow authenticated full access to lab_sync_log" ON public.lab_sync_log FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to lab_dim_procedimento" ON public.lab_dim_procedimento;
CREATE POLICY "Allow authenticated full access to lab_dim_procedimento" ON public.lab_dim_procedimento FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to lab_dim_agendamento" ON public.lab_dim_agendamento;
CREATE POLICY "Allow authenticated full access to lab_dim_agendamento" ON public.lab_dim_agendamento FOR ALL TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated full access to lab_invoice_header" ON public.lab_invoice_header;
CREATE POLICY "Allow authenticated full access to lab_invoice_header" ON public.lab_invoice_header FOR ALL TO authenticated USING (true);
