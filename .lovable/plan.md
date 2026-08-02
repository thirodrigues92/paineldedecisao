## Objetivo

Adicionar na Visão Executiva um gráfico de **faturamento por categoria de serviço** — Consultas, Exames laboratoriais, Imagem/Ultrassom, Cardiologia diagnóstica, Aplicações injetáveis, Ocupacional/Atestados, Outros — mostrando quanto cada uma faturou e quanto representa do total.

## Por que não usar a categoria financeira

Já verifiquei no banco: 5.610 das receitas (R$ 1,39 mi) estão como "Não classificado" porque a Feegow não devolve a categoria nessas faturas. Ela não serve para responder "quanto consultas faturaram".

A fonte que responde é o **procedimento do agendamento** (`agendamentos.valor_total` + `procedimentos.nome`), que já está na base e cobre R$ 1,09 mi em 15.089 agendamentos. Confirmei também:
- 5.926 agendamentos são de consulta, 3.408 de imagem/ultrassom, 154 de aplicações injetáveis;
- **nenhum procedimento cadastrado tem "vacina" no nome** — se a clínica aplica vacinas, elas estão registradas com outro nome ou fora da agenda, então essa fatia não vai aparecer enquanto não houver esse cadastro;
- 10.010 agendamentos estão com valor zero (não precificados na agenda), então o gráfico mostra o faturamento capturado na agenda, não o caixa total — isso ficará escrito no card.

## O que será construído

1. **Classificador de categorias de serviço** (novo arquivo em `src/lib/`), no mesmo estilo do que já existe para aplicações injetáveis: regras por nome do procedimento devolvendo a categoria. Regras iniciais:
   - Consultas: nome começa com/contém "consulta", "retorno"
   - Exames laboratoriais: hemograma, glicose, colesterol, TSH, urina, cultura, sorologia, toxicológico laboratorial etc.
   - Imagem e ultrassom: USG, ultrassom, ecocardiograma, doppler, raio-x, densitometria
   - Cardiologia diagnóstica: ECG, holter, MAPA, teste ergométrico
   - Aplicações injetáveis e vacinas: reaproveita as regras já existentes de injetáveis + termos de vacina/imunização
   - Procedimentos e cirurgias: biópsia, cauterização, sutura, exérese, infiltração
   - Ocupacional e atestados: ASO, admissional, demissional, toxicológico CNH, laudo
   - Outros: o que não casar
2. **Gráfico novo na Visão Executiva**: barras horizontais por categoria, ordenadas por faturamento, com valor em reais, % do total e nº de atendimentos no tooltip; a categoria de menor faturamento destacada, no mesmo padrão do gráfico de categoria financeira que já está lá.
3. **Card lateral "Composição do faturamento"**: lista compacta categoria → valor → % com barra de participação, para leitura rápida de quem representa quanto.
4. Ambos respeitam os filtros globais (período, unidade, especialidade, profissional, convênio) e reaproveitam os dados já carregados pela tela — sem consulta extra ao banco e sem migração.
5. Nota no rodapé do card informando a cobertura: quantos agendamentos do período têm valor lançado, para o gestor saber que a base é a agenda precificada.

## Detalhes técnicos

- Edição em `src/routes/_authenticated/dashboard.tsx`, reutilizando `fetchDashboardAppointments` (já traz `procedimentos.nome` e `valor_total`).
- Novo `src/lib/service-categories.ts` com a função de classificação, exportada para reuso em outras telas depois.
- Cores via `var(--chart-1..5)` e `chart-theme.ts`, como nos demais gráficos.
