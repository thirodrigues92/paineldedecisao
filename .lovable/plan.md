# Plano de Implementação — Rede de Segurança (Safety Net Sync)

Implementar uma sincronização complementar que utiliza o endpoint `/appoints/search` da Feegow para identificar e preencher agendamentos realizados que, por falha na API, não aparecem no relatório de produção detalhado.

## 1. Pesquisa e Diagnóstico (Concluído)
- Confirmado que `GET /appoints/search?data_start=DD-MM-YYYY&data_end=DD-MM-YYYY` retorna todos os agendamentos do dia sem necessidade de filtros adicionais.
- Confirmado que os "buracos" (ex: Sebastiana, paciente 39286) aparecem neste endpoint com `status_id: 3`.
- Estrutura de dados mapeada: `agendamento_id`, `paciente_id`, `procedimento_id`, `valor_total_agendamento` (como valor estimado).

## 2. Backend — Sincronização de Segurança
- Criar a server function `labSyncSafetyNet` em `src/lib/lab-faturamento.functions.ts`.
- Lógica:
    1. Buscar agendamentos do dia via `/appoints/search`.
    2. Comparar com `lab_producao_feegow` (procurando `agendamento_id` ausentes).
    3. Filtrar apenas realizados (`status_id = 3`).
    4. Inserir lacunas com a flag `tipo_procedimento = 'Fallback appoints/search'`.
    5. Converter `valor_total_agendamento` (string "R$ 0,00") para decimal.
- Atualizar a função de sincronização principal para chamar a rede de segurança automaticamente.

## 3. Frontend — Interface e Feedback
- Adicionar botão "Verificar Buracos" na tela de Conciliação (`/lab/conciliacao`) para execução manual específica.
- Exibir resumo de "Itens preenchidos pela rede de segurança" no log de sincronização.
- Garantir que a UI destaque visualmente registros com o tipo "Fallback" (opcional, já coberto pela coluna Procedimento).

## Detalhes Técnicos
- O `feegow_id` para estes registros será gerado via hash determinístico prefixado com `FALLBACK-` para evitar colisões e permitir idempotência.
- O campo `situacao` será definido como "Faturado" por padrão para agendamentos realizados (status 3).

## Critérios de Aceite
- Sincronizar o dia 20/08/2026.
- Verificar se a paciente Sebastiana Alves De Araújo (ID 39286) e outros casos confirmados agora aparecem na Conciliação.
- Validar que o valor de R$ 195,30 (tabela) foi importado corretamente para Sebastiana.
