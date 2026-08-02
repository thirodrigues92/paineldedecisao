## O que está acontecendo

Os dois números vêm de **fontes diferentes**, por isso nunca batem:

| Bloco | Fonte | Total no banco |
|---|---|---|
| KPI "Receita prevista" / Faturamento por categoria | `financeiro_lancamentos` (faturas Feegow), tipo = receita | **R$ 2.033.733** (5.704 lançamentos) |
| Faturamento por tipo de serviço | `agendamentos.valor_total` (agenda precificada) | **R$ 1.092.113** (5.079 agendamentos com valor) |

Ou seja, faltam ~R$ 941 mil (46%) no gráfico por serviço, porque:
- só 5.079 dos 15.089 agendamentos têm `valor_total` preenchido pela Feegow;
- receitas que não nascem de agendamento (balcão, avulsos, parcelas, pacotes) não existem na agenda;
- o gráfico ignora linhas com valor 0.

Não é bug de cálculo — é ausência do vínculo entre a fatura e o procedimento faturado.

## Correção proposta

**1. Trazer o procedimento de cada fatura (raiz do problema)**
O endpoint `/financial/list-invoice` já retorna `itens` na resposta, mas a sincronização hoje descarta esse bloco. Vou:
- adicionar as colunas `procedimento_id` e `descricao_item` em `financeiro_lancamentos`;
- gravar o item da fatura na Edge Function `sync-feegow` (modo `financial`);
- rodar re-sync do período para preencher o histórico.

**2. Recalcular "Faturamento por tipo de serviço" com receita real**
O gráfico passa a somar `financeiro_lancamentos` (tipo = receita), classificando pelo nome do procedimento do item; o que continuar sem item vira "Não identificado", explicitamente visível.
Resultado: soma do gráfico = KPI de receita, sempre.

**3. Card de conciliação**
Abaixo do gráfico, uma linha curta: `Receita total R$ X · classificada R$ Y (Z%) · não identificada R$ W`, para o número nunca mais parecer "faltando" sem explicação.

**4. Fallback se a Feegow não devolver itens**
Se após o re-sync a maioria das faturas vier sem item, mantenho o gráfico na receita real e faço o rateio pelo procedimento do agendamento do mesmo paciente/dia quando houver correspondência; o restante fica em "Não identificado" com a nota de cobertura.

## Detalhes técnicos
- Migração: `ALTER TABLE public.financeiro_lancamentos ADD COLUMN procedimento_id integer, ADD COLUMN descricao_item text;` (grants/RLS já existentes permanecem).
- `supabase/functions/sync-feegow/index.ts`: mapear `invoice.itens[]` para as linhas de detalhe (fallback para `detalhes[].procedimento_id`).
- `src/lib/dashboard-data.ts`: incluir os novos campos no select financeiro.
- `src/routes/_authenticated/dashboard.tsx`: trocar a base do gráfico de serviço e adicionar a linha de conciliação; `src/lib/service-categories.ts` continua sendo o classificador.
