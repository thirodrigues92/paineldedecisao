CREATE TABLE IF NOT EXISTS public.lab_repasse_feegow (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  id_transacao text NOT NULL DEFAULT '',
  item_id text NOT NULL DEFAULT '',
  profissional_id bigint NOT NULL DEFAULT -1,
  procedimento_id bigint NOT NULL DEFAULT -1,
  data_repasse date,
  profissional_nome text,
  paciente_id bigint,
  paciente_nome text,
  procedimento_nome text,
  grupo_id integer,
  especialidade_id integer,
  convenio_id integer,
  convenio_nome text,
  unidade_id bigint,
  unidade_nome text,
  tipo_lancamento text,
  forma_pagamento text,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(14,2) NOT NULL DEFAULT 0,
  valor_repassado numeric(14,2) NOT NULL DEFAULT 0,
  percentual numeric(10,4),
  regra_repasse text,
  situacao_repasse text,
  quantidade numeric(10,2),
  payload_raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lab_repasse_feegow_chave UNIQUE (id_transacao, item_id, profissional_id, procedimento_id)
);

GRANT SELECT ON public.lab_repasse_feegow TO authenticated;
GRANT SELECT ON public.lab_repasse_feegow TO anon;
GRANT ALL ON public.lab_repasse_feegow TO service_role;

ALTER TABLE public.lab_repasse_feegow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura de repasses"
  ON public.lab_repasse_feegow FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_lab_repasse_data ON public.lab_repasse_feegow (data_repasse);
CREATE INDEX IF NOT EXISTS idx_lab_repasse_prof ON public.lab_repasse_feegow (profissional_id);
CREATE INDEX IF NOT EXISTS idx_lab_repasse_data_id ON public.lab_repasse_feegow (data_repasse, id);

CREATE TRIGGER trg_lab_repasse_upd
  BEFORE UPDATE ON public.lab_repasse_feegow
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();