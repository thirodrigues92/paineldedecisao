---
name: Formas de Pagamento Drill-down
description: Implementação de drill-down lateral ao clicar no gráfico de formas de pagamento no dashboard (admin e público).
type: feature
---
# Plano: Drill-down por Forma de Pagamento

Atualmente, o dashboard possui um gráfico de "Formas de Pagamento (Particular)". Ao clicar nas barras, ele abre o `Sheet` de detalhes, mas a filtragem não está sendo feita especificamente pela forma de pagamento selecionada, ou o estado não reflete isso claramente.

## Objetivos
1. Adicionar um novo estado `detalhePagamento` para rastrear a forma de pagamento selecionada.
2. Atualizar a lógica de filtragem (`activeBucket` e `filteredRows`) para considerar `detalhePagamento`.
3. Garantir que o `Sheet` exiba o título correto e os itens filtrados pela forma de pagamento.
4. Aplicar as mudanças em `src/routes/_authenticated/dashboard.tsx` e `src/routes/public-dashboard.tsx`.

## Alterações Técnicas

### Dashboard (Admin e Público)
- Adicionar `const [detalhePagamento, setDetalhePagamento] = useState<string | null>(null);`.
- No componente `BarChart` do faturamento particular:
    - Ajustar o `onClick` para `setDetalhePagamento(d.name)`.
- Na lógica do `activeBucket`:
    - Se `detalhePagamento` estiver ativo, filtrar as `labRows` onde `forma_pagamento` corresponde à categoria (lidando com "Múltiplas Formas").
- No `Sheet`:
    - Atualizar `onOpenChange` para resetar `detalhePagamento`.
    - Atualizar o `SheetTitle` para exibir a forma de pagamento.
