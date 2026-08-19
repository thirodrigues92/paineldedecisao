UPDATE public.lab_faturamento f
SET 
    paciente_id = COALESCE(f.paciente_id, a.paciente_id),
    paciente_nome = COALESCE(f.paciente_nome, p.nome)
FROM public.agendamentos a
LEFT JOIN public.pacientes p ON a.paciente_id = p.paciente_id
WHERE f.agendamento_id = a.agendamento_id
AND (f.paciente_id IS NULL OR f.paciente_nome IS NULL)
AND f.data_competencia = '2026-08-17';