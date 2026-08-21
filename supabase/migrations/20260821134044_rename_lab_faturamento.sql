ALTER TABLE public.lab_faturamento RENAME TO lab_faturamento_legado;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento_legado TO authenticated;
GRANT ALL ON public.lab_faturamento_legado TO service_role;
