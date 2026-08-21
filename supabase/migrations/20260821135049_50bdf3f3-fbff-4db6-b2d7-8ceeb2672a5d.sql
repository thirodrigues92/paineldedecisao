-- CORREÇÃO 1: Remover duplicatas residuais de agendamentos fakes/incompletos
DELETE FROM public.lab_producao_feegow
WHERE id IN (
  SELECT id
  FROM (
    SELECT id, 
           id_transacao,
           count(*) OVER (PARTITION BY agendamento_id, procedimento_nome, valor) as duplicatas
    FROM public.lab_producao_feegow
    WHERE data_execucao = '2026-08-19'
  ) t
  WHERE duplicatas > 1 AND id_transacao LIKE 'ATE%'
);