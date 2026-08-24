ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS hora_inicio_real time without time zone,
  ADD COLUMN IF NOT EXISTS hora_fim_real time without time zone,
  ADD COLUMN IF NOT EXISTS tempo_permanencia_min integer;