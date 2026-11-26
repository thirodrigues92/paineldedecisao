CREATE OR REPLACE FUNCTION public.fn_dre_feegow(p_ano integer, p_regime text DEFAULT 'pagamento')
RETURNS TABLE(ordem integer, linha text, tipo text, mes integer, valor numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH itens AS (
  SELECT i.*, (i.valor*i.quantidade - i.desconto + i.acrescimo) AS vi,
    extract(month FROM CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END)::int AS m
  FROM fin_itens i
  WHERE NOT i.is_cancelado
    AND (CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END) >= make_date(p_ano,1,1)
    AND (CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END) < make_date(p_ano+1,1,1)
), gn AS (SELECT grupo_id, max(grupo_nome) n FROM lab_producao_feegow WHERE grupo_id > 0 GROUP BY 1),
pg AS (
  SELECT coalesce(p.procedimento_id, dp.procedimento_id) AS procedimento_id, coalesce(g1.n, g2.n, nullif(dp.grupo_nome,'')) AS g
  FROM procedimentos p FULL JOIN lab_dim_procedimento dp ON dp.procedimento_id = p.procedimento_id
  LEFT JOIN gn g1 ON g1.grupo_id = dp.grupo_id
  LEFT JOIN gn g2 ON p.grupo ~ '^\d+$' AND g2.grupo_id = p.grupo::int
), cfg_cat AS (
  SELECT DISTINCT l.linha_descricao AS linha, pc.id AS cat, dl.condicao
  FROM dre_feegow_linha_item l
  JOIN dre_feegow_linha dl ON dl.descricao = l.linha_descricao
  JOIN fin_plano_contas pc ON dre_feegow_normalizar_nome(pc.nome) = dre_feegow_normalizar_nome(l.nome)
   AND (dl.condicao <> 'despesas' OR pc.tipo = 'expense')
  WHERE l.tipo_item = 'categoria'
), cfg_grp AS (
  SELECT DISTINCT l.linha_descricao AS linha, dre_feegow_normalizar_nome(l.nome) AS n
  FROM dre_feegow_linha_item l WHERE l.tipo_item = 'grupo'
), lin AS (SELECT ordem, descricao, condicao FROM dre_feegow_linha),
rec AS (
  -- Receita: cada linha de receita soma tudo que casar com sua configuração (como o Feegow).
  SELECT l.descricao AS linha, i.m, i.vi FROM itens i JOIN lin l ON l.condicao='receita_servico'
  LEFT JOIN pg ON pg.procedimento_id = i.procedimento_id
  WHERE i.tipo_transacao='C' AND (
    EXISTS (SELECT 1 FROM cfg_cat c WHERE c.linha=l.descricao AND c.cat=i.categoria_id)
    OR (coalesce(i.procedimento_id,0) > 0 AND (pg.g IS NULL OR EXISTS (SELECT 1 FROM cfg_grp g WHERE g.linha=l.descricao AND g.n=dre_feegow_normalizar_nome(pg.g)))))
), desp AS (
  SELECT c.linha, i.m, i.vi FROM itens i JOIN cfg_cat c ON c.cat=i.categoria_id AND c.condicao='despesas'
  WHERE i.tipo_transacao='D'
), base AS (SELECT * FROM rec UNION ALL SELECT * FROM desp),
meses AS (SELECT generate_series(1,12) AS m),
linhas AS (
  SELECT l.ordem, l.descricao AS linha, CASE WHEN l.condicao='despesas' THEN 'despesa' ELSE 'receita' END AS tipo, ms.m AS mes,
    coalesce((SELECT sum(b.vi) FROM base b WHERE b.linha=l.descricao AND b.m=ms.m),0)::numeric AS valor
  FROM lin l CROSS JOIN meses ms
), tot AS (
  SELECT mes, sum(valor) FILTER (WHERE tipo='receita') r, sum(valor) FILTER (WHERE tipo='despesa') d FROM linhas GROUP BY mes
)
SELECT ordem, linha, tipo, mes, valor FROM linhas
UNION ALL SELECT 3, 'TOTAL DE RECEITAS', 'total', mes, coalesce(r,0) FROM tot
UNION ALL SELECT 900, 'TOTAL DE DESPESAS', 'total', mes, coalesce(d,0) FROM tot
UNION ALL SELECT 901, 'TOTAL DE RECEITAS LIQUIDAS', 'total', mes, coalesce(r,0)-coalesce(d,0) FROM tot
ORDER BY 1, 4;
$$;
REVOKE ALL ON FUNCTION public.fn_dre_feegow(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_dre_feegow(integer, text) TO authenticated, service_role;