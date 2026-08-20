-- Melhorar enriquecimento para buscar nomes de pacientes da tabela principal
CREATE OR REPLACE FUNCTION public.lab_enriquecer_faturamento()
RETURNS void AS $$
BEGIN
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

    -- 2. Atualizar nomes de pacientes da tabela principal
    UPDATE public.lab_faturamento f
    SET paciente_nome = p.nome,
        prontuario = COALESCE(f.prontuario, p.prontuario)
    FROM public.pacientes p
    WHERE f.paciente_id = p.paciente_id 
      AND (f.paciente_nome IS NULL OR f.paciente_nome = '');

    -- 3. Atualizar nomes de grupos baseados na dimensão de procedimentos
    UPDATE public.lab_faturamento f
    SET 
        grupo_id = p.grupo_id,
        grupo_nome = p.grupo_nome
    FROM public.lab_dim_procedimento p
    WHERE f.procedimento_id = p.procedimento_id;

    -- 4. Marcar como convênio se tiver convenio_id (garantia extra)
    UPDATE public.lab_faturamento
    SET origem = 'convenio'
    WHERE convenio_id IS NOT NULL AND convenio_id > 0 AND origem = 'particular';

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Rodar
SELECT public.lab_enriquecer_faturamento();
