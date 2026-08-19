-- Adicionar colunas de fallback caso o enriquecimento falhe ou agendamento não exista
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS paciente_nome text;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS procedimento_nome text;

-- Garantir que o front-end pode ler essas novas colunas
GRANT SELECT ON public.lab_faturamento TO authenticated;
