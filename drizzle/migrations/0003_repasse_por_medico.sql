CREATE OR REPLACE FUNCTION public.normalizar_nome_medico(s text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT initcap(lower(btrim(regexp_replace(regexp_replace(coalesce(s,''), '^\s*((dr|dra)\.?|repasses?)(\s|\.|-)*', '', 'i'), '^\s*((dr|dra)\.?)(\s|\.|-)*', '', 'i'))))
$$;

CREATE OR REPLACE FUNCTION public.fin_repasse_medico(p_from date, p_to date)
RETURNS TABLE(profissional_id bigint, nome text, especialidade text, receita numeric, qtd_atend bigint, apurado numeric, pago numeric, pendente numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH rep AS (
    SELECT DISTINCT ON (r.id_transacao) r.*
    FROM public.lab_repasse_feegow r
    WHERE r.data_repasse BETWEEN p_from AND p_to
    ORDER BY r.id_transacao, r.updated_at DESC
  ), ra AS (
    SELECT profissional_id, max(profissional_nome) AS nome,
      sum(valor_repassado) AS apurado,
      sum(valor_repassado) FILTER (WHERE situacao_repasse IN ('Quitado','Liquidado com conta a receber')) AS pago,
      sum(valor_repassado) FILTER (WHERE situacao_repasse NOT IN ('Quitado','Liquidado com conta a receber') OR situacao_repasse IS NULL) AS pendente,
      mode() WITHIN GROUP (ORDER BY especialidade_id) AS esp_id
    FROM rep GROUP BY profissional_id
  ), pr AS (
    SELECT profissional_id, max(profissional_nome) AS nome, sum(valor) AS receita, count(DISTINCT agendamento_id) AS qtd
    FROM public.lab_producao_feegow
    WHERE situacao = 'Faturado' AND data_execucao BETWEEN p_from AND p_to AND profissional_id IS NOT NULL
    GROUP BY profissional_id
  ), pe AS (
    SELECT profissional_id, mode() WITHIN GROUP (ORDER BY especialidade_id) AS esp_id
    FROM public.agendamentos WHERE data BETWEEN p_from AND p_to AND especialidade_id IS NOT NULL GROUP BY profissional_id
  )
  SELECT coalesce(pr.profissional_id, ra.profissional_id),
    public.normalizar_nome_medico(coalesce(pr.nome, ra.nome)),
    coalesce(e.nome, 'Não informada'),
    coalesce(pr.receita,0), coalesce(pr.qtd,0),
    coalesce(ra.apurado,0), coalesce(ra.pago,0), coalesce(ra.pendente,0)
  FROM pr FULL JOIN ra ON ra.profissional_id = pr.profissional_id
  LEFT JOIN pe ON pe.profissional_id = coalesce(pr.profissional_id, ra.profissional_id)
  LEFT JOIN public.especialidades e ON e.especialidade_id = coalesce(ra.esp_id, pe.esp_id)
$$;
REVOKE EXECUTE ON FUNCTION public.fin_repasse_medico(date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fin_repasse_medico(date, date) TO authenticated;