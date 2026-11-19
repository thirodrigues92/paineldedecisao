CREATE OR REPLACE FUNCTION public.fn_dre(ano int, regime text DEFAULT 'pagamento')
RETURNS TABLE(ordem int, linha text, nivel int, mes int, valor numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $fn$
BEGIN
  IF ano IS NULL OR ano NOT BETWEEN 1 AND 9998 THEN
    RAISE EXCEPTION 'Ano inválido' USING ERRCODE = '22023';
  END IF;
  IF regime IS NULL OR regime NOT IN ('pagamento', 'competencia') THEN
    RAISE EXCEPTION 'Regime deve ser pagamento ou competencia' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  -- DRE_ITEMS_QUERY_BEGIN
  WITH parametros AS (SELECT ano AS ano_ref, regime AS regime_ref),
  itens AS (
    SELECT i.*, CASE WHEN p.regime_ref = 'pagamento' THEN i.data_pagamento ELSE i.data_competencia END AS data_dre,
      i.valor * i.quantidade - i.desconto + i.acrescimo AS valor_item
    FROM public.fin_itens i CROSS JOIN parametros p
    WHERE NOT i.is_cancelado
      AND (CASE WHEN p.regime_ref = 'pagamento' THEN i.data_pagamento ELSE i.data_competencia END) >= make_date(p.ano_ref,1,1)
      AND (CASE WHEN p.regime_ref = 'pagamento' THEN i.data_pagamento ELSE i.data_competencia END) < make_date(p.ano_ref+1,1,1)
  ), vinculados AS (
    SELECT i.*, extract(month FROM i.data_dre)::int AS mes_ref,
      c.categoria_nome, c.tipo AS categoria_tipo, c.grupo_dre_posicao, c.ordem_dre,
      coalesce(nullif(c.grupo_dre_nome,''), nullif(c.categoria_nome,''), 'SEM CATEGORIA') AS grupo_nome,
      coalesce(nullif(dp.grupo_nome,''),nullif(pr.grupo,''),'SEM GRUPO DE PROCEDIMENTO') AS procedimento_grupo,
      ag.encontrado, ag.convenio_id
    FROM itens i
    LEFT JOIN public.vw_plano_contas_dre c ON c.categoria_id = nullif(i.categoria_id,0)
    LEFT JOIN public.lab_dim_procedimento dp ON dp.procedimento_id = nullif(i.procedimento_id,0)
    LEFT JOIN public.procedimentos pr ON pr.procedimento_id = nullif(i.procedimento_id,0)
    LEFT JOIN LATERAL (
      SELECT candidatos.convenio_id, true AS encontrado FROM (
        SELECT a.convenio_id, 1 AS prioridade FROM public.agendamentos a WHERE a.agendamento_id = i.agendamento_id
        UNION ALL
        SELECT e.convenio_id, 2 FROM public.lab_agendamento_enriquecido e WHERE e.agendamento_id = i.agendamento_id AND NOT coalesce(e.sem_dados_agendamento,false)
        UNION ALL
        SELECT d.convenio_id, 3 FROM public.lab_dim_agendamento d WHERE d.agendamento_id = i.agendamento_id
      ) candidatos ORDER BY candidatos.prioridade LIMIT 1
    ) ag ON true
  ), classificados AS (
    SELECT v.*,
      CASE WHEN v.tipo_transacao='C' AND coalesce(v.procedimento_id,0)>0 THEN
        CASE WHEN v.encontrado IS NULL THEN 'proc:sem-vinculo' WHEN coalesce(v.convenio_id,0)>0 THEN 'proc:convenio' ELSE 'proc:particular' END
        ELSE coalesce(v.grupo_dre_posicao, CASE WHEN v.categoria_nome IS NOT NULL THEN 'categoria:'||v.categoria_id::text ELSE 'sem-categoria' END) END AS grupo_chave,
      CASE WHEN v.tipo_transacao='C' AND coalesce(v.procedimento_id,0)>0 THEN
        CASE WHEN v.encontrado IS NULL THEN 'RECEITA SEM VÍNCULO DE AGENDAMENTO' WHEN coalesce(v.convenio_id,0)>0 THEN 'RECEITA CONVÊNIO' ELSE 'RECEITA PARTICULAR' END
        ELSE v.grupo_nome END AS grupo_linha,
      CASE WHEN v.tipo_transacao='C' AND coalesce(v.procedimento_id,0)>0 THEN v.procedimento_grupo
        ELSE coalesce(nullif(v.categoria_nome,''),'SEM CATEGORIA') END AS detalhe_linha,
      CASE WHEN v.tipo_transacao='C' AND coalesce(v.procedimento_id,0)>0 THEN 'income'
        ELSE coalesce(v.categoria_tipo,CASE WHEN v.tipo_transacao='C' THEN 'income' ELSE 'expense' END) END AS secao,
      CASE WHEN v.tipo_transacao='D' AND v.categoria_tipo='income' THEN -v.valor_item ELSE v.valor_item END AS valor_linha,
      (v.tipo_transacao='D' AND (
        public.dre_normalizar(v.grupo_nome) IN ('socios','aquisicao de patrimonio')
        OR public.dre_normalizar(coalesce(v.categoria_nome,''))='ampliacao'
        OR public.dre_normalizar(v.grupo_nome)='ampliacao'
      )) AS ajustar_operacional
    FROM vinculados v
  ), catalogo AS (
    SELECT grupo_chave,secao,max(grupo_linha) AS grupo_linha,min(ordem_dre) AS ordem_grupo
    FROM classificados GROUP BY grupo_chave,secao
    UNION ALL SELECT 'proc:particular','income','RECEITA PARTICULAR',NULL WHERE NOT EXISTS(SELECT 1 FROM classificados WHERE grupo_chave='proc:particular')
    UNION ALL SELECT 'proc:convenio','income','RECEITA CONVÊNIO',NULL WHERE NOT EXISTS(SELECT 1 FROM classificados WHERE grupo_chave='proc:convenio')
  ), grupos AS (
    SELECT c.*, (CASE WHEN c.secao='income' THEN 1000 ELSE 100000 END +
      row_number() OVER (PARTITION BY c.secao ORDER BY CASE c.grupo_chave WHEN 'proc:particular' THEN 0 WHEN 'proc:convenio' THEN 1 WHEN 'proc:sem-vinculo' THEN 2 ELSE 3 END, c.ordem_grupo NULLS LAST,c.grupo_chave)*1000)::int AS ordem_grupo_final
    FROM catalogo c
  ), detalhes AS (
    SELECT g.grupo_chave,g.secao,g.ordem_grupo_final,c.detalhe_linha,
      row_number() OVER (PARTITION BY g.grupo_chave,g.secao ORDER BY c.detalhe_linha)::int AS ordem_filha
    FROM grupos g JOIN (SELECT DISTINCT grupo_chave,secao,detalhe_linha FROM classificados) c USING(grupo_chave,secao)
  ), meses AS (SELECT generate_series(1,12)::int AS mes_ref),
  linhas_grupos AS (
    SELECT g.ordem_grupo_final AS ordem_ref,g.grupo_linha AS linha_ref,1 AS nivel_ref,m.mes_ref,
      coalesce(sum(c.valor_linha),0)::numeric AS valor_ref
    FROM grupos g CROSS JOIN meses m LEFT JOIN classificados c ON c.grupo_chave=g.grupo_chave AND c.secao=g.secao AND c.mes_ref=m.mes_ref
    GROUP BY g.ordem_grupo_final,g.grupo_linha,m.mes_ref
  ), linhas_detalhes AS (
    SELECT d.ordem_grupo_final+d.ordem_filha AS ordem_ref,d.detalhe_linha AS linha_ref,2 AS nivel_ref,m.mes_ref,
      coalesce(sum(c.valor_linha),0)::numeric AS valor_ref
    FROM detalhes d CROSS JOIN meses m LEFT JOIN classificados c ON c.grupo_chave=d.grupo_chave AND c.secao=d.secao AND c.detalhe_linha=d.detalhe_linha AND c.mes_ref=m.mes_ref
    GROUP BY d.ordem_grupo_final,d.ordem_filha,d.detalhe_linha,m.mes_ref
  ), totais AS (
    SELECT m.mes_ref,
      coalesce(sum(c.valor_item) FILTER(WHERE c.tipo_transacao='C'),0)::numeric AS receitas,
      coalesce(sum(c.valor_item) FILTER(WHERE c.tipo_transacao='D'),0)::numeric AS despesas,
      coalesce(sum(c.valor_item) FILTER(WHERE c.ajustar_operacional),0)::numeric AS ajustes
    FROM meses m LEFT JOIN classificados c ON c.mes_ref=m.mes_ref GROUP BY m.mes_ref
  ), saida AS (
    SELECT * FROM linhas_grupos UNION ALL SELECT * FROM linhas_detalhes
    UNION ALL SELECT 90000,'TOTAL DE RECEITAS',0,t.mes_ref,t.receitas FROM totais t
    UNION ALL SELECT 900000,'TOTAL DE DESPESAS',0,t.mes_ref,t.despesas FROM totais t
    UNION ALL SELECT 900001,'RESULTADO',0,t.mes_ref,t.receitas-t.despesas FROM totais t
    UNION ALL SELECT 900002,'RESULTADO OPERACIONAL',0,t.mes_ref,t.receitas-t.despesas+t.ajustes FROM totais t
  ) SELECT s.ordem_ref,s.linha_ref,s.nivel_ref,s.mes_ref,s.valor_ref FROM saida s ORDER BY s.ordem_ref,s.mes_ref
  -- DRE_ITEMS_QUERY_END
  ;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_dre(int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre(int,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_dre(int,text) IS 'Separate Feegow item-based DRE: excludes cancelled items; payment date is latest invoice payment, not actual receipt allocation. Positive expense groups; D items in income groups displayed negative. Totals use each item exactly once, never sum hierarchy rows or repeated valor_pago. Missing appointments remain explicit, not guessed as private. Operational adjustments add Socios, Aquisicao de Patrimonio and Ampliacao once per item. Existing receipt-based DRE remains unchanged.';