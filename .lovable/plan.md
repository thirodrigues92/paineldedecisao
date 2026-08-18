# Plano de Consolidação Final — lab_faturamento

Este plano implementa as instruções consolidadas para o módulo experimental `lab_faturamento`, focando em categorização por procedimento, ponte correta para convênios via agenda, e robustez na sincronização janelada.

## 1. Banco de Dados e Categorização
Ajustar o esquema para suportar a nova estratégia de categorização (procedimentos) e enriquecimento (agenda).

- Criar tabela `lab_dim_procedimento` (procedimento_id, nome, grupo_id, grupo_nome, tipo).
- Criar tabela `lab_dim_agendamento` para ponte com convênios.
- Adicionar colunas `grupo_id`, `grupo_nome`, `convenio_id`, `plano_id`, `especialidade_id`, `valor_bruto`, `desconto`, `acrescimo` e `origem` na tabela `lab_faturamento`.
- Criar tabela `lab_invoice_header` para armazenar o grão da fatura (`detalhes[]`).

## 2. Lógica de Sincronização e Enriquecimento
Reformular as Server Functions para seguir as regras de grão e anti-duplicação.

- **Sync Procedimentos**: Popular `lab_dim_procedimento` via `/procedures/list` e `/procedures/groups`.
- **Sync Agenda**: Popular `lab_dim_agendamento` via `/appoints/search`.
- **Sync Faturamento (Particular)**: 
  - Usar `itens[]` como grão para `lab_faturamento`.
  - Mapear `grupo_nome` via JOIN com `lab_dim_procedimento`.
  - Enriquecer dados de convênio via JOIN com `lab_dim_agendamento`.
  - Implementar fatiamento (janelas de 7 dias) e retry adaptativo para erro de memória.
  - Implementar `dry_run` e limpeza seletiva.

## 3. Interface (UI)
Atualizar a rota `/lab/faturamento` para refletir as novas capacidades de auditoria.

- **Aba Sincronização**: Adicionar controles de janela, dry-run, e limpeza antes de gravar.
- **Aba Faturado x Recebido**: Novos KPIs e gráficos agrupados por `grupo_nome`.
- **Aba Auditoria**: Painel de qualidade (cobertura de IDs resolvidos) e detecção de divergência (Itens vs Header).
- **Avisos Fixos**: Adicionar as notas sobre `categoria_id` zerado e natureza do campo `desconto`.

## Detalhes Técnicos
- Conversão de valores: Divisão por 100 (centavos para reais).
- Formato de data Feegow: `DD-MM-YYYY` (exige tratamento manual).
- Grão de auditoria: Itens líquidos individuais vs Valor total da fatura.
- Isolamento: Todo o código permanecerá com prefixo `lab_`.
