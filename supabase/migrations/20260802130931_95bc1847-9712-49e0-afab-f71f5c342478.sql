DROP POLICY IF EXISTS "auth update pacientes metricas" ON public.pacientes;

CREATE POLICY "admin update pacientes" ON public.pacientes
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

REVOKE EXECUTE ON FUNCTION public.refresh_dashboard_views() FROM PUBLIC, anon, authenticated;