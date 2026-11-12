CREATE TABLE public.financeiro_recebimentos_baixados (
 pagamento_id bigint PRIMARY KEY,
 invoice_id bigint,
 data_baixa date NOT NULL,
 valor numeric(18,2) NOT NULL,
 descricao text,
 categoria text,
 tipo_conta integer,
 conta_id bigint,
 forma_pagamento integer,
 origem text NOT NULL DEFAULT 'financial/list-invoice?tipo_transacao=C:pagamentos',
 payload_raw jsonb NOT NULL,
 synced_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financeiro_recebimentos_baixados TO authenticated;
GRANT ALL ON public.financeiro_recebimentos_baixados TO service_role;
ALTER TABLE public.financeiro_recebimentos_baixados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read financial receipts" ON public.financeiro_recebimentos_baixados FOR SELECT TO authenticated USING (true);
CREATE INDEX financeiro_recebimentos_baixa_idx ON public.financeiro_recebimentos_baixados(data_baixa);
COMMENT ON TABLE public.financeiro_recebimentos_baixados IS 'One actual Feegow accounts-receivable payment per pagamento_id; values converted from cents, dates from pagamentos.data. Never invoice or production amounts.';
DO $$
DECLARE v text; def text;
BEGIN
 FOREACH v IN ARRAY ARRAY['vw_dre_mensal','vw_dre_mensal_caixa'] LOOP
  def := pg_get_viewdef(('public.' || v)::regclass, true);
  def := regexp_replace(def, 'WITH receita AS \(.*?\), desp AS \(', 'WITH receita AS (SELECT to_char(data_baixa,''YYYY-MM'') AS mes, coalesce(sum(valor),0)::numeric AS valor FROM public.financeiro_recebimentos_baixados GROUP BY 1), desp AS (', 's');
  IF position('lab_producao_feegow' in def)>0 OR position('financeiro_recebimentos_baixados' in def)=0 THEN RAISE EXCEPTION 'Revenue replacement failed for %', v; END IF;
  EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker=true) AS %s',v,def);
 END LOOP;
END $$;
GRANT SELECT ON public.vw_dre_mensal, public.vw_dre_mensal_caixa TO authenticated;