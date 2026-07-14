
-- Esconde MVs da Data API
REVOKE ALL ON public.vw_kpis_mensais FROM anon, authenticated;
REVOKE ALL ON public.vw_heatmap_agenda FROM anon, authenticated;
REVOKE ALL ON public.vw_pacientes_por_regiao FROM anon, authenticated;

-- Views regulares expostas ao frontend
CREATE OR REPLACE VIEW public.kpis_mensais WITH (security_invoker = true) AS
  SELECT * FROM public.vw_kpis_mensais;
CREATE OR REPLACE VIEW public.heatmap_agenda WITH (security_invoker = true) AS
  SELECT * FROM public.vw_heatmap_agenda;
CREATE OR REPLACE VIEW public.pacientes_por_regiao WITH (security_invoker = true) AS
  SELECT * FROM public.vw_pacientes_por_regiao;

GRANT SELECT ON public.kpis_mensais TO authenticated;
GRANT SELECT ON public.heatmap_agenda TO authenticated;
GRANT SELECT ON public.pacientes_por_regiao TO authenticated;

-- refresh function: apenas service_role
REVOKE ALL ON FUNCTION public.refresh_dashboard_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dashboard_views() TO service_role;

-- Também revoga update trigger fn de public
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
