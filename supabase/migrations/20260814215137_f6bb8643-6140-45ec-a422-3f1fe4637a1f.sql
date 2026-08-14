ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS agendamento_id bigint;

CREATE INDEX IF NOT EXISTS idx_fin_agendamento_id
  ON public.financeiro_lancamentos (agendamento_id);