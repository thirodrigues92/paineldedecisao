CREATE TABLE public.fin_itens (
item_id bigint PRIMARY KEY, invoice_id bigint, tipo_transacao text NOT NULL CHECK (tipo_transacao IN ('C','D')),
categoria_id bigint, centro_custo_id bigint, procedimento_id bigint, agendamento_id bigint,
quantidade numeric NOT NULL DEFAULT 0, valor numeric NOT NULL DEFAULT 0, desconto numeric NOT NULL DEFAULT 0, acrescimo numeric NOT NULL DEFAULT 0,
is_cancelado boolean NOT NULL DEFAULT false, data_competencia date, data_pagamento date, valor_pago numeric NOT NULL DEFAULT 0, unidade_id bigint,
payload_raw jsonb NOT NULL DEFAULT '{}'::jsonb, atualizado_em timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_itens TO authenticated;
GRANT ALL ON public.fin_itens TO service_role;
ALTER TABLE public.fin_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_itens_read ON public.fin_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY fin_itens_admin ON public.fin_itens FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX fin_itens_competencia_tipo ON public.fin_itens(data_competencia,tipo_transacao);
CREATE INDEX fin_itens_invoice ON public.fin_itens(invoice_id);
COMMENT ON COLUMN public.fin_itens.valor_pago IS 'Invoice payment total repeated on each item for auditing; never sum across items as receipt revenue.';