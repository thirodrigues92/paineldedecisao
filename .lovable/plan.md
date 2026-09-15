# Comparação entre meses por profissional e por categoria

## Objetivo

Hoje dá para comparar um profissional com outro dentro de um período. Falta comparar o **mesmo** profissional (ou a mesma categoria) entre meses diferentes — por exemplo, o Bruno em junho, julho e agosto — para entender por que um mês foi melhor ou pior.

## Abordagem

Nada do que já existe muda. Entra uma **nova janela (aba) "Comparativo de períodos"** dentro do Faturamento Dinâmico, ao lado das janelas atuais (Faturamento por categoria, Faturamento por profissional, Comparativo mensal, Gráfico da tabela dinâmica). A mesma janela aparece também no link público, já que as duas telas usam o mesmo componente.

## Como funciona a nova janela

Controles no topo:

- **Comparar por**: Profissional ou Categoria.
- **Quem/qual**: seleção múltipla (ex.: só o Bruno, ou Bruno + Larissa; ou Cardiologia + Ultrassom).
- **Meses**: seleção múltipla de meses (ex.: junho, julho e agosto de 2026), com atalhos "últimos 3 meses" e "últimos 6 meses". Também aceita meses de anos diferentes (ago/2025 vs ago/2026).
- **Métrica**: Faturado, Recebido ou Quantidade de procedimentos.

Esta janela tem período próprio: **não depende do filtro de datas global**, para poder olhar meses fora do intervalo selecionado na página.

Saída:

1. **Gráfico de barras agrupadas** — um grupo por profissional/categoria, uma barra por mês, com valores e legenda.
2. **Tabela comparativa** — linhas = profissional/categoria; colunas = cada mês escolhido; e, quando são exatamente 2 meses, colunas extras de **variação em R$** e **variação em %**, com cor verde/vermelha e seta.
3. **Explicação da diferença** — ao clicar em uma linha, abre um detalhamento mostrando o que mudou entre os meses: procedimentos que mais subiram e que mais caíram, convênio/particular, e quantidade de atendimentos. É esse painel que responde "o que houve para o mês ter sido melhor ou pior".
4. **Busca (lupa)** no detalhamento, no mesmo padrão dos outros gráficos.
5. **Exportar CSV** do comparativo.

## Detalhes técnicos

- Novo componente `src/components/ComparativoPeriodosProfissionalCategoria.tsx`.
- Registrado como nova `TabsTrigger`/`TabsContent` em `src/components/FaturamentoDinamico.tsx` (única alteração em arquivo existente; as abas atuais ficam intactas).
- Consulta própria em `lab_producao_feegow`, paginada em blocos de 1.000, cobrindo apenas o intervalo mínimo necessário (do primeiro ao último mês selecionado), respeitando os filtros de unidade já existentes.
- Agregação em memória por `(profissional_nome | grupo_nome) x mês` somando `valor`, `valor_pago` e contagem; detalhamento agrega por `procedimento_nome` e `convenio_nome`.
- Os índices já criados em `data_execucao` cobrem essas consultas; sem migração de banco.

## Fora de escopo

- Nenhuma mudança nos gráficos, filtros ou telas existentes.
- Nenhuma alteração de sincronização ou de banco de dados.
