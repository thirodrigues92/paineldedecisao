-- 1. Remover duplicatas mantendo o registro mais recente por chave natural
DELETE FROM public.lab_producao_feegow a
USING public.lab_producao_feegow b
WHERE a.ctid < b.ctid
  AND coalesce(a.id_transacao,'') = coalesce(b.id_transacao,'')
  AND coalesce(a.n_guia_prestador,'') = coalesce(b.n_guia_prestador,'')
  AND coalesce(a.procedimento_id,-1) = coalesce(b.procedimento_id,-1)
  AND coalesce(a.agendamento_id,-1) = coalesce(b.agendamento_id,-1);

-- 2. Eliminar nulos na chave natural (nulos impedem a deduplicação automática)
UPDATE public.lab_producao_feegow SET id_transacao = '' WHERE id_transacao IS NULL;
UPDATE public.lab_producao_feegow SET n_guia_prestador = '' WHERE n_guia_prestador IS NULL;
UPDATE public.lab_producao_feegow SET procedimento_id = -1 WHERE procedimento_id IS NULL;
UPDATE public.lab_producao_feegow SET agendamento_id = -1 WHERE agendamento_id IS NULL;

ALTER TABLE public.lab_producao_feegow
  ALTER COLUMN id_transacao SET DEFAULT '',
  ALTER COLUMN id_transacao SET NOT NULL,
  ALTER COLUMN n_guia_prestador SET DEFAULT '',
  ALTER COLUMN n_guia_prestador SET NOT NULL,
  ALTER COLUMN procedimento_id SET DEFAULT -1,
  ALTER COLUMN procedimento_id SET NOT NULL,
  ALTER COLUMN agendamento_id SET DEFAULT -1,
  ALTER COLUMN agendamento_id SET NOT NULL;