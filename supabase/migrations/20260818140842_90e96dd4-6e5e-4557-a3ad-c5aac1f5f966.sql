CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Enriquecer com Grupos de Procedimento
    UPDATE lab_faturamento f
    SET 
        grupo_id = p.grupo_id,
        grupo_nome = COALESCE(p.grupo_nome, 'Não classificado')
    FROM lab_dim_procedimento p
    WHERE f.procedimento_id = p.procedimento_id
    AND (f.grupo_nome = 'Não classificado' OR f.grupo_nome IS NULL);

    -- 2. Enriquecer com Dados de Agenda (Convênio, Plano, Especialidade)
    UPDATE lab_faturamento f
    SET 
        convenio_id = a.convenio_id,
        plano_id = a.plano_id,
        especialidade_id = a.especialidade_id,
        origem = CASE WHEN a.convenio_id IS NOT NULL THEN 'convenio' ELSE 'particular' END
    FROM lab_dim_agendamento a
    WHERE f.agendamento_id = a.agendamento_id
    AND f.origem = 'avulso';

    -- 3. Caso não tenha agendamento mas tenha procedimento (garantir consistência)
    UPDATE lab_faturamento
    SET origem = 'particular'
    WHERE origem = 'avulso' AND agendamento_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() TO authenticated, service_role;