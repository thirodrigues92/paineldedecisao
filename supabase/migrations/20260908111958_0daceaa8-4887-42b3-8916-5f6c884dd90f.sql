CREATE TABLE public.lab_sync_lock (
  id text PRIMARY KEY,
  running boolean NOT NULL DEFAULT false,
  lease_until timestamptz,
  paused boolean NOT NULL DEFAULT false,
  pause_reason text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lab_sync_lock TO authenticated;
GRANT ALL ON public.lab_sync_lock TO service_role;
ALTER TABLE public.lab_sync_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_sync_lock_read" ON public.lab_sync_lock FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_lab_sync_lock_upd BEFORE UPDATE ON public.lab_sync_lock
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lab_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  tentativas integer NOT NULL DEFAULT 0,
  registros integer NOT NULL DEFAULT 0,
  erro text,
  processado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lab_backfill_status ON public.lab_backfill_jobs (status, data_inicio);
CREATE UNIQUE INDEX idx_lab_backfill_uniq ON public.lab_backfill_jobs (batch_id, data_inicio, data_fim);

GRANT SELECT ON public.lab_backfill_jobs TO authenticated;
GRANT ALL ON public.lab_backfill_jobs TO service_role;
ALTER TABLE public.lab_backfill_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_backfill_read" ON public.lab_backfill_jobs FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_lab_backfill_upd BEFORE UPDATE ON public.lab_backfill_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.lab_sync_lock (id) VALUES ('auto_sync') ON CONFLICT DO NOTHING;
INSERT INTO public.lab_sync_lock (id) VALUES ('backfill') ON CONFLICT DO NOTHING;