-- Garantir permissões para o front-end em todas as tabelas do Lab
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_producao_feegow TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_agendamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_procedimento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_invoice_header TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_recebimento TO authenticated;

GRANT ALL ON public.lab_faturamento TO service_role;
GRANT ALL ON public.lab_producao_feegow TO service_role;
GRANT ALL ON public.lab_dim_agendamento TO service_role;
GRANT ALL ON public.lab_dim_procedimento TO service_role;
GRANT ALL ON public.lab_sync_log TO service_role;
GRANT ALL ON public.lab_invoice_header TO service_role;
GRANT ALL ON public.lab_recebimento TO service_role;

-- Limpar dados com data nula para forçar re-sync correto
DELETE FROM public.lab_producao_feegow WHERE data_execucao IS NULL;
