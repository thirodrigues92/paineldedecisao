CREATE VIEW public.vw_dre_itens_tela WITH (security_invoker=true) AS
WITH vinculados AS (
SELECT i.item_id,i.invoice_id,i.tipo_transacao,i.categoria_id,i.unidade_id,i.data_pagamento,i.data_competencia,i.valor*i.quantidade-i.desconto+i.acrescimo AS valor_item,
c.categoria_nome,c.tipo AS categoria_tipo,c.grupo_dre_posicao,c.posicao,c.ordem_dre,
coalesce(nullif(c.grupo_dre_nome,''),nullif(c.categoria_nome,''),'SEM CATEGORIA') AS grupo_nome,
coalesce(nullif(dp.grupo_nome,''),nullif(pr.grupo,''),'SEM GRUPO DE PROCEDIMENTO') AS procedimento_grupo,
(a.agendamento_id IS NOT NULL OR e.agendamento_id IS NOT NULL OR d.agendamento_id IS NOT NULL) AS encontrado,
CASE WHEN a.agendamento_id IS NOT NULL THEN a.convenio_id WHEN e.agendamento_id IS NOT NULL THEN e.convenio_id ELSE d.convenio_id END AS convenio_id,
coalesce(nullif(i.payload_raw->'item'->>'descricao',''),nullif(pr.nome,''),nullif(i.payload_raw->'detalhes'->0->>'descricao',''),'Item '||i.item_id::text) AS descricao,
coalesce(nullif(pa.nome,''),nullif(i.payload_raw->'item'->>'fornecedor_nome',''),nullif(i.payload_raw->'detalhes'->0->>'responsavel','')) AS pessoa_nome
FROM public.fin_itens i
LEFT JOIN public.vw_plano_contas_dre c ON c.categoria_id=nullif(i.categoria_id,0)
LEFT JOIN public.lab_dim_procedimento dp ON dp.procedimento_id=nullif(i.procedimento_id,0)
LEFT JOIN public.procedimentos pr ON pr.procedimento_id=nullif(i.procedimento_id,0)
LEFT JOIN public.agendamentos a ON a.agendamento_id=i.agendamento_id
LEFT JOIN public.lab_agendamento_enriquecido e ON e.agendamento_id=i.agendamento_id AND NOT coalesce(e.sem_dados_agendamento,false)
LEFT JOIN public.lab_dim_agendamento d ON d.agendamento_id=i.agendamento_id
LEFT JOIN public.pacientes pa ON pa.paciente_id=coalesce(a.paciente_id,d.paciente_id)
WHERE NOT i.is_cancelado
), classificados AS (
SELECT v.*,
CASE WHEN v.tipo_transacao='C' AND coalesce(i.procedimento_id,0)>0 THEN CASE WHEN NOT v.encontrado THEN 'proc:sem-vinculo' WHEN coalesce(v.convenio_id,0)>0 THEN 'proc:convenio' ELSE 'proc:particular' END ELSE coalesce(v.grupo_dre_posicao,CASE WHEN v.categoria_nome IS NOT NULL THEN 'categoria:'||v.categoria_id::text ELSE 'sem-categoria' END) END AS grupo_chave,
CASE WHEN v.tipo_transacao='C' AND coalesce(i.procedimento_id,0)>0 THEN CASE WHEN NOT v.encontrado THEN 'RECEITA SEM VÍNCULO DE AGENDAMENTO' WHEN coalesce(v.convenio_id,0)>0 THEN 'RECEITA CONVÊNIO' ELSE 'RECEITA PARTICULAR' END ELSE v.grupo_nome END AS grupo_linha,
CASE WHEN v.tipo_transacao='C' AND coalesce(i.procedimento_id,0)>0 THEN 'income' ELSE coalesce(v.categoria_tipo,CASE WHEN v.tipo_transacao='C' THEN 'income' ELSE 'expense' END) END AS secao,
(v.tipo_transacao='C' AND coalesce(i.procedimento_id,0)>0) AS receita_procedimento,
CASE WHEN v.tipo_transacao='D' AND v.categoria_tipo='income' THEN -v.valor_item ELSE v.valor_item END AS valor_linha,
(v.tipo_transacao='D' AND (public.dre_normalizar(v.grupo_nome) IN ('socios','aquisicao de patrimonio','ampliacao') OR public.dre_normalizar(coalesce(v.categoria_nome,''))='ampliacao')) AS ajustar_operacional
FROM vinculados v JOIN public.fin_itens i USING(item_id)
)
SELECT item_id,invoice_id,tipo_transacao,categoria_id,unidade_id,data_pagamento,data_competencia,valor_item,valor_linha,categoria_nome,posicao,ordem_dre,procedimento_grupo,grupo_chave,grupo_linha,secao,receita_procedimento,ajustar_operacional,descricao,
coalesce(pessoa_nome,CASE WHEN public.dre_normalizar(grupo_linha)='repasses' AND public.dre_normalizar(coalesce(categoria_nome,'')) ~ '^(dr |dra |doutor |doutora )' THEN categoria_nome END) AS pessoa_nome
FROM classificados;
GRANT SELECT ON public.vw_dre_itens_tela TO authenticated,service_role;
CREATE FUNCTION public.fn_dre_tela(p_ano int,p_regime text DEFAULT 'pagamento',p_unidade bigint DEFAULT NULL)
RETURNS TABLE(grupo_chave text,grupo_linha text,secao text,ordem_dre numeric,categoria_id bigint,categoria_nome text,posicao text,procedimento_grupo text,receita_procedimento boolean,mes int,valor numeric,receitas numeric,despesas numeric,ajustes numeric,qtd bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
IF p_ano IS NULL OR p_ano NOT BETWEEN 1 AND 9998 OR p_regime IS NULL OR p_regime NOT IN ('pagamento','competencia') THEN RAISE EXCEPTION 'Filtros DRE inválidos' USING ERRCODE='22023'; END IF;
RETURN QUERY SELECT v.grupo_chave,v.grupo_linha,v.secao,v.ordem_dre,v.categoria_id,v.categoria_nome,v.posicao,v.procedimento_grupo,v.receita_procedimento,extract(month FROM CASE WHEN p_regime='pagamento' THEN v.data_pagamento ELSE v.data_competencia END)::int,
sum(v.valor_linha),coalesce(sum(v.valor_item) FILTER(WHERE v.tipo_transacao='C'),0),coalesce(sum(v.valor_item) FILTER(WHERE v.tipo_transacao='D'),0),coalesce(sum(v.valor_item) FILTER(WHERE v.ajustar_operacional),0),count(*)
FROM public.vw_dre_itens_tela v WHERE (p_unidade IS NULL OR v.unidade_id=p_unidade)
AND (CASE WHEN p_regime='pagamento' THEN v.data_pagamento ELSE v.data_competencia END)>=make_date(p_ano,1,1)
AND (CASE WHEN p_regime='pagamento' THEN v.data_pagamento ELSE v.data_competencia END)<make_date(p_ano+1,1,1)
GROUP BY v.grupo_chave,v.grupo_linha,v.secao,v.ordem_dre,v.categoria_id,v.categoria_nome,v.posicao,v.procedimento_grupo,v.receita_procedimento,extract(month FROM CASE WHEN p_regime='pagamento' THEN v.data_pagamento ELSE v.data_competencia END)
ORDER BY v.secao,v.grupo_chave,v.categoria_id,v.procedimento_grupo,10;
END; $$;
REVOKE ALL ON FUNCTION public.fn_dre_tela(int,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_tela(int,text,bigint) TO authenticated,service_role;