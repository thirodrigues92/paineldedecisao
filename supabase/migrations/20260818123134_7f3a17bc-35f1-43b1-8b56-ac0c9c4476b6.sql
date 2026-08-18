-- 1. BANCO DE DADOS (Lovable Cloud / Postgres)

-- Tabelas com prefixo lab_ para isolamento
CREATE TABLE IF NOT EXISTS public.lab_faturamento (
  id                  uuid primary key default gen_random_uuid(),
  origem              text not null check (origem in ('particular','convenio')),
  documento_id        bigint not null,      -- invoice_id ou guia id
  item_id             bigint,
  lote_id             bigint,
  agendamento_id      bigint,
  atendimento_id      bigint,
  paciente_id         bigint,
  profissional_id     bigint,
  unidade_id          bigint,
  procedimento_id     bigint,
  codigo_procedimento text,
  convenio_id         bigint,
  plano_id            bigint,
  tabela_id           bigint,
  categoria_id        bigint,
  centro_custo_id     bigint,
  data_atendimento    date,
  data_competencia    date,
  data_vencimento     date,
  valor_bruto         numeric(14,2) default 0,
  desconto            numeric(14,2) default 0,
  acrescimo           numeric(14,2) default 0,
  valor_faturado      numeric(14,2) default 0,
  glosado             smallint default 0,
  motivo_glosa        text,
  guia_status         text,
  is_cancelado        boolean default false,
  payload_raw         jsonb,                -- JSON original da API, para auditoria
  synced_at           timestamptz default now(),
  unique (origem, documento_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.lab_recebimento (
  id                  uuid primary key default gen_random_uuid(),
  origem              text not null check (origem in ('particular','convenio')),
  documento_id        bigint not null,
  pagamento_id        bigint,
  data_pagamento      date,
  valor_recebido      numeric(14,2) default 0,
  forma_pagamento     bigint,
  bandeira_id         bigint,
  parcelas            int,
  conta_destino_id    bigint,
  payload_raw         jsonb,
  synced_at           timestamptz default now(),
  unique (origem, documento_id, pagamento_id)
);

CREATE TABLE IF NOT EXISTS public.lab_sync_log (
  id            uuid primary key default gen_random_uuid(),
  executado_em  timestamptz default now(),
  endpoint      text,
  parametros    jsonb,
  http_status   int,
  api_success   boolean,
  registros     int default 0,
  erro          text,
  amostra_raw   jsonb          -- primeiros 2 registros crus da resposta
);

CREATE TABLE IF NOT EXISTS public.lab_dim_categoria (
  id    bigint primary key,
  nome  text
);

CREATE TABLE IF NOT EXISTS public.lab_dim_centro_custo (
  id    bigint primary key,
  nome  text
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_lab_fat_comp ON public.lab_faturamento (data_competencia);
CREATE INDEX IF NOT EXISTS idx_lab_fat_conv ON public.lab_faturamento (origem, convenio_id);
CREATE INDEX IF NOT EXISTS idx_lab_rec_pag  ON public.lab_recebimento (data_pagamento);

-- View de análise
CREATE OR REPLACE VIEW public.lab_vw_faturado_x_recebido AS
SELECT
  f.origem,
  f.convenio_id,
  date_trunc('month', f.data_competencia)::date as mes,
  sum(f.valor_faturado)                                  as total_faturado,
  coalesce(sum(r.valor_recebido), 0)                     as total_recebido,
  sum(f.valor_faturado) - coalesce(sum(r.valor_recebido),0) as saldo_a_receber,
  sum(case when f.glosado = 1 then f.valor_faturado else 0 end) as total_glosado,
  round(100.0 * coalesce(sum(r.valor_recebido),0)
        / nullif(sum(f.valor_faturado),0), 2)            as pct_recebimento
FROM public.lab_faturamento f
LEFT JOIN public.lab_recebimento r
       ON r.documento_id = f.documento_id AND r.origem = f.origem
WHERE f.is_cancelado = false
GROUP BY 1,2,3;

-- RLS e Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_faturamento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_recebimento TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_sync_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_categoria TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_dim_centro_custo TO authenticated;
GRANT SELECT ON public.lab_vw_faturado_x_recebido TO authenticated;

GRANT ALL ON public.lab_faturamento TO service_role;
GRANT ALL ON public.lab_recebimento TO service_role;
GRANT ALL ON public.lab_sync_log TO service_role;
GRANT ALL ON public.lab_dim_categoria TO service_role;
GRANT ALL ON public.lab_dim_centro_custo TO service_role;

ALTER TABLE public.lab_faturamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_recebimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_dim_centro_custo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to lab_faturamento" ON public.lab_faturamento FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to lab_recebimento" ON public.lab_recebimento FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to lab_sync_log" ON public.lab_sync_log FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to lab_dim_categoria" ON public.lab_dim_categoria FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access to lab_dim_centro_custo" ON public.lab_dim_centro_custo FOR ALL TO authenticated USING (true);