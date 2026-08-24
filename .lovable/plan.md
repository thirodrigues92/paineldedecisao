# Plano: Detalhamento de Novos Pacientes no Dashboard

Adicionar uma nova seção no dashboard focada em pacientes que realizaram seu primeiro atendimento (primeira consulta/exame) no período selecionado, detalhando procedimentos, médicos e origem (Plano vs Particular).

## Alterações

### 📊 Backend & Dados
- A tabela `agendamentos` já possui a coluna `primeiro_agendamento` (boolean).
- A tabela `lab_producao_feegow` **não** possui essa informação diretamente. Precisamos enriquecer a consulta do dashboard cruzando com `agendamentos` ou identificando a primeira ocorrência do `paciente_id`.
- Criar lógica para identificar "Pacientes Novos" no período: pacientes cujo ID de agendamento vinculado tenha `primeiro_agendamento = true` ou que não possuam registros anteriores à data inicial do filtro.

### 📱 Frontend (Dashboard)
- **Novo Card de Resumo**: "Novos Pacientes" (Total e % do total).
- **Lista de Novos Pacientes**: Nova aba ou seção no detalhamento (drill-down) que lista:
  - Nome do Paciente
  - Data do Atendimento
  - Procedimento Realizado
  - Profissional (Médico)
  - Convênio / Particular (Origem)
- **Gráfico de Origem para Novos**: Comparativo Particular vs Convênio específico para este segmento.

## Detalhes Técnicos
- Atualizar `fetchLabProducaoRows` em `src/lib/dashboard-data.ts` para opcionalmente incluir/identificar novos pacientes.
- Adicionar estado `detalheNovos` em `src/routes/_authenticated/dashboard.tsx` para controlar a abertura da lista detalhada.
- Integrar com o componente `DashboardDateFilter` existente.
