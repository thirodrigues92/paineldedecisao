CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count_paciente INTEGER := 0;
    v_count_proc INTEGER := 0;
    v_count_limpeza INTEGER := 0;
    v_count_estimado INTEGER := 0;
BEGIN
    -- 1. Preencher paciente_nome e prontuario a partir de producao (execucoes)
    UPDATE public.lab_faturamento f
    SET 
        paciente_nome = COALESCE(NULLIF(f.paciente_nome, ''), NULLIF(p.paciente_nome, '')),
        prontuario = COALESCE(NULLIF(f.prontuario, ''), NULLIF(p.prontuario, ''))
    FROM public.lab_producao_feegow p
    WHERE f.agendamento_id = p.agendamento_id
      AND (NULLIF(f.paciente_nome, '') IS NULL OR NULLIF(f.prontuario, '') IS NULL);
    
    GET DIAGNOSTICS v_count_paciente = ROW_COUNT;

    -- 2. Preencher procedimento_nome a partir de producao
    UPDATE public.lab_faturamento f
    SET procedimento_nome = COALESCE(NULLIF(f.procedimento_nome, ''), NULLIF(p.procedimento_nome, ''))
    FROM public.lab_producao_feegow p
    WHERE f.agendamento_id = p.agendamento_id
      AND NULLIF(f.procedimento_nome, '') IS NULL;

    GET DIAGNOSTICS v_count_proc = ROW_COUNT;

    -- 3. Limpeza de redundância mais agressiva
    DELETE FROM public.lab_faturamento f1
    WHERE f1.origem = 'particular'
      AND EXISTS (
          SELECT 1 FROM public.lab_faturamento f2
          WHERE f2.agendamento_id = f1.agendamento_id
            AND (f2.origem = 'convenio' OR f2.origem = 'convenio_estimado')
      );
    
    GET DIAGNOSTICS v_count_limpeza = ROW_COUNT;

    -- 4. PROJEÇÃO DE FATURAMENTO ESTIMADO PARA CONVÊNIOS
    INSERT INTO public.lab_faturamento (
        origem, documento_id, item_id, agendamento_id, paciente_id, 
        profissional_id, unidade_id, procedimento_id, data_atendimento, 
        data_competencia, valor_bruto, desconto, acrescimo, valor_faturado, 
        is_cancelado, tipo_transacao, paciente_nome, prontuario, 
        procedimento_nome, payload_raw
    )
    SELECT 
        'convenio_estimado', 
        0, 
        p.feegow_id, 
        p.agendamento_id,
        p.paciente_id,
        p.profissional_id,
        p.unidade_id,
        p.procedimento_id,
        p.data_execucao,
        p.data_execucao,
        p.valor, 
        0, 0, p.valor,
        false,
        'C',
        p.paciente_nome,
        p.prontuario,
        p.procedimento_nome,
        jsonb_build_object('_debug_projection', true, 'prod_payload', p.payload_raw)
    FROM public.lab_producao_feegow p
    WHERE NOT EXISTS (
        SELECT 1 FROM public.lab_faturamento f 
        WHERE f.agendamento_id = p.agendamento_id
    )
    AND (p.payload_raw->>'Origem' ILIKE '%Convênio%')
    ON CONFLICT (origem, documento_id, item_id) DO NOTHING;

    GET DIAGNOSTICS v_count_estimado = ROW_COUNT;

    RETURN json_build_object(
        'pacientes_atualizados', v_count_paciente,
        'procedimentos_atualizados', v_count_proc,
        'limpeza_duplicados', v_count_limpeza,
        'estimados_criados', v_count_estimado
    );
END;
$$; SELECT public.lab_enriquecer_faturamento();