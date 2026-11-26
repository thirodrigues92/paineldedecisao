CREATE OR REPLACE FUNCTION public.fn_dre_feegow(p_ano integer, p_regime text DEFAULT 'pagamento')
RETURNS TABLE(ordem integer, linha text, tipo text, mes integer, valor numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH itens AS MATERIALIZED (
  SELECT i.tipo_transacao, i.categoria_id, coalesce(i.procedimento_id,0) AS procedimento_id,
    (i.valor*i.quantidade - i.desconto + i.acrescimo) AS vi,
    extract(month FROM CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END)::int AS m
  FROM fin_itens i
  WHERE NOT i.is_cancelado
    AND (CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END) >= make_date(p_ano,1,1)
    AND (CASE WHEN p_regime='competencia' THEN i.data_competencia ELSE i.data_pagamento END) < make_date(p_ano+1,1,1)
), gn AS (SELECT grupo_id, max(grupo_nome) n FROM lab_producao_feegow WHERE grupo_id > 0 GROUP BY 1),
pg AS MATERIALIZED (
  SELECT coalesce(p.procedimento_id, dp.procedimento_id) AS procedimento_id,
    dre_feegow_normalizar_nome(coalesce(g1.n, g2.n, nullif(dp.grupo_nome,''))) AS gnorm
  FROM procedimentos p FULL JOIN lab_dim_procedimento dp ON dp.procedimento_id = p.procedimento_id
  LEFT JOIN gn g1 ON g1.grupo_id = dp.grupo_id
  LEFT JOIN gn g2 ON p.grupo ~ '^\d+$' AND g2.grupo_id = p.grupo::int
), lin AS (SELECT ordem, descricao, condicao FROM dre_feegow_linha),
cfg_cat AS MATERIALIZED (
  SELECT DISTINCT l.linha_descricao AS linha, pc.id AS cat, dl.condicao
  FROM dre_feegow_linha_item l
  JOIN dre_feegow_linha dl ON dl.descricao = l.linha_descricao
  JOIN fin_plano_contas pc ON dre_feegow_normalizar_nome(pc.nome) = dre_feegow_normalizar_nome(l.nome)
   AND (dl.condicao <> 'despesas' OR pc.tipo = 'expense')
  WHERE l.tipo_item = 'categoria'
), cfg_grp AS MATERIALIZED (
  SELECT DISTINCT l.linha_descricao AS linha, dre_feegow_normalizar_nome(l.nome) AS n
  FROM dre_feegow_linha_item l WHERE l.tipo_item = 'grupo'
), rec_proc AS (
  SELECT i.m, i.vi, pg.gnorm FROM itens i LEFT JOIN pg ON pg.procedimento_id = i.procedimento_id
  WHERE i.tipo_transacao='C' AND i.procedimento_id > 0
), base AS (
  SELECT l.descricao AS linha, r.m, r.vi FROM rec_proc r JOIN lin l ON l.condicao='receita_servico'
  WHERE r.gnorm IS NULL OR EXISTS (SELECT 1 FROM cfg_grp g WHERE g.linha=l.descricao AND g.n=r.gnorm)
  UNION ALL
  SELECT c.linha, i.m, i.vi FROM itens i JOIN cfg_cat c ON c.cat=i.categoria_id
  WHERE (c.condicao='despesas' AND i.tipo_transacao='D') OR (c.condicao='receita_servico' AND i.tipo_transacao='C' AND i.procedimento_id = 0)
), agg AS (SELECT linha, m, sum(vi) v FROM base GROUP BY 1,2),
linhas AS (
  SELECT l.ordem, l.descricao AS linha, CASE WHEN l.condicao='despesas' THEN 'despesa' ELSE 'receita' END AS tipo, ms.m AS mes,
    coalesce(a.v,0)::numeric AS valor
  FROM lin l CROSS JOIN generate_series(1,12) AS ms(m) LEFT JOIN agg a ON a.linha=l.descricao AND a.m=ms.m
), tot AS (
  SELECT x.mes, sum(x.valor) FILTER (WHERE x.tipo='receita') r, sum(x.valor) FILTER (WHERE x.tipo='despesa' AND x.linha <> 'REPASSES') d FROM linhas x GROUP BY x.mes
)
SELECT x.ordem, x.linha, x.tipo, x.mes, x.valor FROM linhas x
UNION ALL SELECT 3, 'TOTAL DE RECEITAS', 'total', t.mes, coalesce(t.r,0) FROM tot t
UNION ALL SELECT 900, 'TOTAL DE DESPESAS', 'total', t.mes, coalesce(t.d,0) FROM tot t
UNION ALL SELECT 901, 'TOTAL DE RECEITAS LIQUIDAS', 'total', t.mes, coalesce(t.r,0)-coalesce(t.d,0) FROM tot t
ORDER BY 1, 4;
$$;