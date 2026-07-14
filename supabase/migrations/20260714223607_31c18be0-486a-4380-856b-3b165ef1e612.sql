-- Remover FKs de agendamentos e financeiro_lancamentos para tolerar
-- ingestão parcial das tabelas de referência (comportamento típico de BI).
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_convenio_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_especialidade_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_paciente_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_procedimento_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_profissional_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_status_id_fkey;
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_unidade_id_fkey;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid='public.financeiro_lancamentos'::regclass AND contype='f'
  LOOP
    EXECUTE format('ALTER TABLE public.financeiro_lancamentos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;