ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS duracao_min integer NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_ag_duracao ON public.agendamentos(duracao_min);