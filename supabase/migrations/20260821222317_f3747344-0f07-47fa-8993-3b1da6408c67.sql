
UPDATE lab_producao_feegow
SET convenio_nome = CASE
  WHEN tipo_procedimento IS NOT NULL AND payload_raw->>'TipoGuia' = 'Particular' THEN 'Particular'
  WHEN payload_raw->>'TipoGuia' IS NOT NULL THEN payload_raw->>'TipoGuia'
  ELSE NULL
END
WHERE (convenio_id = 0 OR convenio_id IS NULL)
  AND convenio_nome = 'Convênios ';
