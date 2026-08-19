# Plano de Correção e Auditoria de Sincronização (Lab)

A sincronização estava ocorrendo sem erros, mas nenhum dado estava sendo gravado no banco. Identifiquei que a API Feegow pode exigir parâmetros explícitos (`billing=1`, `show_items=1`) para retornar os detalhes necessários. Além disso, adicionei telemetria para confirmar a gravação dos dados.

## Alterações Técnicas

### Backend (`src/lib/lab-faturamento.functions.ts`)
- **Parâmetros da API:** Adicionados `billing=1`, `show_items=1` e `show_payments=1` para garantir que a API retorne os arrays de itens e pagamentos.
- **Telemetria de Gravação:** Adicionado `console.log` no servidor para monitorar o volume de dados sendo enviado ao banco.
- **Captura de Amostra:** Agora o primeiro registro de cada janela bem-sucedida é gravado na coluna `amostra_raw` da tabela `lab_sync_log`, permitindo auditar o JSON bruto retornado pela API sem precisar de novas chamadas.
- **Tratamento de Erros:** Adicionada verificação de erro nos retornos das operações de `upsert` do Supabase.

### Frontend (`src/routes/lab/relatorio.tsx`)
- **Melhoria no Feedback:** Quando o relatório estiver vazio, botões de ação rápida (Sincronizar ou Ver Logs) serão exibidos diretamente na tabela.
- **Resiliência:** Melhorada a exibição de IDs caso nomes de pacientes ou procedimentos ainda não tenham sido resolvidos pelas dimensões.

### Banco de Dados
- Utilização da coluna `amostra_raw` para diagnosticar discrepâncias estruturais no JSON da Feegow.

## Próximos Passos
1. Execute uma nova sincronização granular (1 dia) para a data desejada.
2. Verifique o console do servidor para confirmar as mensagens `[SYNC] Gravando dados`.
3. Caso a tabela continue vazia, consulte a tabela `lab_sync_log` para inspecionar o conteúdo de `amostra_raw`.
