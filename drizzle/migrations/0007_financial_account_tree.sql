CREATE TABLE public.fin_plano_contas (id bigint PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL CHECK (tipo IN ('income','expense')), posicao text, parent_id bigint, nivel int NOT NULL DEFAULT 0, atualizado_em timestamptz NOT NULL DEFAULT now(), payload_raw jsonb NOT NULL DEFAULT '{}'::jsonb);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_plano_contas TO authenticated;
GRANT ALL ON public.fin_plano_contas TO service_role;
ALTER TABLE public.fin_plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_plano_contas_read ON public.fin_plano_contas FOR SELECT TO authenticated USING (true);
CREATE POLICY fin_plano_contas_admin ON public.fin_plano_contas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX fin_plano_contas_posicao_idx ON public.fin_plano_contas(posicao);
CREATE VIEW public.vw_plano_contas_dre WITH (security_invoker=true) AS
WITH categorias AS (
 SELECT id AS categoria_id, nome AS categoria_nome, posicao, tipo,
 CASE WHEN posicao IS NULL THEN NULL WHEN array_length(string_to_array(posicao,'.'),1)=1 THEN posicao ELSE split_part(posicao,'.',1)||'.'||split_part(posicao,'.',2) END AS grupo_dre_posicao,
 CASE WHEN split_part(posicao,'.',2) ~ '^[0-9]+$' THEN split_part(posicao,'.',2)::numeric ELSE NULL END AS ordem_dre
 FROM public.fin_plano_contas
)
SELECT c.*, g.nome AS grupo_dre_nome FROM categorias c
LEFT JOIN LATERAL (SELECT p.nome FROM public.fin_plano_contas p WHERE p.posicao=c.grupo_dre_posicao AND p.tipo=c.tipo ORDER BY p.id LIMIT 1) g ON true;
GRANT SELECT ON public.vw_plano_contas_dre TO authenticated, service_role;