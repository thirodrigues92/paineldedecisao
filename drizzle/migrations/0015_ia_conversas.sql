CREATE TABLE public.ia_conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pergunta text NOT NULL,
  resposta text,
  ferramentas_usadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  duracao_ms integer,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ia_conversas TO authenticated;
GRANT ALL ON public.ia_conversas TO service_role;
ALTER TABLE public.ia_conversas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.ia_conversas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.ia_conversas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX ia_conversas_user_idx ON public.ia_conversas(user_id, criado_em DESC);