CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count_campos INTEGER := 0;
    v_count_limpeza INTEGER := 0;
BEGIN
    -- 1. Preencher nomes de pacientes e prontuário na produção usando a tabela de agendamentos
    -- Isso garante que itens "Não Faturados" (que vêm com menos dados da API de Produção) 
    -- herdem os dados básicos.
    UPDATE public.lab_producao_feegow p
    SET 
        paciente_nome = COALESCE(p.paciente_nome, a.paciente_nome),
        prontuario = COALESCE(p.prontuario, a.prontuario)
    FROM public.lab_dim_agendamento a
    WHERE p.agendamento_id = a.agendamento_id
      AND (p.paciente_nome IS NULL OR p.prontuario IS NULL);
    
    GET DIAGNOSTICS v_count_campos = ROW_COUNT;

    -- 2. Limpeza de redundância histórica na tabela de faturamento legada
    DELETE FROM public.lab_faturamento f1
    WHERE f1.origem = 'particular'
      AND EXISTS (
          SELECT 1 FROM public.lab_faturamento f2
          WHERE f2.agendamento_id = f1.agendamento_id
            AND f2.item_id = f1.item_id
            AND f2.origem = 'convenio'
      );
    
    GET DIAGNOSTICS v_count_limpeza = ROW_COUNT;

    -- 3. Regra de Integridade: Remover duplicatas fantasmagóricas
    DELETE FROM public.lab_producao_feegow 
    WHERE situacao IS NULL 
      AND situacao_conta IS NULL 
      AND id_transacao IS NULL 
      AND agendamento_id IN (
          SELECT agendamento_id FROM public.lab_producao_feegow 
          WHERE situacao = 'Faturado'
      );

    RETURN json_build_object(
        'campos_enriquecidos', v_count_campos,
        'limpeza_legado', v_count_limpeza
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() TO service_role;
