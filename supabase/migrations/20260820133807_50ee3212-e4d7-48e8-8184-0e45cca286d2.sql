CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- 1.0 Limpeza de conflitos de origem
    DELETE FROM public.lab_faturamento f
    USING public.lab_dim_agendamento a, public.lab_faturamento f2
    WHERE f.agendamento_id = a.agendamento_id
      AND f.origem = 'particular'
      AND a.convenio_id > 0
      AND f2.origem = 'convenio'
      AND f2.documento_id = f.documento_id
      AND f2.item_id = f.item_id;

    -- 1.1 Vínculo por agendamento_id (exato)
    UPDATE public.lab_faturamento f
    SET 
        paciente_id = COALESCE(f.paciente_id, a.paciente_id),
        convenio_id = COALESCE(f.convenio_id, a.convenio_id),
        profissional_id = COALESCE(f.profissional_id, a.profissional_id),
        unidade_id = COALESCE(f.unidade_id, a.unidade_id),
        plano_id = COALESCE(f.plano_id, a.plano_id),
        especialidade_id = COALESCE(f.especialidade_id, a.especialidade_id),
        origem = CASE 
            WHEN f.origem = 'particular' AND COALESCE(f.convenio_id, a.convenio_id) > 0 THEN 'convenio'
            ELSE f.origem
        END
    FROM public.lab_dim_agendamento a
    WHERE f.agendamento_id = a.agendamento_id;

    -- 1.2 Tentar vincular por (paciente_id + data) quando agendamento_id está nulo
    UPDATE public.lab_faturamento f
    SET 
        agendamento_id = a.agendamento_id,
        paciente_id = COALESCE(f.paciente_id, a.paciente_id),
        convenio_id = COALESCE(f.convenio_id, a.convenio_id),
        profissional_id = COALESCE(f.profissional_id, a.profissional_id),
        unidade_id = COALESCE(f.unidade_id, a.unidade_id)
    FROM public.lab_dim_agendamento a
    WHERE f.agendamento_id IS NULL
      AND f.paciente_id = a.paciente_id
      AND f.data_atendimento = a.data;

    -- 2. Atualizar nomes de pacientes (corrigindo a sintaxe do JOIN)
    UPDATE public.lab_faturamento f
    SET 
        paciente_nome = COALESCE(NULLIF(f.paciente_nome, ''), p.nome, prod.nome_paciente),
        prontuario = COALESCE(NULLIF(f.prontuario, ''), p.prontuario)
    FROM (
        SELECT 
            f2.id,
            p2.nome,
            p2.prontuario,
            prod2.nome_paciente
        FROM public.lab_faturamento f2
        LEFT JOIN public.pacientes p2 ON f2.paciente_id = p2.paciente_id
        LEFT JOIN (
            SELECT agendamento_id, MAX(paciente_nome) as nome_paciente 
            FROM public.lab_producao_feegow 
            GROUP BY agendamento_id
        ) prod2 ON f2.agendamento_id = prod2.agendamento_id
        WHERE (f2.paciente_nome IS NULL OR f2.paciente_nome = '')
    ) sub
    WHERE f.id = sub.id;

    -- 3. Atualizar nomes de procedimentos
    UPDATE public.lab_faturamento f
    SET 
        procedimento_nome = COALESCE(NULLIF(f.procedimento_nome, ''), p.nome, prod.proc_nome),
        grupo_id = p.grupo_id,
        grupo_nome = p.grupo_nome
    FROM (
        SELECT 
            f2.id,
            p2.nome,
            p2.grupo_id,
            p2.grupo_nome,
            prod2.proc_nome
        FROM public.lab_faturamento f2
        LEFT JOIN public.lab_dim_procedimento p2 ON f2.procedimento_id = p2.procedimento_id
        LEFT JOIN (
            SELECT agendamento_id, procedimento_id, MAX(procedimento_nome) as proc_nome 
            FROM public.lab_producao_feegow 
            GROUP BY agendamento_id, procedimento_id
        ) prod2 ON f2.agendamento_id = prod2.agendamento_id AND f2.procedimento_id = prod2.procedimento_id
        WHERE (f2.procedimento_nome IS NULL OR f2.procedimento_nome = '')
    ) sub
    WHERE f.id = sub.id;

    -- 4. Marcar como convênio
    UPDATE public.lab_faturamento
    SET origem = 'convenio'
    WHERE convenio_id IS NOT NULL AND convenio_id > 0 AND origem = 'particular';

END;
$function$;
