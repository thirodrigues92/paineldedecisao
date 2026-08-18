ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS tipo_transacao char(1);
COMMENT ON COLUMN public.lab_faturamento.tipo_transacao IS 'C = Crédito (Receita), D = Débito (Despesa), T = Transferência';

GRANT ALL ON public.lab_faturamento TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento TO authenticated;
