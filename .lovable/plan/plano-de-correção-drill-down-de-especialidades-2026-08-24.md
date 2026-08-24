# Plano de Correção: Drill-down de Especialidades

O gráfico de "Especialidades por Faturamento" foi implementado recentemente, mas a interatividade (clique para ver detalhes) não está funcionando corretamente porque está tentando usar a mesma lógica de categorias de serviço, que usa chaves diferentes.

## Alterações Técnicas

### 1. Estado do Dashboard
- Adicionar o estado `detalheEspecialidade` no componente `DashboardPage` em `src/routes/_authenticated/dashboard.tsx`.

### 2. Lógica de Filtragem (Drill-down)
- Atualizar a variável `activeBucket` e o bloco de processamento de `byOrigem` para suportar a filtragem por `grupo_nome` (que representa a especialidade na tabela `lab_producao_feegow`).
- Garantir que a lógica de `filteredRows` inclua a condição: `if (detalheEspecialidade) return (r.grupo_nome || "Sem especialidade") === detalheEspecialidade;`.

### 3. Interface do Gráfico
- Alterar o `onClick` do gráfico de barras de especialidades para chamar `setDetalheEspecialidade` em vez de `setDetalhe`.

### 4. Componente Sheet (Gaveta lateral)
- Atualizar o componente `Sheet` para abrir quando `detalheEspecialidade` for diferente de nulo.
- Ajustar o título do `Sheet` para exibir o nome da especialidade selecionada.

## Verificação
- Clicar em uma barra no gráfico de Especialidades.
- Confirmar que a gaveta lateral abre com a lista correta de procedimentos e lançamentos financeiros associados àquela especialidade.
