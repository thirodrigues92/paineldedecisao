DO $$
DECLARE r record;
  tbls text[] := array['financeiro_lancamentos','lab_agendamento_enriquecido','fin_conta_pessoa','agendamentos','lab_repasse_feegow','lab_dim_categoria','fin_itens','lab_recebimento','lab_convenios','lab_dim_procedimento','lab_faturamento_legado','lab_dim_centro_custo','lab_sync_log','dim_categoria_dre','lab_invoice_header','lab_dim_agendamento','lab_paciente_geo_fila','lab_backfill_jobs','dre_feegow_linha_item','lab_producao_feegow','sync_logs','lab_paciente_sync_fila','pacientes','financeiro_recebimentos_baixados','dre_feegow_linha','lab_paciente_sync_estado','fin_plano_contas','dre_feegow_referencia','app_settings'];
  t text;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename = ANY(tbls)
      AND (coalesce(qual,'')='true' OR coalesce(with_check,'')='true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='signed_in_read') THEN
      EXECUTE format('CREATE POLICY signed_in_read ON public.%I FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL)', t);
    END IF;
  END LOOP;
END $$;

CREATE POLICY dre_cat_insert_managers ON public.dim_categoria_dre FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));
CREATE POLICY dre_cat_update_managers ON public.dim_categoria_dre FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor'));