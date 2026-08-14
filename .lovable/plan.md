# Valores zerados no Relatório de Atendimentos

## O que foi confirmado no banco

O atendimento citado (Alice Vieira da Silva, 14/08/2026 13:30, CONSULTA GINECOLOGICA) está gravado assim:

- `valor_total` = 0,00
- `valor_estimado` = 280,00
- `valor_origem` = `sem_valor`
- `tabela_id` = 13 (tabela de convênio), `convenio_id` = 2

No dia 14/08/2026 são 98 atendimentos nessa mesma situação (R$ 0 real, R$ 18.763 estimado) contra 90 com valor vindo da Feegow (R$ 20.362,70).

Causa: para agendamentos ligados à tabela de convênio, a API da Feegow devolve o preço nulo tanto no topo do agendamento quanto em cada procedimento. A tela da Feegow mostra o preço porque lê a tabela de preços do convênio, que a API não expõe nesse endpoint. O que temos hoje é o preço de referência da tabela particular, guardado em `valor_estimado`.

## O que fazer

1. Exibir o valor de referência no relatório em vez de R$ 0,00 puro:
   - Coluna "Valor" passa a mostrar `valor_total` quando existe; quando é zero e há `valor_estimado`, mostra esse valor com marcação visual (estilo esmaecido + selo "estimado") e tooltip explicando que a Feegow não devolveu o preço do convênio via API.
   - Mantém R$ 0,00 apenas quando não há nem estimativa.
2. Adicionar ao filtro atual uma opção de origem do valor: Todos / Valor confirmado / Valor estimado, para o usuário isolar rapidamente os 98 casos do dia.
3. Nos cards de resumo, separar em três números: valor confirmado, valor estimado e total combinado, para o número bater com a Feegow sem misturar receita real com estimativa.
4. Tentar recuperar o preço real do convênio na sincronização: sondar os endpoints de tabela de preço por convênio da Feegow (`/service/list-price`, `/service/values`, `/insurance/price-table` e variantes) em modo diagnóstico. Se algum responder, gravar o preço correto em `valor_total` com `valor_origem = 'tabela_convenio'`; se todos retornarem erro (como já aconteceu com os endpoints de recebíveis), o relatório permanece com a estimativa marcada e isso fica registrado no log de sync.

## Detalhes técnicos

- `src/routes/_authenticated/relatorio-atendimentos.tsx`: usar `valor_estimado` como fallback na coluna Valor, novo filtro de origem do valor, cards separados.
- `src/lib/dashboard-data.ts`: trazer `valor_estimado` e `valor_origem` junto dos agendamentos do relatório.
- `supabase/functions/sync-feegow/index.ts`: novo modo `probe-preco` para a cascata de endpoints de tabela de preço e, se houver retorno útil, gravação do preço de convênio no agendamento.
