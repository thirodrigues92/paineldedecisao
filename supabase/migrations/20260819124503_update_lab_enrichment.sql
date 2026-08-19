-- Atualização profunda da função de enriquecimento do Lab
CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Resolver paciente_id a partir de lab_dim_agendamento se estiver nulo
    UPDATE lab_faturamento f
    SET paciente_id = a.paciente_id
    FROM lab_dim_agendamento a
    WHERE f.agendamento_id = a.agendamento_id
      AND f.paciente_id IS NULL;

    -- 2. Resolver profissional_id se estiver nulo
    UPDATE lab_faturamento f
    SET profissional_id = a.profissional_id
    FROM lab_dim_agendamento a
    WHERE f.agendamento_id = a.agendamento_id
      AND f.profissional_id IS NULL;

    -- 3. Atualizar grupo_nome e nome do procedimento das dimensões do Lab
    UPDATE lab_faturamento f
    SET grupo_nome = p.grupo_nome
    FROM lab_dim_procedimento p
    WHERE f.procedimento_id = p.procedimento_id
      AND (f.grupo_nome IS NULL OR f.grupo_nome = 'Não classificado');

    -- 4. Definir origem baseada no convênio do agendamento
    UPDATE lab_faturamento f
    SET origem = CASE WHEN a.convenio_id IS NOT NULL THEN 'convenio' ELSE 'particular' END
    FROM lab_dim_agendamento a
    WHERE f.agendamento_id = a.agendamento_id
      AND (f.origem = 'particular' OR f.origem IS NULL);
END;
$$;
