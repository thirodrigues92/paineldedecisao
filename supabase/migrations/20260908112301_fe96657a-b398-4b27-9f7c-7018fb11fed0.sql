CREATE TABLE public.lab_cron_token (
  id text PRIMARY KEY,
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.lab_cron_token TO service_role;
ALTER TABLE public.lab_cron_token ENABLE ROW LEVEL SECURITY;

INSERT INTO public.lab_cron_token (id) VALUES ('default') ON CONFLICT DO NOTHING;