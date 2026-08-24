# Componente "Hoje" na tela inicial

Bloco fixo no topo do dashboard, sempre com o dia corrente (título "Hoje — 24/08/2026"), ignorando o seletor de período global. Aparece tanto na Visão Executiva autenticada quanto no painel público.

## O que verifiquei antes de planejar

- Hoje há 190 agendamentos: 103 realizados, 44 agendados, 32 cancelados, 4 no-show, 4 em atendimento, 3 "outro".
- `lab_producao_feegow` está com 0 registros para hoje (a produção só chega depois do faturamento), então o bloco "Hoje" será alimentado por `agendamentos` + `status_agendamento`, usando produção apenas como complemento de valor quando existir.
- **Tempo de atendimento real não existe hoje**: `agendamentos` só tem `horario` e `duracao_min` (bloco reservado). O payload bruto da produção traz apenas `HoraInicio` — não há `HoraFim` nem `TempoPermanencia` armazenados em lugar nenhum.

## 1. Cards de resumo do dia

Total, Realizados, Em atendimento, Aguardando, No-show, Cancelados — contagens por `status_agendamento.categoria` do dia atual. Cada card é clicável.

## 2. Procedimentos do dia

Ranking procedimento x quantidade, top 10 com "ver todos" (expande a lista completa). Nome vindo do join com `procedimentos`; fallback para o nome já disponível quando faltar.

## 3. Médicos atendendo hoje

Por profissional: total de agendamentos, já realizados, restantes (agendado + em atendimento). Laboratório entra como linha própria, com a mesma regra de agrupamento já usada no ranking de profissionais da tela inicial. Ordenado por total.

## 4. Tempo médio

Como não existe dado real de chegada/saída, o plano segue a opção (a) e depois (b) como fallback imediato:

- Card renderizado agora com rótulo explícito **"Tempo médio agendado"** e legenda "tempo reservado na agenda, não o realizado", calculado por `duracao_min` (geral e por profissional).
- Em paralelo, ampliar a sincronização de `/appoints/search` para gravar `HoraInicio`, `HoraFim` e `TempoPermanencia` em novas colunas de `agendamentos`. Assim que houver dados reais, o card passa a exibir também "Tempo médio de atendimento (real)" ao lado do agendado. Se a API não devolver esses campos para a clínica, o card permanece só com o valor agendado e uma nota de indisponibilidade — sem inventar número.

## 5. Drill-down

Cards e linhas de ranking abrem o drawer lateral padrão já usado no dashboard, listando: Horário, Paciente, Profissional, Procedimento, Status e Convênio, ordenado por horário.

## Detalhes técnicos

- Nova função `fetchHojeSnapshot()` em `src/lib/dashboard-data.ts`: busca paginada de `agendamentos` com `data = hoje`, joins de `status_agendamento`, `procedimentos`, `profissionais`, `pacientes` (nome) e `convenios`, retornando as linhas cruas do dia + agregados.
- Novo componente `src/components/HojePanel.tsx` com os cards, os dois rankings, o card de tempo e o `Sheet` de drill-down; consumido por `src/routes/_authenticated/dashboard.tsx` e `src/routes/public-dashboard.tsx`.
- Migração: colunas `hora_inicio_real`, `hora_fim_real`, `tempo_permanencia_min` em `agendamentos`, preenchidas por `supabase/functions/sync-feegow` a partir de `/appoints/search`.
- Bloco isolado do `FiltersContext`: usa `CURRENT_DATE` internamente e não reage ao seletor global.
