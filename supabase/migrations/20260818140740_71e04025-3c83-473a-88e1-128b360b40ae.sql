-- 1. Tabelas de Dimensão
CREATE TABLE IF NOT EXISTS public.lab_dim_procedimento (
    procedimento_id INTEGER PRIMARY KEY,
    nome TEXT,
    grupo_id INTEGER,
    grupo_nome TEXT,
    tipo TEXT,
    criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_dim_agendamento (
    agendamento_id INTEGER PRIMARY KEY,
    convenio_id INTEGER,
    plano_id INTEGER,
    paciente_id INTEGER,
    profissional_id INTEGER,
    unidade_id INTEGER,
    status_id INTEGER,
    data DATE,
    canal_id INTEGER,
    especialidade_id INTEGER,
    criado_em TIMESTAMPTZ DEFAULT now()
);

-- 2. Header de Fatura (Grão da conta)
CREATE TABLE IF NOT EXISTS public.lab_invoice_header (
    invoice_id INTEGER PRIMARY KEY,
    data DATE,
    valor_total NUMERIC,
    paciente_id INTEGER,
    unidade_id INTEGER,
    criado_em TIMESTAMPTZ DEFAULT now()
);

-- 3. Ajustes na lab_faturamento
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS grupo_id INTEGER;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS grupo_nome TEXT DEFAULT 'Não classificado';
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS convenio_id INTEGER;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS plano_id INTEGER;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS especialidade_id INTEGER;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS valor_bruto NUMERIC DEFAULT 0;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS desconto NUMERIC DEFAULT 0;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS acrescimo NUMERIC DEFAULT 0;
ALTER TABLE public.lab_faturamento ADD COLUMN IF NOT EXISTS origem TEXT DEFAULT 'avulso';

-- 4. Grants
GRANT ALL ON public.lab_dim_procedimento TO authenticated, service_role;
GRANT ALL ON public.lab_dim_agendamento TO authenticated, service_role;
GRANT ALL ON public.lab_invoice_header TO authenticated, service_role;
GRANT ALL ON public.lab_faturamento TO authenticated, service_role;

-- 5. View de Faturado x Recebido atualizada (Drop antes para evitar erro de drop column)
DROP VIEW IF EXISTS public.lab_vw_faturado_x_recebido;

CREATE OR REPLACE VIEW public.lab_vw_faturado_x_recebido AS
SELECT 
    f.origem,
    f.grupo_nome,
    COALESCE(to_char(f.data_competencia, 'YYYY-MM'), 'Sem data') as mes,
    SUM(f.valor_faturado) as total_faturado,
    SUM(COALESCE(r.valor_recebido, 0)) as total_recebido,
    SUM(f.valor_faturado) - SUM(COALESCE(r.valor_recebido, 0)) as saldo_a_receber
FROM public.lab_faturamento f
LEFT JOIN (
    SELECT origem, documento_id, SUM(valor_recebido) as valor_recebido
    FROM public.lab_recebimento
    GROUP BY origem, documento_id
) r ON f.origem = r.origem AND f.documento_id = r.documento_id
WHERE f.is_cancelado = false
GROUP BY f.origem, f.grupo_nome, mes;

GRANT SELECT ON public.lab_vw_faturado_x_recebido TO authenticated;