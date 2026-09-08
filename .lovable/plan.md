# Repasse por profissional (quanto o médico recebeu)

## O que encontrei na Feegow

Testei a API ao vivo, sem alterar nada:

- **Contas a pagar** existe como relatório (`bills-to-pay`), mas devolveu vazio com os filtros testados — e ele é por fornecedor/despesa, não liga o pagamento ao atendimento.
- **Repasse** (`medical-transfer`) é o relatório certo: traz linha a linha o que cada profissional recebeu, já ligado ao paciente, procedimento, convênio e forma de pagamento.

Campos confirmados em 03/08/2026 (218 linhas): profissional, procedimento, convênio, valor do atendimento, valor líquido, **valor repassado**, regra de repasse, percentual, situação do repasse, unidade e data.

Limite observado: janelas de até ~3 dias respondem; 7 dias ou 1 mês dão erro no servidor da Feegow. A carga precisa ser fatiada, como já é feito na produção.

## O que vou construir

### 1. Guardar os repasses
Nova tabela `lab_repasse_feegow` com uma linha por item repassado (chave: transação + item + profissional), guardando data, profissional, paciente, procedimento, convênio, unidade, valor, valor líquido, valor repassado, percentual, regra e situação. Proteção de acesso igual às demais tabelas do Lab.

### 2. Sincronização
- Função de sincronização em blocos de 3 dias, com regravação segura (sem duplicar).
- Entra no mesmo ciclo automático de 30 minutos (janela recente) e na carga histórica em blocos, reaproveitando a fila e a trava já existentes.
- Botão de sincronização manual de repasse no painel de sincronização.

### 3. Relatório dentro de "Faturamento por Profissional"
Na mesma tela do treemap de profissionais, respeitando o filtro de período e o filtro de convênio já existentes:

- Novos indicadores por profissional: **Faturado**, **Repassado ao profissional**, **Retido pela clínica**, **% de repasse** e **% que o repasse representa do faturamento total** do período.
- Coluna/rótulo de repasse dentro do detalhamento de cada profissional (por procedimento e por convênio).
- Tabela de lançamentos de repasse com pesquisa (paciente, procedimento, convênio, data, valor) e exportação CSV.
- Aviso quando houver atendimento faturado sem repasse correspondente no período, para não parecer que o médico recebeu menos.

## Detalhes técnicos

- Fonte: `POST /reports/generate` com `report: "medical-transfer"`, `DATA_INICIO`/`DATA_FIM` em `DD/MM/AAAA`, `UNIDADE_IDS: [0]`; fatiar em janelas de 3 dias com retry de 1 dia.
- Valores chegam em texto no formato brasileiro (`"250,00"`) — converter para numérico na gravação.
- Chave natural: `id_transacao + item_id + profissional_id + procedimento_id`; upsert idempotente.
- Índices por `data_repasse` e `profissional_id`, seguindo o padrão já criado em `lab_producao_feegow`.
- Cruzamento com faturamento por `ProfissionalID` + período (e `ProcedimentoID` no detalhamento).
