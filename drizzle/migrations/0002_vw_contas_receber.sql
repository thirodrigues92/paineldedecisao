CREATE VIEW public.vw_contas_receber WITH (security_invoker = true) AS
SELECT l.id, l.valor, l.status, l.data_vencimento, l.data_pagamento, l.categoria, l.descricao_item,
       l.convenio_id,
       coalesce(c.nome, CASE WHEN l.convenio_id IS NULL OR l.convenio_id = 0 THEN NULL END,
                nullif(l.categoria,'Não classificado'), 'Particular') AS convenio_nome,
       (l.convenio_id IS NOT NULL AND l.convenio_id <> 0) OR (c.nome IS NOT NULL) AS is_convenio,
       a.data AS data_execucao
FROM public.financeiro_lancamentos l
LEFT JOIN public.lab_convenios c ON c.convenio_id = l.convenio_id
LEFT JOIN public.agendamentos a ON a.agendamento_id = l.agendamento_id
WHERE l.tipo = 'receita';
GRANT SELECT ON public.vw_contas_receber TO authenticated;