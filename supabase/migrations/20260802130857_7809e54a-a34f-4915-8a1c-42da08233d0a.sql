CREATE TABLE IF NOT EXISTS public.geo_bairros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bairro text NOT NULL,
  cidade text NOT NULL,
  estado text NOT NULL DEFAULT '',
  latitude numeric,
  longitude numeric,
  geocoded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bairro, cidade, estado)
);

GRANT SELECT ON public.geo_bairros TO authenticated;
GRANT ALL ON public.geo_bairros TO service_role;

ALTER TABLE public.geo_bairros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read geo_bairros" ON public.geo_bairros
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_geo_bairros_updated_at
  BEFORE UPDATE ON public.geo_bairros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Upload de métricas clínicas (CSV) pelo painel
GRANT UPDATE ON public.pacientes TO authenticated;
CREATE POLICY "auth update pacientes metricas" ON public.pacientes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pacientes_bairro_cidade ON public.pacientes (cidade, bairro);
CREATE INDEX IF NOT EXISTS idx_pacientes_latlng ON public.pacientes (latitude, longitude);

CREATE OR REPLACE VIEW public.vw_demanda_especialidade_por_regiao
WITH (security_invoker = true) AS
SELECT
  p.bairro,
  p.cidade,
  p.estado,
  e.nome AS especialidade,
  COUNT(a.agendamento_id) AS demanda,
  COUNT(a.agendamento_id) FILTER (WHERE sa.categoria = 'realizado') AS atendimentos,
  COUNT(a.agendamento_id) FILTER (WHERE sa.categoria = 'no_show') AS no_shows
FROM public.agendamentos a
JOIN public.pacientes p ON a.paciente_id = p.paciente_id
LEFT JOIN public.especialidades e ON a.especialidade_id = e.especialidade_id
LEFT JOIN public.status_agendamento sa ON a.status_id = sa.status_id
WHERE p.bairro IS NOT NULL AND p.cidade IS NOT NULL
GROUP BY p.bairro, p.cidade, p.estado, e.nome;

CREATE OR REPLACE VIEW public.vw_heatmap_pacientes
WITH (security_invoker = true) AS
SELECT
  latitude,
  longitude,
  COUNT(paciente_id) AS densidade,
  ARRAY_AGG(DISTINCT bairro) AS bairros,
  MIN(cidade) AS cidade
FROM public.pacientes
WHERE latitude IS NOT NULL AND longitude IS NOT NULL
GROUP BY latitude, longitude;

GRANT SELECT ON public.vw_demanda_especialidade_por_regiao TO authenticated;
GRANT SELECT ON public.vw_heatmap_pacientes TO authenticated;