
CREATE TABLE IF NOT EXISTS public.lab_producao_feegow (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feegow_id bigint UNIQUE,
    paciente_id bigint,
    paciente_nome text,
    agendamento_id bigint,
    data_execucao date,
    hora_inicio text,
    profissional_id bigint,
    profissional_nome text,
    procedimento_id bigint,
    procedimento_nome text,
    valor numeric(15,2),
    convenio_nome text,
    unidade_id bigint,
    payload_raw jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_producao_feegow TO authenticated;
GRANT ALL ON public.lab_producao_feegow TO service_role;

ALTER TABLE public.lab_producao_feegow ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_producao_feegow' AND policyname = 'Users can select production data') THEN
        CREATE POLICY "Users can select production data" ON public.lab_producao_feegow FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
