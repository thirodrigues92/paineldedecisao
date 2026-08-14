ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS tabela_id integer,
  ADD COLUMN IF NOT EXISTS qtd_procedimentos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS procedimentos_detalhe jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS valor_origem text;

CREATE INDEX IF NOT EXISTS idx_agendamentos_valor_origem ON public.agendamentos (valor_origem);