-- Ativar RLS nas novas tabelas
ALTER TABLE public.lab_dim_procedimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_agendamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_invoice_header ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso simples para usuários autenticados (Módulo Lab é administrativo/interno)
CREATE POLICY "Acesso total para autenticados em lab_dim_procedimento" ON public.lab_dim_procedimento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total para autenticados em lab_dim_agendamento" ON public.lab_dim_agendamento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total para autenticados em lab_invoice_header" ON public.lab_invoice_header FOR ALL TO authenticated USING (true) WITH CHECK (true);
