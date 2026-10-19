CREATE OR REPLACE FUNCTION public.dre_normalizar(s text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(btrim(translate(coalesce(s,''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')))
$$;

CREATE OR REPLACE FUNCTION public.dre_classificar(cat text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH n AS (SELECT public.dre_normalizar(cat) AS v)
  SELECT CASE
    WHEN v = '' OR v = 'nao classificado' THEN 'Não classificado'
    WHEN v LIKE 'outras receitas%' OR v LIKE 'outros creditos%' OR v LIKE 'rendimentos%' OR v LIKE 'medprev%' OR v LIKE 'iparv%' OR v LIKE 'devolucao consultas%' OR v LIKE 'devolucao exames%' THEN 'Revisar'
    WHEN v LIKE 'dr.%' OR v LIKE 'dra%' OR v LIKE 'dr %' OR v LIKE 'repasses%' OR v LIKE 'antecipa%' THEN 'Repasses médicos'
    WHEN v LIKE 'insumo%' OR v LIKE 'laboratorio%' OR v LIKE 'convenio farmacia%' THEN 'Insumos e apoio'
    WHEN v = 'iss' THEN 'Impostos'
    WHEN v LIKE 'salarios%' OR v = 'inss' OR v = 'fgts' OR v LIKE 'ferias%' OR v LIKE 'rescisao trabalhista%' OR v LIKE 'adiantamento salarial%' OR v LIKE 'vale%' OR v LIKE 'lote de horas%' OR v LIKE 'plano de saude%' OR v LIKE 'seguro vida colaboradores%' OR v LIKE 'bonificacao%' THEN 'Pessoal'
    WHEN v LIKE 'aluguel%' OR v LIKE 'condominio%' OR v = 'agua' OR v LIKE 'seguro instalacoes%' OR v LIKE 'manutencao%' THEN 'Ocupação'
    WHEN v LIKE 'marketing e publicidade%' OR v LIKE 'brindes%' OR v LIKE 'fundo de promocao%' THEN 'Marketing'
    WHEN v LIKE 'pro-labore%' OR v LIKE 'pro labore%' THEN 'Pró-labore'
    WHEN v LIKE 'ampliacao%' OR v LIKE 'mobiliario%' THEN 'Investimento'
    WHEN v LIKE 'distribuicao de lucros%' OR v LIKE 'integralizacao de capital%' THEN 'Distribuição a sócios'
    ELSE 'Administrativo e outras'
  END FROM n
$$;

CREATE OR REPLACE FUNCTION public.dre_tipo_grupo(g text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN g IN ('Repasses médicos','Insumos e apoio','Impostos') THEN 'variavel'
    WHEN g IN ('Investimento','Distribuição a sócios') THEN 'fora_operacional'
    WHEN g IN ('Revisar','Não classificado') THEN 'pendencia'
    ELSE 'fixa'
  END
$$;

CREATE TABLE public.dim_categoria_dre (
  categoria_origem text PRIMARY KEY,
  grupo_dre text NOT NULL,
  tipo text NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON public.dim_categoria_dre TO authenticated;
GRANT ALL ON public.dim_categoria_dre TO service_role;
ALTER TABLE public.dim_categoria_dre ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read dre" ON public.dim_categoria_dre FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert dre" ON public.dim_categoria_dre FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update dre" ON public.dim_categoria_dre FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.dim_categoria_dre (categoria_origem, grupo_dre, tipo)
SELECT c, public.dre_classificar(c), public.dre_tipo_grupo(public.dre_classificar(c))
FROM (SELECT DISTINCT coalesce(categoria, 'Não classificado') AS c FROM public.financeiro_lancamentos) s
ON CONFLICT DO NOTHING;

CREATE VIEW public.vw_dre_categorias WITH (security_invoker = true) AS
SELECT coalesce(l.categoria, 'Não classificado') AS categoria_origem,
       coalesce(d.grupo_dre, public.dre_classificar(l.categoria)) AS grupo_dre,
       coalesce(d.tipo, public.dre_tipo_grupo(public.dre_classificar(l.categoria))) AS tipo,
       count(*)::bigint AS qtd,
       coalesce(sum(l.valor),0)::numeric AS total
FROM public.financeiro_lancamentos l
LEFT JOIN public.dim_categoria_dre d ON d.categoria_origem = coalesce(l.categoria, 'Não classificado')
WHERE l.tipo = 'despesa'
GROUP BY 1,2,3;
GRANT SELECT ON public.vw_dre_categorias TO authenticated;

CREATE VIEW public.vw_dre_mensal WITH (security_invoker = true) AS
WITH receita AS (
  SELECT to_char(data_execucao,'YYYY-MM') AS mes, coalesce(sum(valor),0)::numeric AS valor
  FROM public.lab_producao_feegow WHERE situacao = 'Faturado' AND data_execucao IS NOT NULL GROUP BY 1
), desp AS (
  SELECT to_char(l.data_vencimento,'YYYY-MM') AS mes,
         coalesce(d.grupo_dre, public.dre_classificar(l.categoria)) AS grupo_dre,
         coalesce(d.tipo, public.dre_tipo_grupo(public.dre_classificar(l.categoria))) AS tipo,
         coalesce(sum(l.valor),0)::numeric AS valor
  FROM public.financeiro_lancamentos l
  LEFT JOIN public.dim_categoria_dre d ON d.categoria_origem = coalesce(l.categoria, 'Não classificado')
  WHERE l.tipo = 'despesa' AND l.data_vencimento IS NOT NULL
  GROUP BY 1,2,3
), meses AS (SELECT mes FROM receita UNION SELECT mes FROM desp),
tot AS (
  SELECT m.mes,
    coalesce(r.valor,0) AS rec,
    coalesce((SELECT sum(valor) FROM desp x WHERE x.mes=m.mes AND x.tipo='variavel'),0) AS var,
    coalesce((SELECT sum(valor) FROM desp x WHERE x.mes=m.mes AND x.tipo='fixa'),0) AS fix
  FROM meses m LEFT JOIN receita r ON r.mes = m.mes
)
SELECT mes, 'Receita'::text AS grupo_dre, 'receita'::text AS tipo, rec AS valor FROM tot
UNION ALL SELECT mes, grupo_dre, tipo, valor FROM desp
UNION ALL SELECT mes, 'Margem de contribuição', 'resultado', rec - var FROM tot
UNION ALL SELECT mes, 'Resultado operacional', 'resultado', rec - var - fix FROM tot;
GRANT SELECT ON public.vw_dre_mensal TO authenticated;