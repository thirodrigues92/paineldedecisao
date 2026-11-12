CREATE OR REPLACE FUNCTION public.financeiro_dre_periodo(p_inicio date,p_fim date) RETURNS TABLE(mes text,grupo_dre text,tipo text,valor numeric) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH receita AS (SELECT coalesce(sum(r.valor),0)::numeric v FROM public.financeiro_recebimentos_baixados r WHERE r.data_baixa BETWEEN p_inicio AND p_fim),
desp AS (SELECT coalesce(d.grupo_dre,public.dre_classificar(l.categoria)) g,coalesce(d.tipo,public.dre_tipo_grupo(public.dre_classificar(l.categoria))) t,sum(l.valor)::numeric v FROM public.financeiro_lancamentos l LEFT JOIN public.dim_categoria_dre d ON d.categoria_origem=coalesce(l.categoria,'Não classificado') WHERE l.tipo='despesa' AND l.data_vencimento BETWEEN p_inicio AND p_fim GROUP BY 1,2),
tot AS (SELECT r.v rec,coalesce((SELECT sum(v) FROM desp WHERE t='variavel'),0) variavel,coalesce((SELECT sum(v) FROM desp WHERE t='fixa'),0) fixa FROM receita r)
SELECT to_char(p_inicio,'YYYY-MM'),'Receita'::text,'receita'::text,rec FROM tot
UNION ALL SELECT to_char(p_inicio,'YYYY-MM'),g,t,v FROM desp
UNION ALL SELECT to_char(p_inicio,'YYYY-MM'),'Margem de contribuição','resultado',rec-variavel FROM tot
UNION ALL SELECT to_char(p_inicio,'YYYY-MM'),'Resultado operacional','resultado',rec-variavel-fixa FROM tot;
$$;
REVOKE ALL ON FUNCTION public.financeiro_dre_periodo(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_dre_periodo(date,date) TO authenticated,service_role;