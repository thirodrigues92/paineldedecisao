
-- Trigger util
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- =============== STATUS AGENDAMENTO ===============
CREATE TABLE public.status_agendamento (
  status_id INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'outro',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.status_agendamento TO authenticated;
GRANT ALL ON public.status_agendamento TO service_role;
ALTER TABLE public.status_agendamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read status" ON public.status_agendamento FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_status_upd BEFORE UPDATE ON public.status_agendamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default status mapping (conforme brief seção 4)
INSERT INTO public.status_agendamento (status_id, descricao, categoria) VALUES
  (1,   'Agendado',        'agendado'),
  (2,   'Em atendimento',  'em_atendimento'),
  (3,   'Realizado',       'realizado'),
  (4,   'Aguardando',      'em_atendimento'),
  (5,   'Chamado',         'em_atendimento'),
  (6,   'No-show',         'no_show'),
  (7,   'Confirmado',      'agendado'),
  (11,  'Cancelado',       'cancelado'),
  (15,  'Remarcado',       'remarcado'),
  (16,  'Cancelado paciente','cancelado'),
  (101, 'Triagem',         'triagem'),
  (103, 'Triagem em andamento','triagem'),
  (105, 'Triagem finalizada','triagem')
ON CONFLICT (status_id) DO NOTHING;

-- =============== ESPECIALIDADES ===============
CREATE TABLE public.especialidades (
  especialidade_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo_tiss TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.especialidades TO authenticated;
GRANT ALL ON public.especialidades TO service_role;
ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read esp" ON public.especialidades FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_esp_upd BEFORE UPDATE ON public.especialidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== PROFISSIONAIS ===============
CREATE TABLE public.profissionais (
  profissional_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  especialidades JSONB NOT NULL DEFAULT '[]',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profissionais TO authenticated;
GRANT ALL ON public.profissionais TO service_role;
ALTER TABLE public.profissionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read prof" ON public.profissionais FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_prof_upd BEFORE UPDATE ON public.profissionais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== CONVENIOS ===============
CREATE TABLE public.convenios (
  convenio_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  planos JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.convenios TO authenticated;
GRANT ALL ON public.convenios TO service_role;
ALTER TABLE public.convenios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read conv" ON public.convenios FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_conv_upd BEFORE UPDATE ON public.convenios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== UNIDADES ===============
CREATE TABLE public.unidades (
  unidade_id INTEGER PRIMARY KEY,
  nome_fantasia TEXT NOT NULL,
  cidade TEXT,
  estado TEXT,
  bairro TEXT,
  cep TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read uni" ON public.unidades FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_uni_upd BEFORE UPDATE ON public.unidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== PROCEDIMENTOS ===============
CREATE TABLE public.procedimentos (
  procedimento_id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT,
  grupo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.procedimentos TO authenticated;
GRANT ALL ON public.procedimentos TO service_role;
ALTER TABLE public.procedimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read proc" ON public.procedimentos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_proc_upd BEFORE UPDATE ON public.procedimentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== PACIENTES (LGPD: minimo) ===============
CREATE TABLE public.pacientes (
  paciente_id INTEGER PRIMARY KEY,
  sexo TEXT,
  ano_nascimento INTEGER,
  cep TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  convenio_id INTEGER REFERENCES public.convenios(convenio_id) ON DELETE SET NULL,
  origem_id INTEGER,
  metricas JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pacientes TO authenticated;
GRANT ALL ON public.pacientes TO service_role;
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pac" ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_pac_upd BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_pac_cep ON public.pacientes(cep);
CREATE INDEX idx_pac_cidade ON public.pacientes(cidade);

-- =============== AGENDAMENTOS ===============
CREATE TABLE public.agendamentos (
  agendamento_id BIGINT PRIMARY KEY,
  data DATE NOT NULL,
  horario TIME,
  paciente_id INTEGER REFERENCES public.pacientes(paciente_id) ON DELETE SET NULL,
  profissional_id INTEGER REFERENCES public.profissionais(profissional_id) ON DELETE SET NULL,
  especialidade_id INTEGER REFERENCES public.especialidades(especialidade_id) ON DELETE SET NULL,
  procedimento_id INTEGER REFERENCES public.procedimentos(procedimento_id) ON DELETE SET NULL,
  status_id INTEGER REFERENCES public.status_agendamento(status_id) ON DELETE SET NULL,
  unidade_id INTEGER REFERENCES public.unidades(unidade_id) ON DELETE SET NULL,
  local_id INTEGER,
  canal_id INTEGER,
  convenio_id INTEGER REFERENCES public.convenios(convenio_id) ON DELETE SET NULL,
  plano_id INTEGER,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  telemedicina BOOLEAN NOT NULL DEFAULT false,
  encaixe BOOLEAN NOT NULL DEFAULT false,
  retorno BOOLEAN NOT NULL DEFAULT false,
  primeiro_agendamento BOOLEAN NOT NULL DEFAULT false,
  agendado_em TIMESTAMPTZ,
  agendado_por TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agendamentos TO authenticated;
GRANT ALL ON public.agendamentos TO service_role;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read ag" ON public.agendamentos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_ag_upd BEFORE UPDATE ON public.agendamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_ag_data ON public.agendamentos(data);
CREATE INDEX idx_ag_unidade ON public.agendamentos(unidade_id);
CREATE INDEX idx_ag_prof ON public.agendamentos(profissional_id);
CREATE INDEX idx_ag_esp ON public.agendamentos(especialidade_id);
CREATE INDEX idx_ag_status ON public.agendamentos(status_id);
CREATE INDEX idx_ag_conv ON public.agendamentos(convenio_id);

-- =============== FINANCEIRO ===============
CREATE TABLE public.financeiro_lancamentos (
  id BIGINT PRIMARY KEY,
  tipo TEXT NOT NULL,
  categoria TEXT,
  centro_custo TEXT,
  unidade_id INTEGER REFERENCES public.unidades(unidade_id) ON DELETE SET NULL,
  convenio_id INTEGER REFERENCES public.convenios(convenio_id) ON DELETE SET NULL,
  valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_vencimento DATE,
  data_pagamento DATE,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fin" ON public.financeiro_lancamentos FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_fin_upd BEFORE UPDATE ON public.financeiro_lancamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_fin_venc ON public.financeiro_lancamentos(data_vencimento);
CREATE INDEX idx_fin_pag ON public.financeiro_lancamentos(data_pagamento);

-- =============== SYNC LOGS ===============
CREATE TABLE public.sync_logs (
  id BIGSERIAL PRIMARY KEY,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  endpoint TEXT NOT NULL,
  registros INTEGER NOT NULL DEFAULT 0,
  sucesso BOOLEAN NOT NULL DEFAULT false,
  erro TEXT
);
GRANT SELECT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read logs" ON public.sync_logs FOR SELECT TO authenticated USING (true);
CREATE INDEX idx_logs_ini ON public.sync_logs(iniciado_em DESC);

-- =============== CACHE CEPs ===============
CREATE TABLE public.ceps_geocodificados (
  cep TEXT PRIMARY KEY,
  latitude NUMERIC,
  longitude NUMERIC,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  geocoded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ceps_geocodificados TO authenticated;
GRANT ALL ON public.ceps_geocodificados TO service_role;
ALTER TABLE public.ceps_geocodificados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read cep" ON public.ceps_geocodificados FOR SELECT TO authenticated USING (true);

-- =============== VIEWS MATERIALIZADAS ===============
CREATE MATERIALIZED VIEW public.vw_kpis_mensais AS
SELECT
  date_trunc('month', a.data)::date AS mes,
  a.unidade_id,
  COUNT(*)                                                            AS total_agendamentos,
  COUNT(*) FILTER (WHERE s.categoria = 'realizado')                   AS realizados,
  COUNT(*) FILTER (WHERE s.categoria = 'no_show')                     AS no_shows,
  CASE WHEN COUNT(*) FILTER (WHERE s.categoria IN ('realizado','no_show')) > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE s.categoria = 'no_show')
                  / COUNT(*) FILTER (WHERE s.categoria IN ('realizado','no_show')), 2)
       ELSE 0 END                                                     AS taxa_no_show,
  COALESCE(SUM(a.valor_total), 0)                                     AS receita_prevista,
  COALESCE(SUM(a.valor_total) FILTER (WHERE s.categoria = 'realizado'), 0) AS receita_realizada,
  COUNT(*) FILTER (WHERE a.primeiro_agendamento)                      AS pacientes_novos,
  CASE WHEN COUNT(*) FILTER (WHERE s.categoria = 'realizado') > 0
       THEN ROUND(SUM(a.valor_total) FILTER (WHERE s.categoria = 'realizado')::numeric
                  / COUNT(*) FILTER (WHERE s.categoria = 'realizado'), 2)
       ELSE 0 END                                                     AS ticket_medio
FROM public.agendamentos a
LEFT JOIN public.status_agendamento s ON s.status_id = a.status_id
GROUP BY 1, 2;
CREATE UNIQUE INDEX ux_kpis_mes_uni ON public.vw_kpis_mensais(mes, unidade_id);
GRANT SELECT ON public.vw_kpis_mensais TO authenticated;

CREATE MATERIALIZED VIEW public.vw_heatmap_agenda AS
SELECT
  EXTRACT(DOW FROM a.data)::int  AS dia_semana,
  EXTRACT(HOUR FROM a.horario)::int AS faixa_horaria,
  a.unidade_id,
  a.especialidade_id,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE s.categoria = 'no_show')       AS no_shows,
  COALESCE(SUM(a.valor_total),0)                        AS receita
FROM public.agendamentos a
LEFT JOIN public.status_agendamento s ON s.status_id = a.status_id
WHERE a.horario IS NOT NULL
GROUP BY 1,2,3,4;
CREATE UNIQUE INDEX ux_heat ON public.vw_heatmap_agenda(dia_semana, faixa_horaria, unidade_id, especialidade_id);
GRANT SELECT ON public.vw_heatmap_agenda TO authenticated;

CREATE MATERIALIZED VIEW public.vw_pacientes_por_regiao AS
SELECT
  p.cidade,
  p.bairro,
  a.especialidade_id,
  COUNT(DISTINCT p.paciente_id) AS pacientes
FROM public.pacientes p
LEFT JOIN public.agendamentos a ON a.paciente_id = p.paciente_id
GROUP BY 1,2,3;
CREATE UNIQUE INDEX ux_pac_reg ON public.vw_pacientes_por_regiao(cidade, bairro, especialidade_id);
GRANT SELECT ON public.vw_pacientes_por_regiao TO authenticated;

-- Função helper para refresh das views
CREATE OR REPLACE FUNCTION public.refresh_dashboard_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_kpis_mensais;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_heatmap_agenda;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.vw_pacientes_por_regiao;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_views() TO service_role;
