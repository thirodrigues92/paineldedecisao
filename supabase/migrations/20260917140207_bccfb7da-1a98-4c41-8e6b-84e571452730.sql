CREATE OR REPLACE FUNCTION public.lab_comparativo_mensal(
  p_from date,
  p_to date,
  p_unidades bigint[] DEFAULT NULL,
  p_profissionais bigint[] DEFAULT NULL,
  p_convenio text DEFAULT 'todos'
)
RETURNS TABLE (
  mes text,
  grupo_nome text,
  profissional_nome text,
  convenio_nome text,
  procedimento_nome text,
  valor numeric,
  qtd bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(p.data_execucao, 'YYYY-MM') AS mes,
    COALESCE(NULLIF(btrim(p.grupo_nome), ''), 'Não informado') AS grupo_nome,
    COALESCE(NULLIF(btrim(p.profissional_nome), ''), 'Não informado') AS profissional_nome,
    COALESCE(NULLIF(btrim(p.convenio_nome), ''), 'Particular') AS convenio_nome,
    COALESCE(NULLIF(btrim(p.procedimento_nome), ''), 'Não informado') AS procedimento_nome,
    COALESCE(SUM(p.valor), 0)::numeric AS valor,
    COUNT(*)::bigint AS qtd
  FROM public.lab_producao_feegow p
  WHERE p.data_execucao >= p_from
    AND p.data_execucao <= p_to
    AND (p_unidades IS NULL OR array_length(p_unidades, 1) IS NULL OR p.unidade_id = ANY (p_unidades))
    AND (p_profissionais IS NULL OR array_length(p_profissionais, 1) IS NULL OR p.profissional_id = ANY (p_profissionais))
    AND (
      p_convenio IS NULL OR p_convenio = 'todos'
      OR (p_convenio = 'particular' AND (p.convenio_id IS NULL OR p.convenio_id = 0 OR p.convenio_nome = 'Particular'))
      OR (p_convenio = 'convenio' AND p.convenio_id IS NOT NULL AND p.convenio_id <> 0 AND COALESCE(p.convenio_nome, '') <> 'Particular')
    )
  GROUP BY 1, 2, 3, 4, 5
$$;

CREATE OR REPLACE FUNCTION public.lab_dias_com_producao(
  p_from date,
  p_to date,
  p_unidades bigint[] DEFAULT NULL,
  p_profissionais bigint[] DEFAULT NULL
)
RETURNS TABLE (dia date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.data_execucao
  FROM public.lab_producao_feegow p
  WHERE p.data_execucao >= p_from
    AND p.data_execucao <= p_to
    AND (p_unidades IS NULL OR array_length(p_unidades, 1) IS NULL OR p.unidade_id = ANY (p_unidades))
    AND (p_profissionais IS NULL OR array_length(p_profissionais, 1) IS NULL OR p.profissional_id = ANY (p_profissionais))
$$;

GRANT EXECUTE ON FUNCTION public.lab_comparativo_mensal(date, date, bigint[], bigint[], text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lab_dias_com_producao(date, date, bigint[], bigint[]) TO anon, authenticated, service_role;