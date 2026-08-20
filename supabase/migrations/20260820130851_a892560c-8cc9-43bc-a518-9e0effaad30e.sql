-- Corrigir função usando colunas corretas de procedimentos
CREATE OR REPLACE FUNCTION public.lab_popular_dimensoes()
RETURNS void AS $$
BEGIN
    -- Popular dim_agendamento
    INSERT INTO public.lab_dim_agendamento (agendamento_id, convenio_id, plano_id, paciente_id, profissional_id, unidade_id, status_id, data, canal_id, especialidade_id)
    SELECT agendamento_id, convenio_id, plano_id, paciente_id, profissional_id, unidade_id, status_id, data::date, canal_id, especialidade_id
    FROM public.agendamentos
    ON CONFLICT (agendamento_id) DO UPDATE SET
      convenio_id = EXCLUDED.convenio_id,
      plano_id = EXCLUDED.plano_id,
      paciente_id = EXCLUDED.paciente_id,
      profissional_id = EXCLUDED.profissional_id,
      unidade_id = EXCLUDED.unidade_id,
      status_id = EXCLUDED.status_id,
      data = EXCLUDED.data,
      canal_id = EXCLUDED.canal_id,
      especialidade_id = EXCLUDED.especialidade_id;

    -- Popular dim_procedimento
    INSERT INTO public.lab_dim_procedimento (procedimento_id, nome, grupo_nome)
    SELECT procedimento_id, nome, grupo
    FROM public.procedimentos
    ON CONFLICT (procedimento_id) DO UPDATE SET
      nome = EXCLUDED.nome,
      grupo_nome = EXCLUDED.grupo_nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Executar a função
SELECT public.lab_popular_dimensoes();
