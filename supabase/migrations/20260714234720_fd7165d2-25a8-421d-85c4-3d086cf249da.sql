
-- 1) app_settings
CREATE TABLE public.app_settings (
  chave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin write settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_app_settings_upd BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_settings (chave, valor) VALUES
  ('meta_ocupacao_pct', '85'::jsonb),
  ('meta_no_show_pct', '10'::jsonb),
  ('capacidade_diaria_min', '480'::jsonb)
ON CONFLICT DO NOTHING;

-- 2) Views analíticas (SECURITY INVOKER via views padrão)

CREATE OR REPLACE VIEW public.vw_analytics_lead_time AS
SELECT
  a.especialidade_id,
  e.nome AS especialidade,
  a.data,
  GREATEST(0, EXTRACT(EPOCH FROM (a.data::timestamp - a.agendado_em)) / 86400.0)::numeric(10,2) AS lead_days
FROM public.agendamentos a
LEFT JOIN public.especialidades e ON e.especialidade_id = a.especialidade_id
WHERE a.agendado_em IS NOT NULL;

GRANT SELECT ON public.vw_analytics_lead_time TO authenticated;

CREATE OR REPLACE VIEW public.vw_analytics_abc_procedimentos AS
WITH agg AS (
  SELECT
    a.procedimento_id,
    COALESCE(p.nome, 'Sem procedimento') AS procedimento,
    SUM(a.valor_total)::numeric(14,2) AS receita,
    COUNT(*)::int AS volume
  FROM public.agendamentos a
  LEFT JOIN public.procedimentos p ON p.procedimento_id = a.procedimento_id
  LEFT JOIN public.status_agendamento s ON s.status_id = a.status_id
  WHERE s.categoria = 'realizado'
  GROUP BY a.procedimento_id, p.nome
),
ranked AS (
  SELECT *,
    SUM(receita) OVER () AS total_receita,
    SUM(receita) OVER (ORDER BY receita DESC ROWS UNBOUNDED PRECEDING) AS receita_acum
  FROM agg
)
SELECT
  procedimento_id, procedimento, receita, volume,
  ROUND((receita_acum / NULLIF(total_receita, 0)) * 100, 2) AS pct_acumulado,
  CASE
    WHEN (receita_acum / NULLIF(total_receita, 0)) <= 0.80 THEN 'A'
    WHEN (receita_acum / NULLIF(total_receita, 0)) <= 0.95 THEN 'B'
    ELSE 'C'
  END AS classe
FROM ranked
ORDER BY receita DESC;

GRANT SELECT ON public.vw_analytics_abc_procedimentos TO authenticated;

CREATE OR REPLACE VIEW public.vw_analytics_ocupacao_prof AS
SELECT
  a.profissional_id,
  pr.nome AS profissional,
  a.data,
  SUM(a.duracao_min)::int AS minutos_ocupados,
  COUNT(*)::int AS agendamentos
FROM public.agendamentos a
LEFT JOIN public.profissionais pr ON pr.profissional_id = a.profissional_id
LEFT JOIN public.status_agendamento s ON s.status_id = a.status_id
WHERE s.categoria IN ('realizado', 'agendado', 'em_atendimento')
GROUP BY a.profissional_id, pr.nome, a.data;

GRANT SELECT ON public.vw_analytics_ocupacao_prof TO authenticated;

CREATE OR REPLACE VIEW public.vw_analytics_ticket_medio_esp AS
SELECT
  a.especialidade_id,
  COALESCE(e.nome, 'Sem especialidade') AS especialidade,
  COUNT(*)::int AS volume,
  AVG(NULLIF(a.valor_total, 0))::numeric(14,2) AS ticket_medio,
  SUM(a.valor_total)::numeric(14,2) AS receita
FROM public.agendamentos a
LEFT JOIN public.especialidades e ON e.especialidade_id = a.especialidade_id
LEFT JOIN public.status_agendamento s ON s.status_id = a.status_id
WHERE s.categoria = 'realizado'
GROUP BY a.especialidade_id, e.nome;

GRANT SELECT ON public.vw_analytics_ticket_medio_esp TO authenticated;

CREATE OR REPLACE VIEW public.vw_analytics_receita_mensal AS
SELECT
  date_trunc('month', data_pagamento)::date AS mes,
  SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END)::numeric(14,2) AS receita,
  SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END)::numeric(14,2) AS despesa
FROM public.financeiro_lancamentos
WHERE status = 'pago' AND data_pagamento IS NOT NULL
GROUP BY 1
ORDER BY 1;

GRANT SELECT ON public.vw_analytics_receita_mensal TO authenticated;
