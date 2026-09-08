# Sincronização automática a cada 30 minutos + carga histórica

Hoje a atualização depende de alguém clicar em "Sincronizar". O objetivo é deixar o sistema se atualizando sozinho e permitir puxar meses anteriores de uma vez.

## 1. Atualização automática (a cada 30 min)

- Criar um endereço interno que o agendador chama sozinho: `src/routes/api/public/hooks/sync-feegow.ts`, protegido por uma senha própria (segredo `CRON_SYNC_SECRET`) enviada no cabeçalho.
- A cada execução ele sincroniza uma janela curta e recente (padrão: últimos 3 dias até hoje), rodando na ordem: produção detalhada (`reports/generate`), rede de segurança (`appoints/search`) e enriquecimento.
- Agendar com pg_cron a cada 30 minutos (48 execuções por dia). Cadência menor traria pouco ganho e mais custo; 30 min significa que um atendimento aparece no painel em no máximo meia hora.
- Proteções obrigatórias:
  - Trava de execução única: uma linha de "job em andamento" com expiração; se a execução anterior ainda roda, a nova sai sem fazer nada.
  - Limite de trabalho por execução (janela fixa de dias + teto de itens).
  - Registro de cada execução em `lab_sync_log` (início, fim, registros, erro).
  - Pausa automática após falhas repetidas da Feegow, com retomada na próxima execução.

## 2. Carga histórica (3, 4, 5 meses ou mais)

- A API da Feegow trava/estoura memória em janelas longas, por isso a carga antiga roda **fatiada**: blocos de 7 dias, sequenciais, com repetição automática em blocos menores (3 dias, 1 dia) quando o bloco falhar.
- Nova função de backfill com fila em banco (`lab_backfill_jobs`): você escolhe o período (ex.: 01/03/2026 a 31/08/2026), o sistema cria os blocos e processa alguns por execução, marcando cada bloco como concluído — se parar no meio, retoma de onde estava, sem repetir.
- Um mês de dados equivale a ~4-5 blocos; a fila processa continuamente até terminar, então períodos de 3 a 6 meses são viáveis, apenas levam mais tempo (minutos a algumas dezenas de minutos, dependendo do volume).

## 3. Tela de controle

Em uma aba nova dentro de Configurações:
- Status da atualização automática: ligada/pausada, última execução, quantos registros, próximo horário.
- Botão para rodar agora.
- Formulário de carga histórica: data inicial, data final, botão "Iniciar carga", com barra de progresso (blocos concluídos / total) e lista de blocos com erro para reprocessar.

## Detalhes técnicos

- Rota pública sob `/api/public/*` (é o que o agendador consegue chamar no site publicado), com verificação do segredo antes de qualquer processamento.
- Reaproveita as funções já existentes em `src/lib/lab-faturamento.functions.ts` (`labSyncProducao`, `labSyncSafetyNet`, `labEnrichFaturamento`), extraindo a lógica para helpers de servidor chamados tanto pela tela quanto pelo agendador.
- Migração de banco: tabelas `lab_sync_lock` (trava/estado pausado) e `lab_backfill_jobs` (blocos do histórico), com as permissões e regras de acesso necessárias.
- Agendamento pg_cron apontando para a URL estável do projeto.
