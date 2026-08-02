## Diagnóstico (queries já rodadas no banco)

O gráfico "Faturamento por tipo de serviço" **não usa especialidade** — ele usa a receita real de `financeiro_lancamentos` classificada pelo **nome do procedimento do item da fatura**. Por isso o problema não está nas especialidades (só 41 agendamentos sem especialidade, R$ 4,8k — irrelevante).

O "Outros" (~R$ 1,08 mi de R$ 2,03 mi de receita) é composto por **três coisas bem distintas**:

| Bloco | Lançamentos | Receita | Causa |
|---|---|---|---|
| Faturas em lote de convênio (`Lote(s): 2501…2529`) | 66 | R$ 541,8k | Fatura agregada, sem procedimento — 1 linha por lote mensal |
| Sem nenhum detalhe (sem `procedimento_id` e sem descrição) | 816 | R$ 220,1k | Feegow não devolveu o item da fatura |
| Nomes reais que as regras atuais não reconhecem | 733 | R$ 320,6k | Falta de regra de classificação (não é problema de dados) |

Exemplos do terceiro bloco (os maiores): `Faturamento Autogestão` R$ 79,5k, exames de laboratório com sigla (`Shbg`, `Dehidrotestosterona Dht`, `Testosterona Livre`, `Dimero D`, `Cortisol Basal`, `Anti Ccp`, `Zinco`, `Paratormônio`, `Lipidograma`, `Sangue Oculto`, `Ca-15/3`), protocolos injetáveis (`PROTOCOLO PARA ANSIEDADE E DEPRESSÃO - IM`, `PROTOCOLO ARTICULAÇÕES`, `PROTOCOLO DETOX`), estética/derma (`INTRADERMOTERAPIA CAPILAR`, `TOXINA BOTULÍNICA`, `CONOPLASTIA`), contracepção (`MIRENA / KYLEENA`, `IMPLANOM`), diagnósticos (`POLISSONOGRAFIA`, `MAPEAMENTO DE RETINA`, `MICROSCOPIA`, `RISCO CIRÚRGICO`, `POOL COGNITIVO-MEMORIA`, `BIOIMPEDÂNCIA`).

**Conclusão:** ~30% do "Outros" é falta de regra (fácil de resolver), ~50% é faturamento em lote de convênio (é legítimo, mas precisa de rótulo próprio) e ~20% é dado incompleto vindo da Feegow.

## O que fazer

### 1. Separar o "Outros" em três rótulos honestos
Em vez de um balde único, o gráfico passa a mostrar:
- **Faturamento em lote (convênio)** — as faturas `Lote(s):` e `Faturamento Autogestão`/`Repasse`
- **Sem detalhamento da Feegow** — lançamentos sem item nem procedimento
- **Outros serviços** — só o que sobrar de verdade

### 2. Ampliar as regras de classificação
Atualizar `src/lib/service-categories.ts` para cobrir os nomes encontrados:
- Laboratório: siglas e hormônios (shbg, dht, testosterona, cortisol, dímero d, zinco, anti-ccp, anti-trab, paratormônio, androstenediona, lipidograma, sangue oculto, complemento, ca-15/3, sexagem fetal, microscopia)
- Cardiologia/diagnóstico: polissonografia, risco cirúrgico, mapeamento de retina, bioimpedância, pool cognitivo, patch test
- Aplicações e vacinas: `PROTOCOLO … IM/EV`, viscosuplementação, intradermoterapia, toxina botulínica
- Procedimentos e cirurgias: conoplastia, Mirena/Kyleena, Implanon, DIU
Isso tira ~R$ 200k do "Outros" e joga nas categorias corretas.

### 3. Drill-down: clicar na categoria e ver o que tem dentro
Ao clicar numa barra do gráfico, abre um painel lateral com os itens que compõem aquela categoria (nome, quantidade, receita, ticket médio), ordenados por receita. Resolve a dúvida "o que tem em Outros?" de forma permanente, sem precisar de SQL.

### 4. Nota de cobertura no rodapé
Mostrar explicitamente quanto da receita está classificada por procedimento, quanto veio em lote de convênio e quanto a Feegow não detalhou.

## Detalhes técnicos

- `src/lib/service-categories.ts`: novas regex + duas categorias novas (`Faturamento em lote`, `Sem detalhamento`), mantendo a assinatura `categoriaServico(nome)` e adicionando um caminho que também considera lançamento sem nome.
- `src/routes/_authenticated/dashboard.tsx`: agregação por categoria passa a guardar também a lista de itens (nome → valor/qtd) para o drill-down; painel usa `Sheet` do shadcn e o tema de cores central (`src/lib/chart-theme.ts`).
- Sem migração de banco e sem mudança na Edge Function nesta etapa — a soma continua batendo com o KPI de Receita total.

## Opcional (fase seguinte)
Para abrir o que tem dentro das faturas em lote de convênio (R$ 541,8k), seria preciso chamar o endpoint de itens/vendas da Feegow por fatura na sincronização. Fica como etapa separada, se você quiser esse nível de detalhe.
