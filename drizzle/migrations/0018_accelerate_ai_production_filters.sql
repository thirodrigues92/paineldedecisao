CREATE OR REPLACE FUNCTION public.lab_producao_texto(s text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $function$
SELECT pg_catalog.lower(pg_catalog.btrim(pg_catalog.translate(coalesce(s,''),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')));
$function$;
REVOKE ALL ON FUNCTION public.lab_producao_texto(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lab_producao_texto(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.ia_producao(p_inicio date,p_fim date,p_agrupar text DEFAULT 'profissional',p_profissional text DEFAULT NULL,p_convenio text DEFAULT NULL,p_grupo text DEFAULT NULL)
RETURNS TABLE(chave text,qtd bigint,faturado numeric,recebido numeric,ticket_medio numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public SET statement_timeout='8s' AS $function$
SELECT k,count(*),round(sum(coalesce(valor,0)),2),round(sum(coalesce(valor_pago,0)),2),round(sum(coalesce(valor,0))/nullif(count(*),0),2)
FROM (SELECT p.*,CASE p_agrupar WHEN 'profissional' THEN coalesce(p.profissional_nome,'Não informado') WHEN 'grupo' THEN coalesce(p.grupo_nome,'Não informado')
WHEN 'procedimento' THEN coalesce(p.procedimento_nome,'Não informado')
WHEN 'origem' THEN public.lab_producao_origem(p.convenio_nome,p.convenio_id)
WHEN 'convenio' THEN CASE WHEN public.lab_producao_origem(p.convenio_nome,p.convenio_id)='Não faturado' THEN 'Não faturado' ELSE coalesce(nullif(btrim(p.convenio_nome),''),'Particular') END
WHEN 'mes' THEN to_char(p.data_execucao,'YYYY-MM') WHEN 'dia' THEN p.data_execucao::text WHEN 'forma_pagamento' THEN coalesce(p.forma_pagamento,'Não informado') ELSE 'Total' END k
FROM public.lab_producao_feegow p WHERE p.data_execucao BETWEEN p_inicio AND p_fim
AND (p_profissional IS NULL OR public.lab_producao_texto(p.profissional_nome) LIKE '%'||public.lab_producao_texto(p_profissional)||'%')
AND (p_convenio IS NULL OR CASE WHEN public.lab_producao_texto(p_convenio) IN ('particular','convenio','nao faturado') THEN public.lab_producao_texto(public.lab_producao_origem(p.convenio_nome,p.convenio_id))=public.lab_producao_texto(p_convenio) ELSE public.lab_producao_texto(coalesce(nullif(p.convenio_nome,''),'Particular')) LIKE '%'||public.lab_producao_texto(p_convenio)||'%' END)
AND (p_grupo IS NULL OR public.lab_producao_texto(p.grupo_nome) LIKE '%'||public.lab_producao_texto(p_grupo)||'%')) x
GROUP BY k ORDER BY CASE WHEN p_agrupar IN ('mes','dia') THEN k END,3 DESC LIMIT 500;
$function$;
REVOKE ALL ON FUNCTION public.ia_producao(date,date,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ia_producao(date,date,text,text,text,text) TO authenticated,service_role;