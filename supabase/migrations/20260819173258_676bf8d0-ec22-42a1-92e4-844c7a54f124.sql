ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS prontuario TEXT;
ALTER TABLE public.lab_producao_feegow ADD COLUMN IF NOT EXISTS prontuario TEXT;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS prontuario TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_producao_feegow TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento TO authenticated;
GRANT ALL ON public.pacientes TO service_role;
GRANT ALL ON public.lab_producao_feegow TO service_role;
GRANT ALL ON public.lab_faturamento TO service_role;