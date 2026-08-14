ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS valor_estimado numeric NOT NULL DEFAULT 0;