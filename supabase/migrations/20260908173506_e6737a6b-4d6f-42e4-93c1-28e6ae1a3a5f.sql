CREATE INDEX IF NOT EXISTS idx_lab_producao_data_execucao ON public.lab_producao_feegow (data_execucao);
CREATE INDEX IF NOT EXISTS idx_lab_producao_data_id ON public.lab_producao_feegow (data_execucao, id);
CREATE INDEX IF NOT EXISTS idx_lab_producao_unidade ON public.lab_producao_feegow (unidade_id);
CREATE INDEX IF NOT EXISTS idx_lab_producao_profissional ON public.lab_producao_feegow (profissional_id);
ANALYZE public.lab_producao_feegow;