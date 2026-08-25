# Gráficos vazios em 24/08 e 25/08

## O que foi verificado

- Os gráficos da Visão Executiva leem exclusivamente a tabela de produção (`lab_producao_feegow`).
- Nessa tabela, o último dia com registros é **21/08/2026** (417 itens). Não existe nenhuma linha para 24/08 nem 25/08. A gravação mais recente aconteceu em **23/08/2026**.
- A tabela de agendamentos, por outro lado, tem dados normais nessas datas (190 em 24/08, 245 em 25/08). É daí que vem a sensação de "os dados estão vindo": os blocos que usam agendamentos aparecem, mas todo gráfico que depende de produção fica zerado.

Conclusão: não é bug de gráfico nem de filtro de data — a sincronização da produção (relatório detalhado da Feegow) não roda desde 23/08, então não há faturamento carregado para esses dias.

## Correção proposta

1. Rodar a sincronização de produção para a janela 22/08 a 26/08 e conferir se a Feegow devolve itens para esses dias (se devolver zero, o problema é do lado da origem/token e isso será reportado com o retorno bruto).
2. Investigar por que a sincronização parou em 23/08: revisar o registro de execuções e os erros da função de sync de produção.
3. Tornar a lacuna visível na tela: quando o período selecionado não tiver nenhum registro de produção, exibir um aviso claro ("sem dados de produção sincronizados neste período — última sincronização em DD/MM") em vez de gráficos vazios.
4. Opcional, se desejar: agendar a sincronização de produção diariamente para evitar novas lacunas silenciosas.

## Detalhes técnicos

- Fonte dos gráficos: `fetchLabProducaoRows` em `src/lib/dashboard-data.ts`, filtrando `data_execucao` entre início e fim.
- Sincronização: `labSyncProducao` em `src/lib/lab-faturamento.functions.ts` (endpoint `reports/generate` production-detalhado).
- Aviso de lacuna: adicionado nas telas `src/routes/_authenticated/dashboard.tsx` e `src/routes/public-dashboard.tsx`, comparando o intervalo do filtro com a data máxima de `data_execucao`.
