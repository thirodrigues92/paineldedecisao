CREATE VIEW public.vw_dre_mensal_caixa WITH (security_invoker = true) AS
WITH receita AS (
  SELECT to_char(data_pagamento,'YYYY-MM') AS mes, coalesce(sum(valor),0)::numeric AS valor
  FROM public.financeiro_lancamentos WHERE tipo = 'receita' AND data_pagamento IS NOT NULL GROUP BY 1
), desp AS (
  SELECT to_char(l.data_pagamento,'YYYY-MM') AS mes,
         coalesce(d.grupo_dre, public.dre_classificar(l.categoria)) AS grupo_dre,
         coalesce(d.tipo, public.dre_tipo_grupo(public.dre_classificar(l.categoria))) AS tipo,
         coalesce(sum(l.valor),0)::numeric AS valor
  FROM public.financeiro_lancamentos l
  LEFT JOIN public.dim_categoria_dre d ON d.categoria_origem = coalesce(l.categoria, 'Não classificado')
  WHERE l.tipo = 'despesa' AND l.data_pagamento IS NOT NULL
  GROUP BY 1,2,3
), meses AS (SELECT mes FROM receita UNION SELECT mes FROM desp),
tot AS (
  SELECT m.mes, coalesce(r.valor,0) AS rec,
    coalesce((SELECT sum(valor) FROM desp x WHERE x.mes=m.mes AND x.tipo='variavel'),0) AS var,
    coalesce((SELECT sum(valor) FROM desp x WHERE x.mes=m.mes AND x.tipo='fixa'),0) AS fix
  FROM meses m LEFT JOIN receita r ON r.mes = m.mes
)
SELECT mes, 'Receita'::text AS grupo_dre, 'receita'::text AS tipo, rec AS valor FROM tot
UNION ALL SELECT mes, grupo_dre, tipo, valor FROM desp
UNION ALL SELECT mes, 'Margem de contribuição', 'resultado', rec - var FROM tot
UNION ALL SELECT mes, 'Resultado operacional', 'resultado', rec - var - fix FROM tot;
GRANT SELECT ON public.vw_dre_mensal_caixa TO authenticated;