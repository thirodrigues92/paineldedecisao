# Plano de Implementação — Lab: Conciliação Agenda x Faturamento

Comparar o valor de tabela do agendamento (baseado na agenda) com o valor real faturado (financeiro), destacando discrepâncias e faltas de faturamento.

## Ações

1. **Infraestrutura de Dados (Server-side)**
   - Criar `lab_enriquecer_conciliacao` (RPC ou lógica em server function) para calcular a visão comparativa.
   - A query base unirá `agendamentos` (tabela de produção) com `lab_faturamento` (tabela experimental).
   - Identificar 3 status: `SEM_FATURA` (agendado mas não faturado), `IGUAL` (valor bate), `DIVERGENTE` (valores diferentes).

2. **Nova Rota e UI**
   - Criar `src/routes/lab/conciliacao.tsx`.
   - Implementar 3 cards de resumo no topo (Total, Sem Fatura, Divergente).
   - Adicionar filtros: Intervalo de datas, Profissional, Status.
   - Tabela principal com regras de cores (Vermelho para sem fatura, Amarelo para divergente).
   - Exportação para CSV.

3. **Detalhes e Auditoria**
   - Implementar painel lateral (Sheet/Drawer) que abre ao clicar na linha, mostrando os itens brutos de `lab_faturamento` vinculados àquele agendamento.

## Detalhes Técnicos

- **Query Base**:
  ```sql
  SELECT 
      a.agendamento_id, a.data AS data_agendamento, p.nome AS nome_paciente,
      prof.nome AS nome_profissional, proc.nome AS nome_procedimento,
      a.valor_estimado AS valor_tabela_agenda,
      COALESCE(SUM(f.valor_faturado), 0) AS valor_real_faturado,
      COALESCE(SUM(f.valor_faturado), 0) - COALESCE(a.valor_estimado, 0) AS diferenca
  FROM agendamentos a
  LEFT JOIN lab_faturamento f ON f.agendamento_id = a.agendamento_id
  LEFT JOIN pacientes p ON p.id = a.paciente_id
  LEFT JOIN profissionais prof ON prof.id = a.profissional_id
  LEFT JOIN procedimentos proc ON proc.id = a.procedimento_id
  GROUP BY a.agendamento_id, a.data, p.nome, prof.nome, proc.nome, a.valor_estimado
  ```
- **Filtros**: Client-side para performance inicial, com busca e filtros de status.
- **Componentes**: shadcn/ui (Table, Card, Badge, Sheet).
