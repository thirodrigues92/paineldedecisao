# Plano de Correção e Melhoria da Conciliação Lab

O objetivo deste plano é resolver a divergência de valores nos relatórios de convênio (onde o Feegow retorna R$ 30,00 genéricos na produção, mas o valor real é diferente no financeiro) e unificar a visualização de status para facilitar a auditoria.

## Alterações

### 1. Backend: Lógica de Conciliação Híbrida
- Alterar `getLabConciliacao` para:
  - Detectar quando um valor de R$ 30,00 vem da Produção (Fake) e marcá-lo como "Estimado/Pendente" se não houver faturamento real vinculado.
  - Se houver faturamento real (mesmo que venha do enriquecimento `convenio_estimado`), priorizar este valor.
  - Melhorar a detecção de "Forma de Pagamento" para convênios, buscando no financeiro mesmo quando o lançamento ainda não foi baixado.
  - Corrigir duplicidade no retorno do array de conciliação (remoção de `return` duplicado no final da função).

### 2. Frontend: Interface de Conciliação
- Atualizar a tabela de Conciliação para:
  - Exibir o status de forma mais clara quando o valor for "Pendente de Faturamento".
  - Na coluna "Tabela (Agenda)", se o valor for 30 e estiver sem fatura, mostrar "Pendente" em vez de R$ 30,00 para evitar confusão.
  - Garantir que a exportação CSV reflita exatamente o que é visto na tela (inclusive as correções de valor).

### 3. Sincronização e Enriquecimento
- Ajustar o RPC `lab_enriquecer_faturamento` para:
  - Ser mais agressivo na limpeza de registros `particular` quando um agendamento é claramente de `convenio`.
  - Garantir que o `prontuario` seja propagado corretamente da produção para o faturamento em todos os casos.

## Detalhes Técnicos
- Arquivos afetados:
  - `src/lib/lab-faturamento.functions.ts`: Lógica central de cruzamento de dados.
  - `src/routes/lab/conciliacao.tsx`: Ajustes na visualização e exportação.
  - `supabase/migrations/...`: (Opcional) Pequeno ajuste na lógica SQL do RPC se necessário.

---
Este ajuste foca na precisão dos dados exibidos para que você possa identificar exatamente o que foi faturado e o que ainda está pendente no Feegow.