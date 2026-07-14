## Diagnóstico

As tabelas estão **todas vazias** (0 registros em `agendamentos`, `unidades`, `profissionais`, `especialidades`, `financeiro_lancamentos`), embora os `sync_logs` mostrem "791 registros" com `sucesso=true`. Encontrei três bugs que, juntos, produzem esse falso positivo:

1. **O `mode` é ignorado.** O frontend envia `{ mode: "support" }` / `{ mode: "historical" }` no **body** JSON, mas a Edge Function lê `url.searchParams.get("mode")` (query string). Resultado: **todas as chamadas rodam como `today`** — as tabelas de apoio (unidades, profissionais, especialidades, status, convênios, procedimentos) **nunca foram populadas** e a carga histórica nunca rodou. A resposta `{"mode":"today"}` em todos os POSTs confirma isso.

2. **Erros de upsert são silenciados.** O código faz `await supabase.from("agendamentos").upsert(...)` sem checar `.error`. Como as tabelas referenciadas estão vazias e existem **7 FKs** em `agendamentos` (status_id, unidade_id, profissional_id, etc.), todo lote de 791 agendamentos é **rejeitado por violação de FK** — mas o log grava `registros=791, sucesso=true` porque conta o `mapped.length` antes do upsert e não valida o retorno.

3. **Ordem de sincronização.** Mesmo com o bug 1 corrigido, o usuário precisa rodar `support` **antes** de `today`/`historical` para popular as tabelas-pai.

## Correções propostas

### 1. `supabase/functions/sync-feegow/index.ts`
- Ler `mode` do body JSON (POST) **e** da query string (GET/cron), com fallback para `"today"`.
- Envolver cada `upsert` em checagem de `error`; se falhar, propagar para o `sync_logs` (`sucesso=false`, `erro=...`) e contar apenas os registros efetivamente gravados.
- No modo `full`, executar na ordem correta: `support` → `historical` → `today` → `refreshViews`.
- Adicionar log `console.log` com contadores por tabela para facilitar debug futuro nas Edge Function logs.

### 2. `src/routes/_authenticated/config.tsx`
- Após corrigir a função, alterar o botão "Carga histórica" para chamar `mode: "full"` (support + historical + today numa tacada), ou executar sequencialmente: primeiro `support`, depois `historical`. Isso garante que o usuário não precise lembrar da ordem.
- Exibir toasts de sucesso/erro com base no `ok` da resposta (hoje o código só espera terminar).

### 3. Re-execução da carga
Depois do deploy, executar **uma vez** o modo `full` (ou `support` + `historical` em sequência) pelo painel de Configurações. Após isso os gráficos passam a exibir dados.

## Nota (fora do escopo direto, mas relacionado)

Os endpoints de **financeiro** ainda são placeholder na Edge Function ("financial: placeholder"). A tela Financeiro ficará zerada mesmo com os agendamentos populados até implementarmos o pull do endpoint financeiro do Feegow — posso fazer isso em seguida se quiser, mas não faz parte desta correção.

## Resumo

Corrigir a leitura de `mode`, validar erros de upsert e reordenar a sincronização. Isso resolve o carregamento vazio dos gráficos.