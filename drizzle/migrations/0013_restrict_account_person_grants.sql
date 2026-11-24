REVOKE ALL ON TABLE public.fin_conta_pessoa FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.fin_conta_pessoa FROM authenticated;
GRANT SELECT ON TABLE public.fin_conta_pessoa TO authenticated;
GRANT ALL ON TABLE public.fin_conta_pessoa TO service_role;