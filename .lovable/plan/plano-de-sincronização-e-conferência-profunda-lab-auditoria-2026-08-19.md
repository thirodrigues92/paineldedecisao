# Plano de Sincronização e Conferência Profunda — Lab Auditoria

Implementar a opção de sincronização granular (1 dia por vez) e enriquecer o relatório de auditoria com dados profundos para conferência com o sistema Feegow, focando no dia anterior como ponto de partida.

## Alterações no Backend (Server Functions)

1.  **Enriquecimento de Dados Profundos (`src/lib/lab-faturamento.functions.ts`):**
    *   Atualizar a captura de `labSyncParticular` para extrair campos adicionais do `invoice` da API Feegow (ex: `data_pagamento` real, `forma_pagamento` detalhada, `executante` original).
    *   Garantir que o `paciente_id` seja sempre resolvido, mesmo quando a API não o envia no nível superior, cruzando com os dados da agenda sincronizados no mesmo passo.
    *   Adicionar metadados de "Profundidade" no `payload_raw` para consulta técnica se necessário.

2.  **Otimização do RPC `lab_enriquecer_faturamento`:**
    *   Refinar a lógica SQL para vincular nomes de pacientes, profissionais e convênios vindos de tabelas do sistema principal às tabelas do Lab, garantindo que o relatório mostre nomes legíveis em vez de apenas IDs.

## Alterações no Frontend (UI)

1.  **Controle de Sincronização Granular (`src/routes/lab/relatorio.tsx`):**
    *   Adicionar um seletor de "Modo de Sincronização": "Granular (1 em 1 dia)" ou "Em Bloco".
    *   Incluir um botão de atalho rápido: "Sincronizar Ontem" para facilitar a conferência diária pedida pelo usuário.
    *   Exibir logs detalhados de cada dia processado em tempo real.

2.  **Expansão do Relatório de Auditoria (`src/routes/lab/relatorio.tsx`):**
    *   Adicionar colunas de conferência: "Valor Feegow (Bruto)", "Taxas/Descontos", "Valor Líquido", "Status de Recebimento".
    *   Implementar visualização detalhada (expandir linha) para mostrar o JSON bruto (`payload_raw`) formatado, permitindo conferir "profundamente" de onde veio cada centavo.
    *   Adicionar filtros por "Status de Sincronização" (Sucesso/Erro).

## Detalhes Técnicos
*   Utilização de `Promise.all` controlada para evitar rate limit na API Feegow ao processar múltiplos dias.
*   Persistência de logs no banco de dados (`lab_sync_log`) para auditoria histórica.
*   Uso de `TanStack Query` para atualizar a UI automaticamente após a conclusão da sincronização.
