CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS lab_producao_grupo_busca_idx ON public.lab_producao_feegow USING gin (public.lab_producao_texto(grupo_nome) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS lab_producao_profissional_busca_idx ON public.lab_producao_feegow USING gin (public.lab_producao_texto(profissional_nome) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS lab_producao_convenio_busca_idx ON public.lab_producao_feegow USING gin (public.lab_producao_texto(convenio_nome) extensions.gin_trgm_ops);