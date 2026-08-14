-- 1) Catálogo de convênios: garante um registro para cada convênio visto na agenda
INSERT INTO public.convenios (convenio_id, nome, planos)
SELECT DISTINCT a.convenio_id, 'Convênio ' || a.convenio_id, '[]'::jsonb
FROM public.agendamentos a
WHERE a.convenio_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.convenios c WHERE c.convenio_id = a.convenio_id)
ON CONFLICT (convenio_id) DO NOTHING;

-- 2) Backfill do convênio nos lançamentos de receita, apenas quando a combinação
--    (data, procedimento) tem um único convênio possível na agenda.
WITH chave AS (
  SELECT data, procedimento_id,
         MIN(convenio_id) AS convenio_id,
         COUNT(DISTINCT COALESCE(convenio_id, -1)) AS variacoes
  FROM public.agendamentos
  WHERE procedimento_id IS NOT NULL
  GROUP BY data, procedimento_id
)
UPDATE public.financeiro_lancamentos f
SET convenio_id = k.convenio_id
FROM chave k
WHERE f.convenio_id IS NULL
  AND f.tipo = 'receita'
  AND f.procedimento_id = k.procedimento_id
  AND k.variacoes = 1
  AND k.convenio_id IS NOT NULL
  AND COALESCE(f.data_pagamento, f.data_vencimento) = k.data;