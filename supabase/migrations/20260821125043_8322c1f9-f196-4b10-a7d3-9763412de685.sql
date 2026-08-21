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
    v_count_campos INTEGER := 0;
BEGIN
    -- 1. Preencher campos a partir de producao (se a tabela faturamento ainda for usada para algum legado)
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

    -- 2. Limpeza de redundância entre convênio e particular
    DELETE FROM public.lab_faturamento f1
    WHERE f1.origem = 'particular'
      AND EXISTS (
          SELECT 1 FROM public.lab_faturamento f2
          WHERE f2.agendamento_id = f1.agendamento_id
            AND f2.item_id = f1.item_id
            AND f2.origem = 'convenio'
      );
    
    GET DIAGNOSTICS v_count_limpeza = ROW_COUNT;

    -- 3. REMOÇÃO DE DUPLICATAS FANTASMAS NA PRODUÇÃO (Regra de integridade)
    -- Remove linhas da produção que foram inseridas sem metadados financeiros (duplicatas da agenda)
    -- quando já existe uma linha de faturamento real para o mesmo agendamento.
    DELETE FROM public.lab_producao_feegow 
    WHERE situacao IS NULL 
      AND situacao_conta IS NULL 
      AND id_transacao IS NULL 
      AND agendamento_id IN (
          SELECT agendamento_id FROM public.lab_producao_feegow 
          WHERE situacao = 'Faturado'
      );

    RETURN json_build_object(
        'campos_atualizados', v_count_campos,
        'limpeza_duplicados', v_count_limpeza
    );
END;
$$;