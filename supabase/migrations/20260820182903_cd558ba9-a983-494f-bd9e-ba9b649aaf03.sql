REVOKE EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() FROM anon;
REVOKE EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lab_enriquecer_faturamento() TO service_role;