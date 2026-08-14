# Corrigir valores dos atendimentos (14/08/2026)

## O que os dados mostram hoje

Consultei o banco para 14/08/2026:

| Métrica | Feegow (relatório) | Painel (banco) |
|---|---|---|
| Quantidade total | 188 | 189 |
| Valor total | 27.470,34 | 19.299,05 |
| Atendidos (qtd) | 152 | 152 |
| Atendidos (valor) | 20.615,23 | 13.880,25 |

A quantidade bate (152 atendidos exatos). O que não bate é o **valor**.

Causa confirmada: **100 dos 189 agendamentos do dia estão com valor 0** no banco. A sincronização lê o valor apenas do campo de topo do agendamento (`valor_total`/`total_value`), e a Feegow não devolve esse campo preenchido em boa parte dos registros — o valor real está na lista de procedimentos de cada agendamento (a chamada já pede `list_procedures=1`, mas esses itens não são somados).

A diferença de 1 registro na quantidade (189 x 188) é provavelmente um agendamento com status que o relatório da Feegow não conta (ex.: excluído/remarcado) — será verificado junto.

## O que fazer

1. **Diagnóstico bruto (primeiro passo obrigatório)**: rodar um probe na Feegow para um dia conhecido e imprimir o JSON cru de agendamentos com valor 0, listando todas as chaves disponíveis (itens de procedimento, preço por item, valor de convênio x particular). Sem interpretação — dados brutos.
2. **Corrigir a extração do valor** na sincronização: somar o valor dos procedimentos do agendamento quando o campo de topo vier zerado/ausente, cobrindo as variações de nome de campo que o probe revelar.
3. **Guardar o detalhe**: gravar também a quantidade de procedimentos e o valor por procedimento do agendamento, para permitir conferência linha a linha contra o relatório da Feegow.
4. **Ressincronizar** o período afetado e comparar novamente 14/08/2026 contra os números do relatório (188 / 27.470,34 / 152 / 20.615,23), documentando qualquer resíduo.
5. **Explicar a diferença de contagem**: identificar qual agendamento entra no painel e não no relatório (status) e alinhar o critério de contagem.
6. **Aba de conferência na tela de Auditoria**: uma comparação por dia — quantidade, valor e média por status — para você bater com o relatório da Feegow a qualquer momento.

## Detalhes técnicos

- `supabase/functions/sync-feegow/index.ts`, função `syncAgendamentos`: `valor_total` hoje usa apenas `parseCurrency(r.valor_total ?? r.valor_total_agendamento ?? r.total_value ?? r.valor ?? 0)`. Passa a somar os itens de `r.procedimentos / r.procedures / r.itens` quando o topo for 0.
- Novos campos em `agendamentos` via migração: `qtd_procedimentos` (int) e `procedimentos_detalhe` (jsonb) para rastreabilidade.
- Modo de probe temporário (`?mode=probe-appoint&data=DD-MM-YYYY`) para inspeção do JSON cru, sem escrever no banco.
- Backfill: reexecutar `syncAgendamentos` no intervalo histórico após a correção.
