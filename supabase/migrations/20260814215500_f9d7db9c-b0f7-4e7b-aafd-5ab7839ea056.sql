-- 1) Herda o convênio do agendamento vinculado
UPDATE public.financeiro_lancamentos f
SET convenio_id = a.convenio_id
FROM public.agendamentos a
WHERE f.agendamento_id = a.agendamento_id
  AND f.convenio_id IS NULL
  AND a.convenio_id IS NOT NULL;

-- 2) Casa o nome do convênio gravado na categoria com o catálogo
UPDATE public.financeiro_lancamentos f
SET convenio_id = c.convenio_id
FROM public.convenios c
WHERE f.convenio_id IS NULL
  AND f.categoria IS NOT NULL
  AND length(regexp_replace(lower(translate(f.categoria, 'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇáàâãäéêëíïóôõöúüç', 'AAAAAEEEIIOOOOUUCaaaaaeeeiioooouuc')), '[^a-z0-9]', '', 'g')) >= 3
  AND (
    regexp_replace(lower(translate(f.categoria, 'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇáàâãäéêëíïóôõöúüç', 'AAAAAEEEIIOOOOUUCaaaaaeeeiioooouuc')), '[^a-z0-9]', '', 'g')
      = regexp_replace(lower(translate(c.nome, 'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇáàâãäéêëíïóôõöúüç', 'AAAAAEEEIIOOOOUUCaaaaaeeeiioooouuc')), '[^a-z0-9]', '', 'g')
    OR regexp_replace(lower(translate(c.nome, 'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇáàâãäéêëíïóôõöúüç', 'AAAAAEEEIIOOOOUUCaaaaaeeeiioooouuc')), '[^a-z0-9]', '', 'g')
      LIKE '%' || regexp_replace(lower(translate(f.categoria, 'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇáàâãäéêëíïóôõöúüç', 'AAAAAEEEIIOOOOUUCaaaaaeeeiioooouuc')), '[^a-z0-9]', '', 'g') || '%'
  );