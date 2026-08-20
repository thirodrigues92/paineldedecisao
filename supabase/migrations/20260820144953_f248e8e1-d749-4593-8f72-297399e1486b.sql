REVOKE ALL ON FUNCTION public.lab_enriquecer_faturamento() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lab_enriquecer_faturamento() FROM anon;
REVOKE ALL ON FUNCTION public.lab_enriquecer_faturamento() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() TO service_role;