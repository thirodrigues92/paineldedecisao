# Correção: receita de convênio ausente na sincronização

## O que os dados mostram (verificado agora no banco)

- `convenios`: **0 registros**. A etapa que busca convênios na Feegow (`/insurance/list`) está dentro de um `try/catch` que apenas registra aviso no console — ela falha silenciosamente e nunca gravou nada.
- `agendamentos`: 16.022 no total, sendo **6.202 com convênio** (ids 2, 33, 15, 9, 21, 31, 35, 28) e 9.820 sem convênio. Ou seja, a **agenda traz convênio normalmente**.
- `financeiro_lancamentos`: 6.515 registros e **`convenio_id` nulo em 100% deles**. Nenhum lançamento vinculado a convênio.
- Composição financeira: 5.687 receitas "pago" (R$ 2,00 mi), apenas 17 receitas "em_aberto" (R$ 33,9 mil), 809 despesas pagas. Praticamente **não há contas a receber**, o que é incompatível com uma clínica que atende convênio (o faturamento de convênio nasce a receber e é liquidado em lote).
- Última sync financeira: 02/08/2026, janela 04-05-2026 → 01-09-2026. Agenda vai de 15/04/2026 a 21/08/2026.

Conclusão: o dashboard mostra tudo como "Particular" porque a única fonte financeira hoje é `/financial/list-invoice`, que devolve o movimento de caixa (recebimentos avulsos), sem o identificador de convênio e sem o faturamento em lote/contas a receber.

## O que será feito

**1. Corrigir convênios (tabela vazia)**
Tentar os endpoints alternativos da Feegow em cascata (`/insurance/list`, `/insurance/list-insurance`, `/insurance/list-insurance-plans`, `/core/insurance/base/insurance`) e registrar em `sync_logs` qual respondeu, com o erro completo quando todos falharem — nada mais de falha silenciosa. Gravar `convenio_id`, nome e planos.

**2. Preencher `convenio_id` no financeiro**
- Ler os campos de convênio nos vários níveis da fatura (`invoice.convenio_id`, `convenio`, `insurance_id`, `payer`, itens).
- Quando a fatura não informar, derivar pelo vínculo: `procedimento/paciente/agendamento` da mesma data → convênio do agendamento. Esse backfill roda também sobre os 6.515 registros já existentes.

**3. Buscar as fontes que faltam**
Ampliar a sincronização financeira para incluir contas a receber e faturamento de convênio, testando os endpoints da Feegow (`/financial/list-account-receivable`, `/financial/list-batch` / TISS, `/core/financial/...`) e gravando em `sync_logs` a resposta de cada um, para deixar registrado o que existe e o que não existe na conta da clínica.

**4. Refletir na interface**
- Nome real do convênio no lugar do id nos filtros e gráficos.
- No donut Particular vs Convênio da Visão Executiva, exibir explicitamente quanto da receita ainda está sem convênio identificado, em vez de somar tudo em "Particular".

**5. Página de diagnóstico da sincronização**
Tela `/auditoria` com dados brutos, sem interpretação:
- por tabela: total de registros, contagem e % de nulos nos campos críticos, registros órfãos (FK apontando para id inexistente);
- últimas 10 execuções de `sync_logs` com endpoint, janela, duração, quantidade e erro completo;
- conciliação de receita: total do financeiro x soma de `valor_total` da agenda no mesmo período, quebrado por particular / convênio / não identificado;
- botão para copiar/baixar o JSON com todos esses números e a consulta que originou cada um.

## Detalhes técnicos
- Alterações em `supabase/functions/sync-feegow/index.ts`: cascata de endpoints para convênios, extração ampliada de convênio na fatura, novos blocos de sincronização de recebíveis, log de erro por bloco em vez de `console.warn`.
- Backfill de `financeiro_lancamentos.convenio_id` via migração SQL usando o vínculo agendamento/paciente.
- Nova rota `src/routes/_authenticated/auditoria.tsx` + item na `AppSidebar`; agregações feitas por uma função de servidor autenticada para não trazer dezenas de milhares de linhas ao browser.
- Nenhuma tela existente muda de lógica além do rótulo do donut e dos nomes de convênio.
