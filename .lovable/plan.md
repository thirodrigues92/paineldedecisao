# Plano: Detalhamento do Gráfico Particular vs. Convênio

Adicionar interatividade ao gráfico "Particular vs. Convênio" para que o usuário possa visualizar os dados detalhados (procedimentos e lançamentos) ao clicar nas fatias do gráfico.

## Alterações

### 1. Dashboard (`src/routes/_authenticated/dashboard.tsx`)
- Adicionar um novo estado `detalheDonut` para controlar o filtro por origem (Particular/Convênio).
- Criar novos buckets de dados `detalheDonutBucket` e `detalheDonutItens` baseados na origem selecionada.
- Adicionar evento `onClick` às fatias do `PieChart` para abrir o `Sheet` de detalhamento.
- Atualizar o `Sheet` para exibir o título e descrição corretos quando a origem for selecionada.
- Garantir que a lógica de "Particular vs. Convênio" no gráfico coincida com a lógica de enriquecimento de dados da `lab_producao_feegow`.

## Detalhes Técnicos
- Utilizar o componente `Sheet` já existente para reaproveitar a UI de detalhamento de itens.
- Filtrar `labRows` pela coluna `convenio_nome` (Particular vs. Outros) para compor a lista de itens.
- Adaptar o `SheetHeader` para refletir se o usuário está vendo uma categoria de serviço ou uma origem (Particular/Convênio).
