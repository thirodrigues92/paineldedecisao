CREATE INDEX IF NOT EXISTS lab_producao_par_transacao_idx ON public.lab_producao_feegow (agendamento_id, procedimento_id, id_transacao);

CREATE OR REPLACE FUNCTION public.lab_producao_guard_transacao()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path = public AS $function$
BEGIN
  IF btrim(coalesce(NEW.id_transacao,'')) = '' THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('lab_producao:' || NEW.agendamento_id::text), hashtext(NEW.procedimento_id::text));
  IF NEW.id_transacao LIKE 'ATE%' THEN
    IF EXISTS (SELECT 1 FROM public.lab_producao_feegow p WHERE p.agendamento_id=NEW.agendamento_id AND p.procedimento_id=NEW.procedimento_id AND p.id<>NEW.id AND p.id_transacao NOT LIKE 'ATE%' AND btrim(coalesce(p.id_transacao,''))<>'') THEN RETURN NULL; END IF;
  ELSE
    DELETE FROM public.lab_producao_feegow p WHERE p.agendamento_id=NEW.agendamento_id AND p.procedimento_id=NEW.procedimento_id AND p.id_transacao LIKE 'ATE%' AND p.id<>NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.lab_producao_guard_transacao() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lab_producao_guard_transacao BEFORE INSERT OR UPDATE ON public.lab_producao_feegow FOR EACH ROW EXECUTE FUNCTION public.lab_producao_guard_transacao();

CREATE OR REPLACE VIEW public.vw_producao_duplicados WITH (security_invoker=true) AS
SELECT p.id,p.agendamento_id,p.procedimento_id,p.id_transacao,p.data_execucao,p.valor,
CASE WHEN p.id_transacao LIKE 'ATE%' THEN 'ATE substituído' ELSE 'Transação vazia' END AS motivo
FROM public.lab_producao_feegow p
WHERE (p.id_transacao LIKE 'ATE%' AND EXISTS (SELECT 1 FROM public.lab_producao_feegow f WHERE f.agendamento_id=p.agendamento_id AND f.procedimento_id=p.procedimento_id AND f.id_transacao NOT LIKE 'ATE%' AND btrim(coalesce(f.id_transacao,''))<>''))
OR ((p.id_transacao='' OR p.id_transacao IS NULL) AND EXISTS (SELECT 1 FROM public.lab_producao_feegow f WHERE f.agendamento_id=p.agendamento_id AND f.procedimento_id=p.procedimento_id AND f.valor=p.valor AND btrim(coalesce(f.id_transacao,''))<>''));
GRANT SELECT ON public.vw_producao_duplicados TO authenticated, service_role;
REVOKE ALL ON public.vw_producao_duplicados FROM anon;

CREATE OR REPLACE FUNCTION public.lab_producao_origem(p_nome text, p_convenio_id bigint DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $function$
SELECT CASE WHEN public.dre_normalizar(p_nome)='nao faturado' THEN 'Não faturado'
WHEN public.dre_normalizar(p_nome)='particular' OR (btrim(coalesce(p_nome,''))='' AND coalesce(p_convenio_id,0)<=0) THEN 'Particular' ELSE 'Convênio' END;
$function$;
REVOKE ALL ON FUNCTION public.lab_producao_origem(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lab_producao_origem(text,bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lab_comparativo_mensal(p_from date,p_to date,p_unidades bigint[] DEFAULT NULL,p_profissionais bigint[] DEFAULT NULL,p_convenio text DEFAULT 'todos')
RETURNS TABLE(mes text,grupo_nome text,profissional_nome text,convenio_nome text,procedimento_nome text,valor numeric,qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT to_char(p.data_execucao,'YYYY-MM'),coalesce(nullif(btrim(p.grupo_nome),''),'Não informado'),coalesce(nullif(btrim(p.profissional_nome),''),'Não informado'),
CASE WHEN public.lab_producao_origem(p.convenio_nome,p.convenio_id)='Não faturado' THEN 'Não faturado' ELSE coalesce(nullif(btrim(p.convenio_nome),''),'Particular') END,
coalesce(nullif(btrim(p.procedimento_nome),''),'Não informado'),coalesce(sum(p.valor),0)::numeric,count(*)::bigint
FROM public.lab_producao_feegow p
WHERE p.data_execucao BETWEEN p_from AND p_to
AND (p_unidades IS NULL OR array_length(p_unidades,1) IS NULL OR p.unidade_id=ANY(p_unidades))
AND (p_profissionais IS NULL OR array_length(p_profissionais,1) IS NULL OR p.profissional_id=ANY(p_profissionais))
AND (p_convenio IS NULL OR p_convenio='todos' OR public.lab_producao_origem(p.convenio_nome,p.convenio_id)=CASE p_convenio WHEN 'particular' THEN 'Particular' WHEN 'convenio' THEN 'Convênio' WHEN 'nao_faturado' THEN 'Não faturado' END)
GROUP BY 1,2,3,4,5;
$function$;

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
AND (p_profissional IS NULL OR public.dre_normalizar(p.profissional_nome) LIKE '%'||public.dre_normalizar(p_profissional)||'%')
AND (p_convenio IS NULL OR CASE WHEN public.dre_normalizar(p_convenio) IN ('particular','convenio','nao faturado') THEN public.dre_normalizar(public.lab_producao_origem(p.convenio_nome,p.convenio_id))=public.dre_normalizar(p_convenio) ELSE public.dre_normalizar(coalesce(nullif(p.convenio_nome,''),'Particular')) LIKE '%'||public.dre_normalizar(p_convenio)||'%' END)
AND (p_grupo IS NULL OR public.dre_normalizar(p.grupo_nome) LIKE '%'||public.dre_normalizar(p_grupo)||'%')) x
GROUP BY k ORDER BY CASE WHEN p_agrupar IN ('mes','dia') THEN k END,3 DESC LIMIT 500;
$function$;
REVOKE ALL ON FUNCTION public.ia_producao(date,date,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ia_producao(date,date,text,text,text,text) TO authenticated,service_role;