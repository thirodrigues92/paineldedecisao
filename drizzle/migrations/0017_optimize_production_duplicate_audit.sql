CREATE INDEX IF NOT EXISTS lab_producao_ate_audit_idx ON public.lab_producao_feegow (agendamento_id,procedimento_id) WHERE id_transacao LIKE 'ATE%';
CREATE INDEX IF NOT EXISTS lab_producao_faturado_audit_idx ON public.lab_producao_feegow (agendamento_id,procedimento_id) WHERE id_transacao NOT LIKE 'ATE%' AND btrim(coalesce(id_transacao,''))<>'';
CREATE INDEX IF NOT EXISTS lab_producao_vazio_audit_idx ON public.lab_producao_feegow (agendamento_id,procedimento_id,valor) WHERE id_transacao='' OR id_transacao IS NULL;
CREATE INDEX IF NOT EXISTS lab_producao_preenchido_audit_idx ON public.lab_producao_feegow (agendamento_id,procedimento_id,valor) WHERE btrim(coalesce(id_transacao,''))<>'';
CREATE INDEX IF NOT EXISTS lab_producao_date_group_idx ON public.lab_producao_feegow (data_execucao,grupo_nome);
CREATE OR REPLACE VIEW public.vw_producao_duplicados WITH (security_invoker=true) AS
SELECT p.id,p.agendamento_id,p.procedimento_id,p.id_transacao,p.data_execucao,p.valor,'ATE substituído'::text AS motivo
FROM public.lab_producao_feegow p
WHERE p.id_transacao LIKE 'ATE%' AND EXISTS (SELECT 1 FROM public.lab_producao_feegow f WHERE f.agendamento_id=p.agendamento_id AND f.procedimento_id=p.procedimento_id AND f.id_transacao NOT LIKE 'ATE%' AND btrim(coalesce(f.id_transacao,''))<>'')
UNION ALL
SELECT p.id,p.agendamento_id,p.procedimento_id,p.id_transacao,p.data_execucao,p.valor,'Transação vazia'::text
FROM public.lab_producao_feegow p
WHERE (p.id_transacao='' OR p.id_transacao IS NULL) AND EXISTS (SELECT 1 FROM public.lab_producao_feegow f WHERE f.agendamento_id=p.agendamento_id AND f.procedimento_id=p.procedimento_id AND f.valor=p.valor AND btrim(coalesce(f.id_transacao,''))<>'');
GRANT SELECT ON public.vw_producao_duplicados TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.lab_producao_origem(p_nome text,p_convenio_id bigint DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $function$
SELECT CASE WHEN lower(btrim(coalesce(p_nome,''))) IN ('não faturado','nao faturado') THEN 'Não faturado'
WHEN lower(btrim(coalesce(p_nome,'')))='particular' OR (btrim(coalesce(p_nome,''))='' AND coalesce(p_convenio_id,0)<=0) THEN 'Particular' ELSE 'Convênio' END;
$function$;