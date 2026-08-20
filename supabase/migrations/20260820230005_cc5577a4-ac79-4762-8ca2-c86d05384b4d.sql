CREATE OR REPLACE FUNCTION lab_enriquecer_faturamento()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    v_count_campos INTEGER := 0;
    v_count_proc INTEGER := 0;
    v_count_limpeza INTEGER := 0;
    v_count_tabela INTEGER := 0;
    v_count_pendente_id INTEGER := 0;
    v_count_pendente_preco INTEGER := 0;
BEGIN
    -- 1. Preencher campos descritivos a partir de producao (mantém igual)
    UPDATE public.lab_faturamento f
    SET
        paciente_nome = COALESCE(f.paciente_nome, p.paciente_nome),
        prontuario = COALESCE(f.prontuario, p.prontuario),
        local_nome = COALESCE(f.local_nome, p.payload_raw->>'NomeLocal'),
        unidade_nome = COALESCE(f.unidade_nome, p.payload_raw->>'NomeUnidade'),
        convenio_nome = COALESCE(f.convenio_nome, p.payload_raw->>'Origem')
    FROM public.lab_producao_feegow p
    WHERE f.agendamento_id = p.agendamento_id
      AND (f.paciente_nome IS NULL OR f.prontuario IS NULL OR f.local_nome IS NULL OR f.unidade_nome IS NULL OR f.convenio_nome IS NULL);
    GET DIAGNOSTICS v_count_campos = ROW_COUNT;

    -- 2. Preencher procedimento_nome (mantém igual)
    UPDATE public.lab_faturamento f
    SET procedimento_nome = COALESCE(f.procedimento_nome, p.procedimento_nome)
    FROM public.lab_producao_feegow p
    WHERE f.agendamento_id = p.agendamento_id
      AND (f.procedimento_nome IS NULL OR f.procedimento_nome = '');
    GET DIAGNOSTICS v_count_proc = ROW_COUNT;

    -- 3. Limpeza de redundância (mantém igual)
    DELETE FROM public.lab_faturamento f1
    WHERE f1.origem = 'particular'
      AND EXISTS (
          SELECT 1 FROM public.lab_faturamento f2
          WHERE f2.agendamento_id = f1.agendamento_id
            AND f2.item_id = f1.item_id
            AND f2.origem = 'convenio'
      );
    GET DIAGNOSTICS v_count_limpeza = ROW_COUNT;

    -- 4a. Convênio com valor real na tabela de preços
    INSERT INTO public.lab_faturamento (
        origem, documento_id, item_id, agendamento_id, paciente_id,
        profissional_id, unidade_id, procedimento_id, data_atendimento,
        data_competencia, valor_bruto, desconto, acrescimo, valor_faturado,
        is_cancelado, tipo_transacao, paciente_nome, prontuario,
        procedimento_nome, local_nome, unidade_nome, convenio_nome, payload_raw
    )
    SELECT
        'convenio_tabela_manual', 0, p.feegow_id, p.agendamento_id, p.paciente_id,
        p.profissional_id, p.unidade_id, p.procedimento_id, p.data_execucao, p.data_execucao,
        tp.valor, 0, 0, tp.valor, false, 'C',
        p.paciente_nome, p.prontuario, p.procedimento_nome,
        p.payload_raw->>'NomeLocal', p.payload_raw->>'NomeUnidade', c.nome,
        jsonb_build_object('_debug_projection', true, 'fonte_valor', 'tabela_preco_convenio', 'prod_payload', p.payload_raw)
    FROM public.lab_producao_feegow p
    JOIN public.lab_agendamento_enriquecido e ON e.agendamento_id = p.agendamento_id
    JOIN public.lab_tabela_precos_convenio tp ON tp.convenio_id = e.convenio_id AND tp.procedimento_id = p.procedimento_id
    JOIN public.lab_convenios c ON c.convenio_id = e.convenio_id
    WHERE NOT EXISTS (SELECT 1 FROM public.lab_faturamento f WHERE f.agendamento_id = p.agendamento_id)
      AND e.categoria_receita = 'convenio'
    ON CONFLICT (origem, documento_id, item_id) DO NOTHING;
    GET DIAGNOSTICS v_count_tabela = ROW_COUNT;

    -- 4b. Convênio conhecido mas sem preço cadastrado ainda → pendente de preço (sem valor fabricado)
    INSERT INTO public.lab_faturamento (
        origem, documento_id, item_id, agendamento_id, paciente_id,
        profissional_id, unidade_id, procedimento_id, data_atendimento,
        data_competencia, valor_bruto, desconto, acrescimo, valor_faturado,
        is_cancelado, tipo_transacao, paciente_nome, prontuario,
        procedimento_nome, local_nome, unidade_nome, convenio_nome, payload_raw
    )
    SELECT
        'convenio_pendente_preco', 0, p.feegow_id, p.agendamento_id, p.paciente_id,
        p.profissional_id, p.unidade_id, p.procedimento_id, p.data_execucao, p.data_execucao,
        NULL, 0, 0, NULL, false, 'C',
        p.paciente_nome, p.prontuario, p.procedimento_nome,
        p.payload_raw->>'NomeLocal', p.payload_raw->>'NomeUnidade', c.nome,
        jsonb_build_object('_debug_projection', true, 'motivo', 'convenio_sem_preco_cadastrado', 'prod_payload', p.payload_raw)
    FROM public.lab_producao_feegow p
    JOIN public.lab_agendamento_enriquecido e ON e.agendamento_id = p.agendamento_id
    JOIN public.lab_convenios c ON c.convenio_id = e.convenio_id
    WHERE NOT EXISTS (SELECT 1 FROM public.lab_faturamento f WHERE f.agendamento_id = p.agendamento_id)
      AND e.categoria_receita = 'convenio'
      AND NOT EXISTS (SELECT 1 FROM public.lab_tabela_precos_convenio tp WHERE tp.convenio_id = e.convenio_id AND tp.procedimento_id = p.procedimento_id)
    ON CONFLICT (origem, documento_id, item_id) DO NOTHING;
    GET DIAGNOSTICS v_count_pendente_preco = ROW_COUNT;

    -- 4c. Origem diz "Convênio" mas a agenda não linkou convenio_id nenhum → pendente de identificação
    INSERT INTO public.lab_faturamento (
        origem, documento_id, item_id, agendamento_id, paciente_id,
        profissional_id, unidade_id, procedimento_id, data_atendimento,
        data_competencia, valor_bruto, desconto, acrescimo, valor_faturado,
        is_cancelado, tipo_transacao, paciente_nome, prontuario,
        procedimento_nome, local_nome, unidade_nome, convenio_nome, payload_raw
    )
    SELECT
        'convenio_pendente_identificacao', 0, p.feegow_id, p.agendamento_id, p.paciente_id,
        p.profissional_id, p.unidade_id, p.procedimento_id, p.data_execucao, p.data_execucao,
        NULL, 0, 0, NULL, false, 'C',
        p.paciente_nome, p.prontuario, p.procedimento_nome,
        p.payload_raw->>'NomeLocal', p.payload_raw->>'NomeUnidade', p.payload_raw->>'Origem',
        jsonb_build_object('_debug_projection', true, 'motivo', 'agenda_sem_convenio_vinculado', 'prod_payload', p.payload_raw)
    FROM public.lab_producao_feegow p
    LEFT JOIN public.lab_agendamento_enriquecido e ON e.agendamento_id = p.agendamento_id
    WHERE NOT EXISTS (SELECT 1 FROM public.lab_faturamento f WHERE f.agendamento_id = p.agendamento_id)
      AND (p.payload_raw->>'Origem' ILIKE '%Convênio%')
      AND (e.agendamento_id IS NULL OR e.categoria_receita != 'convenio')
    ON CONFLICT (origem, documento_id, item_id) DO NOTHING;
    GET DIAGNOSTICS v_count_pendente_id = ROW_COUNT;

    RETURN json_build_object(
        'campos_atualizados', v_count_campos,
        'procedimentos_atualizados', v_count_proc,
        'limpeza_duplicados', v_count_limpeza,
        'convenio_com_valor_real', v_count_tabela,
        'convenio_pendente_preco', v_count_pendente_preco,
        'convenio_pendente_identificacao', v_count_pendente_id
    );
END;
$$;