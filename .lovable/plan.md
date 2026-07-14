## Painel de Decisão Clínica — Plano de Construção

Sistema de BI para clínica que consome a API do Feegow, armazena no Lovable Cloud e exibe dashboards para gestores. Backend 100% no Lovable Cloud (banco, auth, Edge Functions, secrets, cron). Token do Feegow **nunca** aparece no frontend.

### Antes de começar — 2 confirmações rápidas

1. **Autenticação de usuários:** login por e-mail/senha (nativo do Cloud). Sem cadastro público — apenas usuários criados pelo admin acessam. Correto?
2. **Token do Feegow:** vou ativar o Lovable Cloud e, na etapa da Edge Function, abrir o formulário seguro para você colar o `FEEGOW_API_TOKEN`. Ok?

Se ambos "sim", sigo direto pela ordem abaixo.

---

### Fase 1 — Estrutura (entrega inicial)

**1. Ativar Lovable Cloud + Auth**
- Habilitar Cloud (Postgres, Auth, Edge Functions, Secrets, cron).
- Auth e-mail/senha; RLS em todas as tabelas: `SELECT` liberado apenas para `authenticated`.
- Rota `/auth` pública; demais rotas sob `_authenticated`.

**2. Schema do banco (migração única)**
Tabelas conforme seção 4 do brief:
`agendamentos`, `status_agendamento` (com coluna `categoria`), `profissionais`, `especialidades`, `convenios`, `unidades` (com `latitude`/`longitude`), `procedimentos`, `pacientes` (LGPD: só `sexo`, `ano_nascimento`, `cep`, `bairro`, `cidade`, `estado`, `lat/lng`, `convenio_id`, `origem_id`, `metricas jsonb`), `financeiro_lancamentos`, `sync_logs`, `ceps_geocodificados` (cache).
Views materializadas: `vw_kpis_mensais`, `vw_heatmap_agenda`, `vw_pacientes_por_regiao`.
GRANTs corretos + RLS + índices em colunas de filtro (data, unidade_id, profissional_id, especialidade_id, status_id).

**3. Edge Function `sync-feegow`**
- Header `x-access-token` lido de `Deno.env.get("FEEGOW_API_TOKEN")`.
- Utilitários testáveis: `parseFeegowDate` (DD-MM-YYYY → ISO), `parseCurrency` ("R$ 1.234,56" → numeric), `withRetry` (3 tentativas, backoff), `paginate` (start/offset até vazio).
- Valida `success === true`; grava sucesso/erro em `sync_logs`.
- Upsert idempotente por `agendamento_id`.
- Modos: `today` (hoje + 7 dias), `historical` (últimos 90 dias em janelas de 30), `support` (profissionais, especialidades, convênios, unidades, procedimentos, status), `financial`.
- Ao final, `REFRESH MATERIALIZED VIEW CONCURRENTLY` nas 3 views.

**4. Agendamento (pg_cron + pg_net)**
- `*/30 * * * *` → `sync-feegow?mode=today`
- `0 3 * * *` → `historical` + `support` + `financial`.

**5. Frontend — layout base**
- Tema escuro (`#0F1117` bg, `#1A1D27` cards, acento `#22D3EE`, âmbar para alertas), Inter, radius 12px — tokens em `src/styles.css`.
- Sidebar fixa (shadcn `Sidebar`) + barra de filtros globais no topo (período, unidade, profissional, especialidade, convênio/particular) via context/zustand.
- Recharts para gráficos; números pt-BR (`Intl.NumberFormat`).
- Skeletons + estados vazios + banner de erro de sync.

**6. Telas (nesta ordem)**
1. **Visão Executiva** — 6 KPIs com sparkline + variação; linha de evolução por status; barras empilhadas por especialidade; donut particular vs. convênio; card "Última sincronização" com botão manual.
2. **Heatmap da Agenda** — matriz dia×hora com toggle (volume / no-show / receita); dois heatmaps menores (unidade, especialidade); insight automático de pico/ociosidade.
3. **Análise de No-show** — KPI + evolução mensal; rankings horizontais (profissional, especialidade, convênio, canal); tabela detalhada com sparkline.
4. **Financeiro** — cards (receita realizada/prevista, despesas, resultado); barras mensais receita×despesa; barras por convênio/especialidade; linha de ticket médio; tabela de lançamentos.
5. **Profissionais** — grid de cards; painel lateral com detalhe (evolução, mix de procedimentos, heatmap individual).
6. **Comparativo de Unidades** — tabela com destaque melhor/pior; barras agrupadas.
7. **Configurações** — histórico de `sync_logs`; gestão de usuários; uploader CSV de métricas clínicas (`paciente_id, imc, ...` → `pacientes.metricas`); seção "Métricas clínicas personalizadas [Fase 2]".

**7. Qualidade transversal**
- "Exportar CSV" em tabelas, "Exportar PNG" em gráficos principais.
- Nenhuma tela quebra com tabela vazia.
- Comentários nas Edge Functions explicando regras 3.3.

---

### Fase 1.5 — Preparação da Fase 2 (mapa geográfico)
Entregue já nesta versão, sem construir a tela:
- Colunas `lat/lng/metricas` em `pacientes` (já no schema).
- Edge Function `geocode-pacientes` — ViaCEP + Nominatim, 1 req/s, cache em `ceps_geocodificados`, nunca reprocessa CEP.
- View `vw_pacientes_por_regiao`.
- Item "Mapa de Pacientes" na sidebar marcado como **Em breve** (desabilitado).
- Comentário `TODO Fase 2` no lugar da tela, listando: react-leaflet + leaflet.heat, filtros (especialidade/idade/sexo/convênio/IMC), toggle heatmap↔bolhas, marcadores das unidades, card de insight.

---

### Detalhes técnicos

- **Stack:** TanStack Start (já configurado) + Lovable Cloud (Supabase por baixo) + shadcn/ui + Recharts + Tailwind v4.
- **RLS:** todas as tabelas com `ENABLE ROW LEVEL SECURITY` e política `SELECT TO authenticated USING (true)`; escrita apenas via Edge Function com service role.
- **Leitura no frontend:** apenas das views materializadas e tabelas locais — nunca chama Feegow do browser.
- **Segurança do token:** `FEEGOW_API_TOKEN` como secret do Cloud (solicitado via `add_secret` no momento certo, com formulário seguro — não peço em chat).
- **Fase 2 tela do mapa:** fora do escopo desta entrega; só a infraestrutura de dados.

Confirma as 2 perguntas acima que já parto para a construção?
