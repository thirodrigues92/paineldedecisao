CREATE TABLE public.fin_conta_pessoa (
 tipo_conta int NOT NULL, conta_id bigint NOT NULL, nome text, documento text, tipo_descricao text,
 atualizado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tipo_conta,conta_id)
);
GRANT SELECT ON public.fin_conta_pessoa TO authenticated;
GRANT ALL ON public.fin_conta_pessoa TO service_role;
ALTER TABLE public.fin_conta_pessoa ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_conta_pessoa_read ON public.fin_conta_pessoa FOR SELECT TO authenticated USING(true);
CREATE FUNCTION public.fin_pessoa_identifier(v text) RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public AS $$
DECLARE n numeric;
BEGIN
 IF length(v)>40 OR btrim(v) !~ '^[+]?[0-9]+(\.0+)?$' THEN RETURN NULL; END IF;
 n:=btrim(v)::numeric;
 IF n<0 OR n>2147483647 THEN RETURN NULL; END IF;
 RETURN n::bigint;
END; $$;
REVOKE ALL ON FUNCTION public.fin_pessoa_identifier(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fin_pessoa_identifier(text) TO authenticated,service_role;
CREATE VIEW public.vw_fin_conta_pares WITH(security_invoker=true) AS
SELECT DISTINCT public.fin_pessoa_identifier(payload_raw->'detalhes'->0->>'tipo_conta')::int AS tipo_conta,
 public.fin_pessoa_identifier(payload_raw->'detalhes'->0->>'conta_id') AS conta_id FROM public.fin_itens;
REVOKE ALL ON public.vw_fin_conta_pares FROM PUBLIC,anon;
GRANT SELECT ON public.vw_fin_conta_pares TO service_role;
CREATE FUNCTION public.fin_pessoas_pendentes(p_limite int DEFAULT 300)
RETURNS TABLE(tipo_conta int,conta_id bigint,paciente_nome text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p.tipo_conta,p.conta_id,CASE WHEN p.tipo_conta=3 THEN nullif(btrim(pa.nome),'') END
 FROM public.vw_fin_conta_pares p LEFT JOIN public.fin_conta_pessoa c USING(tipo_conta,conta_id)
 LEFT JOIN public.pacientes pa ON p.tipo_conta=3 AND pa.paciente_id=p.conta_id
 WHERE p.tipo_conta>0 AND p.conta_id>0 AND c.conta_id IS NULL
 ORDER BY (p.tipo_conta=3),p.tipo_conta,p.conta_id LIMIT least(greatest(p_limite,1),300);
$$;
CREATE FUNCTION public.fin_pessoas_pendentes_count() RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT count(*) FROM public.vw_fin_conta_pares p LEFT JOIN public.fin_conta_pessoa c USING(tipo_conta,conta_id)
 WHERE p.tipo_conta>0 AND p.conta_id>0 AND c.conta_id IS NULL;
$$;
REVOKE ALL ON FUNCTION public.fin_pessoas_pendentes(int),public.fin_pessoas_pendentes_count() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fin_pessoas_pendentes(int),public.fin_pessoas_pendentes_count() TO service_role;
CREATE OR REPLACE VIEW public.vw_dre_itens_tela WITH (security_invoker=true) AS
WITH vinculados AS (
SELECT i.item_id,i.invoice_id,i.tipo_transacao,i.categoria_id,i.unidade_id,i.data_pagamento,i.data_competencia,i.valor*i.quantidade-i.desconto+i.acrescimo AS valor_item,
c.categoria_nome,c.tipo AS categoria_tipo,c.grupo_dre_posicao,c.posicao,c.ordem_dre,
coalesce(nullif(c.grupo_dre_nome,''),nullif(c.categoria_nome,''),'SEM CATEGORIA') AS grupo_nome,
coalesce(nullif(dp.grupo_nome,''),nullif(pr.grupo,''),'SEM GRUPO DE PROCEDIMENTO') AS procedimento_grupo,
(a.agendamento_id IS NOT NULL OR e.agendamento_id IS NOT NULL OR d.agendamento_id IS NOT NULL) AS encontrado,
CASE WHEN a.agendamento_id IS NOT NULL THEN a.convenio_id WHEN e.agendamento_id IS NOT NULL THEN e.convenio_id ELSE d.convenio_id END AS convenio_id,
btrim(coalesce(nullif(i.payload_raw->'item'->>'descricao',''),nullif(pr.nome,''),nullif(i.payload_raw->'detalhes'->0->>'descricao',''),'Item '||i.item_id::text), E' \t\r\n') AS descricao,
coalesce(nullif(btrim(cp.nome),''),nullif(pa.nome,''),nullif(i.payload_raw->'item'->>'fornecedor_nome',''),nullif(i.payload_raw->'detalhes'->0->>'responsavel','')) AS pessoa_nome,
public.fin_pessoa_identifier(i.payload_raw->'detalhes'->0->>'tipo_conta') AS pessoa_tipo_conta,
public.fin_pessoa_identifier(i.payload_raw->'detalhes'->0->>'conta_id') AS pessoa_conta_id,
coalesce(nullif(btrim(cp.tipo_descricao),''),CASE public.fin_pessoa_identifier(i.payload_raw->'detalhes'->0->>'tipo_conta') WHEN 2 THEN 'Fornecedor' WHEN 3 THEN 'Paciente' WHEN 4 THEN 'Funcionário' WHEN 5 THEN 'Profissional' WHEN 6 THEN 'Convênio' ELSE 'Tipo' END) AS pessoa_tipo,
cp.documento AS pessoa_documento
FROM public.fin_itens i
LEFT JOIN public.fin_conta_pessoa cp ON cp.tipo_conta=public.fin_pessoa_identifier(i.payload_raw->'detalhes'->0->>'tipo_conta') AND cp.conta_id=public.fin_pessoa_identifier(i.payload_raw->'detalhes'->0->>'conta_id')
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
coalesce(pessoa_nome,CASE WHEN public.dre_normalizar(grupo_linha)='repasses' AND public.dre_normalizar(coalesce(categoria_nome,'')) ~ '^(dr |dra |doutor |doutora )' THEN categoria_nome END) AS pessoa_nome,pessoa_tipo,pessoa_documento,pessoa_tipo_conta,pessoa_conta_id
FROM classificados;
GRANT SELECT ON public.vw_dre_itens_tela TO authenticated,service_role;
