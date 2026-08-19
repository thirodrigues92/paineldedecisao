GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
DELETE FROM public.lab_producao_feegow WHERE data_execucao IS NULL;
DELETE FROM public.lab_faturamento WHERE data_competencia IS NULL AND data_atendimento IS NULL;