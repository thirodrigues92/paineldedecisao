# Comparativo Mensal: julho e agosto abaixo do real

Os números do gráfico estão certos em relação ao que está gravado — o problema é que faltam dias de dados vindos da Feegow.

## O que foi verificado

Conferência dia a dia do que está gravado hoje:

- **Julho/2026**: só existem 5 dias (01, 02, 03, 06 e 07). Todo o resto do mês nunca foi trazido. Total gravado: R$ 131.440 — muito abaixo do real.
- **Agosto/2026**: faltam **05/08** (nenhum registro) e **08/08** veio incompleto (só 24 itens, R$ 360). Os demais dias úteis estão presentes. Total gravado: R$ 574.816.
- Para comparação, meses completos (março a junho) ficam entre R$ 554 mil e R$ 643 mil, o que confirma que agosto está quase completo e julho está muito incompleto.

Ou seja: nada de errado no cálculo do comparativo; o que falta é a carga histórica desses dias.

## Plano

1. **Rodar a carga histórica de julho** (08/07 a 31/07) pela tela de Configurações > Sincronização, em blocos, até 100% concluído.
2. **Reprocessar os dias falhos de agosto**: 05/08 e 08/08 (a gravação é por chave única, então reprocessar não duplica).
3. **Conferir depois da carga**: comparar dia a dia julho e agosto e confirmar que cada dia útil tem volume compatível com os meses vizinhos.
4. **Aviso de dias faltando no comparativo**: acrescentar no card "Comparativo Mensal" um alerta discreto quando um mês exibido tiver dias úteis sem nenhum registro, com a lista dos dias — assim um mês incompleto nunca mais é lido como queda de faturamento.
5. **Bloco de erros do histórico**: garantir que blocos que falharem na carga fiquem listados para reprocessar, evitando novos buracos silenciosos.

## Detalhes técnicos

- Fonte de dados: `lab_producao_feegow` (alimentada por `reports/generate` + safety net `appoints/search`).
- Carga: `lab_backfill_jobs` via `src/lib/lab-sync-admin.functions.ts` / `src/lib/lab-sync-core.server.ts`, blocos de 7 dias com retentativa em blocos menores.
- Item 4 é alteração apenas em `src/components/ComparativoMensal.tsx`: consulta dos dias distintos existentes no período e marcação dos dias úteis ausentes.
