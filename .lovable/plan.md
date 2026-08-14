# Auditoria de Dados — tela `/auditoria`

Nova tela (menu "Auditoria de Dados") que mostra, sem interpretação, a origem de cada número: contagens brutas, nulos críticos, histórico de sync e conciliação de receita.

## Números atuais já confirmados no banco
- agendamentos: 16.022 | financeiro_lancamentos: 6.515 | pacientes: 6.188
- procedimentos: 887 | profissionais: 32 | unidades: 2 | sync_logs: 77 execuções
- financeiro_lancamentos sem `procedimento_id`: 1.701

## Abas da tela

**1. Status de Sync**
Últimas 10 linhas de `sync_logs`: endpoint, início, fim, duração, registros, sucesso/erro (mensagem completa). Além disso, última sync bem-sucedida por endpoint.

**2. Qualidade de Dados**
Uma linha por tabela (agendamentos, financeiro_lancamentos, procedimentos, profissionais, unidades, pacientes, ceps/geo, injetáveis derivados) com:
- total de registros
- % e contagem de NULL por campo crítico (ex.: agendamentos: status_id, procedimento_id, profissional_id, unidade_id, convenio_id, paciente_id, valor_total=0, duracao_min; financeiro: procedimento_id, descricao_item, categoria, data_pagamento, unidade_id; pacientes: cep, bairro, latitude; procedimentos: nome vazio)
- % de completude geral
- órfãos: registros cujo FK aponta para id inexistente na tabela pai (agendamentos→profissional/unidade/especialidade/procedimento/paciente/status; financeiro→procedimento/unidade)

**3. Rastreamento de Receita**
- Receita total do BD (`financeiro_lancamentos.tipo='receita'`) no período dos filtros globais
- Quebra por bucket de classificação de serviço (mesma função usada na Visão Executiva), com contagem e valor de "Outros serviços", "Faturamento em lote (convênio)" e "Sem detalhamento da Feegow"
- Soma de `valor_total` dos agendamentos no mesmo período, para comparação agenda vs financeiro (delta absoluto e %)
- Verificação de tipo: valores lidos como string vs number, quantidade de valores não numéricos/negativos/zerados

**4. Log de Todas as Tabelas**
Tabela única com todas as métricas por tabela + botão "Copiar JSON" e "Baixar JSON" com o payload estruturado completo (tabela → total, nulos por campo, órfãos, última sync, registros da última sync, fonte da consulta usada).

## Detalhes técnicos
- Nova rota `src/routes/_authenticated/auditoria.tsx` + item na `AppSidebar`.
- Nova função de servidor `src/lib/audit.functions.ts` com `.middleware([requireSupabaseAuth])`, executando as contagens/nulos/órfãos via consultas agregadas (uma chamada, um JSON de retorno) — evita paginar dezenas de milhares de linhas no browser.
- Para os agregados usarei RPC SQL nova `public.audit_snapshot()` (SECURITY DEFINER, `stable`, retorna `jsonb`) com GRANT EXECUTE para `authenticated`, chamada pela server function; assim todo número vem de um único SELECT auditável.
- A aba de receita reutiliza `fetchFinancialRows` + `categoriaServico` já existentes, respeitando os filtros globais.
- Nenhuma alteração nas telas atuais; apenas leitura.
