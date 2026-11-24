CREATE TABLE public.lab_grupo_catalogo_cache (tipo text NOT NULL,chave text NOT NULL,grupo_nome text NOT NULL,PRIMARY KEY(tipo,chave));
GRANT SELECT ON public.lab_grupo_catalogo_cache TO authenticated; GRANT ALL ON public.lab_grupo_catalogo_cache TO service_role;
ALTER TABLE public.lab_grupo_catalogo_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY grupo_cache_read ON public.lab_grupo_catalogo_cache FOR SELECT TO authenticated USING(true);
INSERT INTO public.lab_grupo_catalogo_cache SELECT 'id',procedimento_id::text,grupo_nome FROM public.lab_vw_grupo_por_id UNION ALL SELECT 'nome',procedimento_chave,grupo_nome FROM public.lab_vw_grupo_por_nome;
CREATE OR REPLACE FUNCTION public.lab_refresh_grupo_catalogo() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
DELETE FROM public.lab_grupo_catalogo_cache WHERE tipo IN ('id','nome');
INSERT INTO public.lab_grupo_catalogo_cache SELECT 'id',procedimento_id::text,grupo_nome FROM public.lab_vw_grupo_por_id UNION ALL SELECT 'nome',procedimento_chave,grupo_nome FROM public.lab_vw_grupo_por_nome;
END; $$;
REVOKE ALL ON FUNCTION public.lab_refresh_grupo_catalogo() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.lab_refresh_grupo_catalogo() TO service_role;
CREATE OR REPLACE FUNCTION public.lab_producao_completar_grupo() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE g text; BEGIN
IF public.lab_grupo_exibicao(NEW.grupo_nome)<>'Não informado' THEN RETURN NEW; END IF;
SELECT grupo_nome INTO g FROM public.lab_grupo_catalogo_cache WHERE tipo='id' AND chave=NEW.procedimento_id::text;
IF g IS NOT NULL THEN NEW.grupo_nome:=g; NEW.grupo_fonte:='catalogo_id'; RETURN NEW; END IF;
SELECT grupo_nome INTO g FROM public.lab_grupo_catalogo_cache WHERE tipo='nome' AND chave=public.dre_feegow_normalizar_nome(NEW.procedimento_nome);
IF g IS NOT NULL THEN NEW.grupo_nome:=g; NEW.grupo_fonte:='catalogo_nome'; RETURN NEW; END IF;
SELECT grupo_nome INTO g FROM public.dim_grupo_procedimento_manual WHERE procedimento_chave=public.dre_feegow_normalizar_nome(NEW.procedimento_nome);
IF g IS NOT NULL THEN NEW.grupo_nome:=g; NEW.grupo_fonte:='manual'; END IF; RETURN NEW; END; $$;