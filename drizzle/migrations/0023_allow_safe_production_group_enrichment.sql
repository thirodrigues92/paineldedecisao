CREATE OR REPLACE FUNCTION public.lab_producao_guard_transacao() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'grupo_nome'-'grupo_fonte') IS NOT DISTINCT FROM (to_jsonb(OLD)-'grupo_nome'-'grupo_fonte') THEN RETURN NEW; END IF;
IF btrim(coalesce(NEW.id_transacao,''))='' THEN RETURN NULL; END IF;
PERFORM pg_advisory_xact_lock(hashtext('lab_producao:'||NEW.agendamento_id::text),hashtext(NEW.procedimento_id::text));
IF NEW.id_transacao LIKE 'ATE%' THEN
 IF EXISTS(SELECT 1 FROM public.lab_producao_feegow p WHERE p.agendamento_id=NEW.agendamento_id AND p.procedimento_id=NEW.procedimento_id AND p.id<>NEW.id AND p.id_transacao NOT LIKE 'ATE%' AND btrim(coalesce(p.id_transacao,''))<>'') THEN RETURN NULL; END IF;
ELSE DELETE FROM public.lab_producao_feegow p WHERE p.agendamento_id=NEW.agendamento_id AND p.procedimento_id=NEW.procedimento_id AND p.id_transacao LIKE 'ATE%' AND p.id<>NEW.id;
END IF; RETURN NEW; END; $$;