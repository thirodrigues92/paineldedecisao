ALTER TABLE lab_producao_feegow
  ADD COLUMN IF NOT EXISTS id_transacao TEXT,
  ADD COLUMN IF NOT EXISTS n_guia_prestador TEXT,
  ADD COLUMN IF NOT EXISTS convenio_id INTEGER,
  ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS situacao TEXT,
  ADD COLUMN IF NOT EXISTS situacao_conta TEXT,
  ADD COLUMN IF NOT EXISTS grupo_id INTEGER,
  ADD COLUMN IF NOT EXISTS grupo_nome TEXT,
  ADD COLUMN IF NOT EXISTS tipo_procedimento TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento TEXT,
  ADD COLUMN IF NOT EXISTS tipo_guia TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS lab_producao_feegow_chave_natural
  ON lab_producao_feegow (id_transacao, n_guia_prestador, procedimento_id, agendamento_id);