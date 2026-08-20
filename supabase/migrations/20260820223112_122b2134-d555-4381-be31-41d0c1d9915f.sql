CREATE TABLE public.lab_tabela_precos_convenio (
  id SERIAL PRIMARY KEY,
  convenio_id INTEGER NOT NULL REFERENCES public.lab_convenios(convenio_id),
  procedimento_id INTEGER NOT NULL REFERENCES public.procedimentos(procedimento_id),
  codigo_tuss TEXT,
  valor NUMERIC(10,2) NOT NULL,
  fonte TEXT DEFAULT 'planilha_operadora',
  atualizado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(convenio_id, procedimento_id)
);

GRANT SELECT ON public.lab_tabela_precos_convenio TO authenticated;
GRANT ALL ON public.lab_tabela_precos_convenio TO service_role;

ALTER TABLE public.lab_tabela_precos_convenio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura para usuários autenticados" 
ON public.lab_tabela_precos_convenio FOR SELECT 
TO authenticated 
USING (true);
