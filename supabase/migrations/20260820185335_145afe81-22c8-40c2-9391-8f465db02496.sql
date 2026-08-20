CREATE TABLE IF NOT EXISTS public.lab_convenios (
  convenio_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  registro_ans TEXT,
  cnpj TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_convenios TO authenticated;
GRANT ALL ON public.lab_convenios TO service_role;

ALTER TABLE public.lab_convenios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access to lab_convenios" ON public.lab_convenios FOR ALL TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.lab_agendamento_enriquecido (
  agendamento_id BIGINT PRIMARY KEY,
  convenio_id INTEGER NULL,
  plano_id INTEGER NOT NULL,
  categoria_receita TEXT NOT NULL CHECK (categoria_receita IN ('particular', 'convenio')),
  procedimento_id INTEGER,
  grupo_procedimento_id INTEGER,
  especialidade_id INTEGER,
  unidade_id INTEGER,
  profissional_id INTEGER,
  status_id INTEGER,
  telemedicina BOOLEAN,
  retorno BOOLEAN,
  primeiro_agendamento BOOLEAN,
  canal_id INTEGER,
  sem_dados_agendamento BOOLEAN DEFAULT false,
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_agendamento_enriquecido TO authenticated;
GRANT ALL ON public.lab_agendamento_enriquecido TO service_role;

ALTER TABLE public.lab_agendamento_enriquecido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access to lab_agendamento_enriquecido" ON public.lab_agendamento_enriquecido FOR ALL TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lab_agend_enriq_convenio ON lab_agendamento_enriquecido(convenio_id);
CREATE INDEX IF NOT EXISTS idx_lab_agend_enriq_categoria ON lab_agendamento_enriquecido(categoria_receita);

DROP VIEW IF EXISTS public.vw_faturamento_categorizado;
CREATE OR REPLACE VIEW public.vw_faturamento_categorizado AS
SELECT
  f.*,
  e.categoria_receita,
  e.convenio_id AS e_convenio_id,
  c.nome AS nome_convenio,
  e.grupo_procedimento_id AS e_grupo_procedimento_id,
  e.especialidade_id AS e_especialidade_id,
  e.unidade_id AS e_unidade_id,
  e.profissional_id AS e_profissional_id,
  e.sem_dados_agendamento
FROM public.lab_faturamento f
LEFT JOIN public.lab_agendamento_enriquecido e
  ON f.agendamento_id = e.agendamento_id
LEFT JOIN public.lab_convenios c
  ON e.convenio_id = c.convenio_id;

GRANT SELECT ON public.vw_faturamento_categorizado TO authenticated;
GRANT ALL ON public.vw_faturamento_categorizado TO service_role;
