# Correção do travamento do sync (dia 17/08)

## Resultado do teste executado agora

Chamada real à Feegow para `17-08-2026`, `tipo_transacao=C`, `unidade_id=0`:

| offset | HTTP | Tempo | Bytes | Contas | Itens | Pagamentos | Valor itens |
|---|---|---|---|---|---|---|---|
| 5 | 200 | 3,06 s | 186.650 | 94 | 317 | 97 | R$ 24.386,43 |
| 10 | 200 | 0,62 s | 186.650 | 94 | 317 | 97 | R$ 24.386,43 |

As duas respostas são byte a byte idênticas, com os mesmos `invoice_id` (95010, 95011, 95012, ...).

## Diagnóstico confirmado

A API **ignora os parâmetros `start` e `offset`**: sempre devolve o dia inteiro. O dia 17/08 não é lento — responde em menos de 1 segundo.

O travamento vem do laço de paginação em `labSyncParticular`: ele pede 50 por página, recebe sempre as mesmas 94 contas, vê `94 >= 50`, incrementa `start` e repete a mesma chamada indefinidamente. É um laço infinito — grava as mesmas linhas em loop e nunca fecha a janela, por isso a tela fica presa em "Parar" sem log de conclusão.

## Correção proposta

1. **Remover a paginação por `start`/`offset`** em `labSyncParticular`: uma única chamada por janela, processar todo o `content` retornado e encerrar a janela. Manter o timeout de 20 s e o try/catch já existentes.
2. **Guarda anti-loop** (defesa extra): se uma página trouxer os mesmos `invoice_id` da anterior, encerrar a janela e registrar `erro = "paginacao_ignorada_pelo_endpoint"` em `lab_sync_log`.
3. **Ajustar a UI da aba Sincronização**: o campo de offset/limite deixa de controlar paginação; exibir aviso de que o endpoint devolve o dia completo e que o controle de volume é feito pelo tamanho da janela (1 dia).
4. **Implementar de fato o `RETRY_SPLIT`** hoje só registrado como `split_needed`: dividir a janela ao meio recursivamente até 1 dia quando `cod_erro = 1`.

## Detalhes técnicos

- Arquivo: `src/lib/lab-faturamento.functions.ts` (laço `while (true)` das linhas ~185-322).
- Arquivo: `src/routes/lab/faturamento.tsx` (aba Sincronização, textos e campo de offset).
- Nenhuma mudança de schema; as chaves de upsert (`origem,documento_id,item_id` e `origem,documento_id,pagamento_id`) continuam garantindo idempotência.
- Sem necessidade de cron/background: com uma chamada por dia (~1 s, 186 KB), o sync síncrono cabe folgado no limite de tempo.

## Correção adicional confirmada nos logs

A tela consulta `lab_sync_log` ordenando por `criado_em`, coluna que não existe — todas as chamadas voltam HTTP 400 (`42703`). Por isso o "Log Geral de Execuções" fica sempre vazio, mesmo com o log de início gravado. Ajustar a ordenação para `executado_em` (coluna real) em `src/routes/lab/faturamento.tsx` (linhas 80 e 716).
