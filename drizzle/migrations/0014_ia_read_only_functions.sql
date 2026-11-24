CREATE OR REPLACE FUNCTION public.ia_buscar_pessoa(p_texto text)
RETURNS TABLE(tipo text, id bigint, nome text, documento text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
WITH q AS (SELECT public.dre_normalizar(p_texto) AS t),
c AS (
  SELECT coalesce(nullif(p.tipo_descricao,''),'Conta tipo '||p.tipo_conta) tipo, p.conta_id id, p.nome, p.documento FROM public.fin_conta_pessoa p WHERE p.nome IS NOT NULL
  UNION ALL SELECT 'Profissional', pr.profissional_id, pr.nome, NULL FROM public.profissionais pr
  UNION ALL SELECT 'Convênio', cv.convenio_id, cv.nome, NULL FROM public.convenios cv
  UNION ALL SELECT 'Categoria', pc.id, pc.nome, pc.posicao FROM public.fin_plano_contas pc
)
SELECT c.tipo, c.id, c.nome, c.documento FROM c, q
WHERE length(q.t) >= 2 AND (public.dre_normalizar(c.nome) LIKE '%'||q.t||'%' OR coalesce(c.documento,'') LIKE '%'||q.t||'%')
ORDER BY (public.dre_normalizar(c.nome) = q.t) DESC, (public.dre_normalizar(c.nome) LIKE q.t||'%') DESC, length(c.nome), c.nome
LIMIT 15
$$;

CREATE OR REPLACE FUNCTION public.ia_financeiro(p_inicio date, p_fim date, p_tipo text DEFAULT 'todos', p_pessoa text DEFAULT NULL, p_categoria text DEFAULT NULL, p_grupo text DEFAULT NULL, p_regime text DEFAULT 'pagamento', p_agrupar text DEFAULT 'mes')
RETURNS TABLE(chave text, qtd bigint, total numeric, percentual numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
WITH b AS (
  SELECT v.*, CASE WHEN p_regime='competencia' THEN v.data_competencia ELSE v.data_pagamento END d
  FROM public.vw_dre_itens_tela v
  WHERE (p_tipo='todos' OR (p_tipo='receita' AND v.tipo_transacao='C') OR (p_tipo='despesa' AND v.tipo_transacao='D'))
    AND (p_pessoa IS NULL OR public.dre_normalizar(v.pessoa_nome) LIKE '%'||public.dre_normalizar(p_pessoa)||'%')
    AND (p_categoria IS NULL OR public.dre_normalizar(v.categoria_nome) LIKE '%'||public.dre_normalizar(p_categoria)||'%')
    AND (p_grupo IS NULL OR public.dre_normalizar(v.grupo_linha) LIKE '%'||public.dre_normalizar(p_grupo)||'%')
), f AS (SELECT * FROM b WHERE d BETWEEN p_inicio AND p_fim),
g AS (
  SELECT CASE p_agrupar WHEN 'mes' THEN to_char(d,'YYYY-MM') WHEN 'categoria' THEN coalesce(categoria_nome,'SEM CATEGORIA')
    WHEN 'grupo' THEN coalesce(grupo_linha,'SEM GRUPO') WHEN 'pessoa' THEN coalesce(pessoa_nome,'Sem nome')
    WHEN 'pessoa_tipo' THEN coalesce(pessoa_tipo,'Não identificado') ELSE 'Total' END k,
    count(*) n, coalesce(sum(valor_item),0) t FROM f GROUP BY 1
)
SELECT k, n, round(t,2), round(100*t/nullif(sum(t) OVER (),0),2) FROM g
ORDER BY CASE WHEN p_agrupar='mes' THEN k END, t DESC LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.ia_financeiro_itens(p_inicio date, p_fim date, p_tipo text DEFAULT 'todos', p_pessoa text DEFAULT NULL, p_categoria text DEFAULT NULL, p_grupo text DEFAULT NULL, p_regime text DEFAULT 'pagamento', p_limite integer DEFAULT 100)
RETURNS TABLE(data date, pessoa_nome text, pessoa_tipo text, categoria_nome text, grupo_linha text, descricao text, valor_item numeric, invoice_id bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
SELECT x.d, x.pessoa_nome, x.pessoa_tipo, x.categoria_nome, x.grupo_linha, x.descricao, x.valor_item, x.invoice_id FROM (
  SELECT v.*, CASE WHEN p_regime='competencia' THEN v.data_competencia ELSE v.data_pagamento END d FROM public.vw_dre_itens_tela v
  WHERE (p_tipo='todos' OR (p_tipo='receita' AND v.tipo_transacao='C') OR (p_tipo='despesa' AND v.tipo_transacao='D'))
    AND (p_pessoa IS NULL OR public.dre_normalizar(v.pessoa_nome) LIKE '%'||public.dre_normalizar(p_pessoa)||'%')
    AND (p_categoria IS NULL OR public.dre_normalizar(v.categoria_nome) LIKE '%'||public.dre_normalizar(p_categoria)||'%')
    AND (p_grupo IS NULL OR public.dre_normalizar(v.grupo_linha) LIKE '%'||public.dre_normalizar(p_grupo)||'%')
) x WHERE x.d BETWEEN p_inicio AND p_fim
ORDER BY x.d, x.item_id LIMIT least(greatest(coalesce(p_limite,100),1),500)
$$;

CREATE OR REPLACE FUNCTION public.ia_dre(p_ano integer, p_regime text DEFAULT 'pagamento')
RETURNS TABLE(mes integer, grupo text, secao text, valor numeric, receitas numeric, despesas numeric, resultado numeric, resultado_operacional numeric, margem_pct numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
WITH t AS (SELECT * FROM public.fn_dre_tela(p_ano, p_regime, NULL)),
m AS (SELECT t.mes, sum(t.receitas) r, sum(t.despesas) d, sum(t.ajustes) a FROM t GROUP BY t.mes),
g AS (SELECT t.mes, t.grupo_linha, t.secao, sum(t.valor) v FROM t GROUP BY 1,2,3)
SELECT g.mes, g.grupo_linha, g.secao, round(g.v,2), round(m.r,2), round(m.d,2), round(m.r-m.d,2), round(m.r-m.d+m.a,2), round(100*(m.r-m.d)/nullif(m.r,0),2)
FROM g JOIN m USING (mes) ORDER BY g.mes, g.secao DESC, g.v DESC LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.ia_producao(p_inicio date, p_fim date, p_agrupar text DEFAULT 'profissional', p_profissional text DEFAULT NULL, p_convenio text DEFAULT NULL, p_grupo text DEFAULT NULL)
RETURNS TABLE(chave text, qtd bigint, faturado numeric, recebido numeric, ticket_medio numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
SELECT k, count(*), round(sum(coalesce(valor,0)),2), round(sum(coalesce(valor_pago,0)),2), round(sum(coalesce(valor,0))/nullif(count(*),0),2)
FROM (SELECT p.*, CASE p_agrupar WHEN 'profissional' THEN coalesce(p.profissional_nome,'Não informado') WHEN 'grupo' THEN coalesce(p.grupo_nome,'Não informado')
  WHEN 'procedimento' THEN coalesce(p.procedimento_nome,'Não informado') WHEN 'convenio' THEN coalesce(nullif(p.convenio_nome,''),'Particular')
  WHEN 'mes' THEN to_char(p.data_execucao,'YYYY-MM') WHEN 'dia' THEN p.data_execucao::text WHEN 'forma_pagamento' THEN coalesce(p.forma_pagamento,'Não informado') ELSE 'Total' END k
  FROM public.lab_producao_feegow p WHERE p.data_execucao BETWEEN p_inicio AND p_fim
   AND (p_profissional IS NULL OR public.dre_normalizar(p.profissional_nome) LIKE '%'||public.dre_normalizar(p_profissional)||'%')
   AND (p_convenio IS NULL OR public.dre_normalizar(coalesce(nullif(p.convenio_nome,''),'Particular')) LIKE '%'||public.dre_normalizar(p_convenio)||'%')
   AND (p_grupo IS NULL OR public.dre_normalizar(p.grupo_nome) LIKE '%'||public.dre_normalizar(p_grupo)||'%')) x
GROUP BY k ORDER BY CASE WHEN p_agrupar IN ('mes','dia') THEN k END, 3 DESC LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.ia_agenda(p_inicio date, p_fim date, p_agrupar text DEFAULT 'status')
RETURNS TABLE(chave text, qtd bigint, realizados bigint, faltas bigint, cancelados bigint, taxa_no_show numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
SELECT k, count(*), count(*) FILTER (WHERE cat='realizado'), count(*) FILTER (WHERE cat='no_show'), count(*) FILTER (WHERE cat='cancelado'),
  round(100.0*count(*) FILTER (WHERE cat='no_show')/nullif(count(*) FILTER (WHERE cat IN ('realizado','no_show')),0),2)
FROM (SELECT s.categoria cat, CASE p_agrupar WHEN 'status' THEN coalesce(nullif(s.descricao,''),s.categoria,'Sem status')
   WHEN 'profissional' THEN coalesce(pr.nome,'Não informado') WHEN 'dia' THEN a.data::text WHEN 'procedimento' THEN coalesce(pc.nome,'Não informado') ELSE 'Total' END k
  FROM public.agendamentos a LEFT JOIN public.status_agendamento s ON s.status_id=a.status_id
  LEFT JOIN public.profissionais pr ON pr.profissional_id=a.profissional_id LEFT JOIN public.procedimentos pc ON pc.procedimento_id=a.procedimento_id
  WHERE a.data BETWEEN p_inicio AND p_fim) x
GROUP BY k ORDER BY CASE WHEN p_agrupar='dia' THEN k END, 2 DESC LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.ia_pacientes(p_inicio date, p_fim date, p_tipo text DEFAULT 'novos')
RETURNS TABLE(paciente_id integer, nome text, cidade text, bairro text, primeira_consulta date, ultima_consulta date, qtd bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' SET statement_timeout TO '8s'
AS $$
WITH h AS (SELECT a.paciente_id, min(a.data) pri, max(a.data) ult, count(*) n FROM public.agendamentos a
  JOIN public.status_agendamento s ON s.status_id=a.status_id AND s.categoria='realizado'
  WHERE a.paciente_id IS NOT NULL AND a.data <= p_fim GROUP BY a.paciente_id)
SELECT h.paciente_id, p.nome, p.cidade, p.bairro, h.pri, h.ult, h.n FROM h LEFT JOIN public.pacientes p USING (paciente_id)
WHERE p_tipo='novos' AND h.pri BETWEEN p_inicio AND p_fim
UNION ALL
SELECT h.paciente_id, p.nome, p.cidade, p.bairro, h.pri, h.ult, h.n FROM h LEFT JOIN public.pacientes p USING (paciente_id)
WHERE p_tipo='ausentes_90' AND h.ult < p_fim - 90 AND h.ult >= p_inicio
UNION ALL
SELECT NULL, NULL, coalesce(p.cidade,'Não informada'), coalesce(p.bairro,'Não informado'), NULL, NULL, count(DISTINCT a.paciente_id)
FROM public.agendamentos a LEFT JOIN public.pacientes p USING (paciente_id)
WHERE p_tipo='regiao' AND a.data BETWEEN p_inicio AND p_fim AND a.paciente_id IS NOT NULL GROUP BY 3,4
ORDER BY 7 DESC, 6 DESC NULLS LAST LIMIT 500
$$;

REVOKE ALL ON FUNCTION public.ia_buscar_pessoa(text), public.ia_financeiro(date,date,text,text,text,text,text,text),
 public.ia_financeiro_itens(date,date,text,text,text,text,text,integer), public.ia_dre(integer,text),
 public.ia_producao(date,date,text,text,text,text), public.ia_agenda(date,date,text), public.ia_pacientes(date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ia_buscar_pessoa(text), public.ia_financeiro(date,date,text,text,text,text,text,text),
 public.ia_financeiro_itens(date,date,text,text,text,text,text,integer), public.ia_dre(integer,text),
 public.ia_producao(date,date,text,text,text,text), public.ia_agenda(date,date,text), public.ia_pacientes(date,date,text) TO authenticated;