ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS procedimento_id integer,
  ADD COLUMN IF NOT EXISTS descricao_item text;
CREATE INDEX IF NOT EXISTS idx_fin_proc ON public.financeiro_lancamentos (procedimento_id);