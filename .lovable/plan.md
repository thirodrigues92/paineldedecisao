# Plano: Campo de pesquisa em todos os painéis de detalhamento

Hoje, ao clicar em um gráfico da visão de faturamento (categoria de serviço, Particular vs. Convênio, formas de pagamento, especialidades, profissionais, pacientes novos e no-show), abre-se uma gaveta lateral com os lançamentos — mas sem busca. O objetivo é ter uma lupa de pesquisa em TODOS esses detalhamentos, para achar qualquer dado avulso (paciente, procedimento, convênio, valor, data).

## Alterações

### 1. Dashboard administrativo (`src/routes/_authenticated/dashboard.tsx`)
- Adicionar estado `buscaDetalhe` na página, zerado sempre que a gaveta abrir/trocar de contexto.
- No `Sheet` de detalhamento (único, usado por todos os drill-downs), incluir um campo de pesquisa com ícone de lupa logo abaixo do título.
- Aplicar o filtro sobre `detalheItens`, pesquisando em todos os níveis:
  - nome do procedimento/item;
  - nome do paciente, convênio, profissional e data dentro dos lançamentos de cada item;
  - valor (aceita digitação parcial, ex.: "150").
- Quando houver busca ativa, expandir automaticamente os itens que tiverem lançamentos correspondentes, mostrando apenas os lançamentos filtrados.
- Manter o contador do cabeçalho mostrando os totais filtrados (ex.: "12 lançamentos encontrados").

### 2. Dashboard público (`src/routes/public-dashboard.tsx`)
- Replicar exatamente a mesma lógica e campo de pesquisa no `Sheet` equivalente, mantendo as duas telas idênticas.

### 3. Cobertura
O campo aparecerá em todos os contextos do detalhamento:
- Categorias de serviço
- Particular vs. Convênio
- Formas de pagamento (Cartão, Pix, Dinheiro etc.)
- Especialidades
- Profissionais
- Pacientes novos
- No-show (busca por paciente/procedimento, sem valores)

### Observação
O gráfico de médicos por especialidade (`GraficoMedicosPorEspecialidade`) já possui busca própria — não será alterado.

## Verificação
- Abrir cada tipo de detalhamento e confirmar que o campo de pesquisa aparece.
- Pesquisar por um paciente avulso e por um valor, conferindo que os resultados filtram corretamente.
- Confirmar que a tela pública replica o comportamento.
