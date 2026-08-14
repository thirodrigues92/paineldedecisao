# Detalhar cada lançamento do faturamento

Hoje, ao abrir um item da "Composição do faturamento", cada lançamento mostra só data, categoria, particular/convênio e status — quase sempre "Não classificado · Particular · pago". Dá para mostrar bem mais, usando o vínculo do lançamento com o agendamento.

## O que existe hoje no banco (verificado)

- 6.289 lançamentos de receita: todos têm categoria e status, 4.514 (72%) já têm agendamento vinculado, apenas 155 têm convênio direto e nenhum tem unidade.
- Pelo agendamento vinculado dá para puxar: paciente, profissional, especialidade, procedimento, data/hora do atendimento, status do agendamento e convênio (6.229 dos 16.077 agendamentos têm convênio, em 8 convênios do catálogo).
- Unidade não está preenchida em nenhuma tabela — não dá para exibir.

## O que passa a aparecer em cada lançamento

Por linha, dentro do item aberto:

- Valor e data do pagamento/vencimento
- Procedimento (nome real, do catálogo) e especialidade
- Profissional que atendeu
- Paciente (identificador; a base não guarda nome, só o ID e bairro/cidade)
- Convênio pelo nome (ou "Particular") em vez do rótulo genérico
- Data e hora do atendimento + status do agendamento
- ID do lançamento, para conferência na Feegow
- Quando não há agendamento vinculado, a linha mostra "Sem vínculo com a agenda" e exibe o que existe (categoria bruta, descrição do item da fatura)

Ordenação por data decrescente, com as linhas em formato de lista compacta e legível.

## Detalhes técnicos

- `fetchFinancialRows` passa a trazer também `id` e `agendamento_id`.
- No dashboard, os lançamentos de cada bucket de serviço são cruzados com os agendamentos já carregados (mapa por `agendamento_id`) e com os catálogos de profissionais, especialidades, procedimentos e convênios; carregar `convenios` (nome) junto dos demais catálogos.
- Apenas apresentação: nenhuma alteração de schema, sincronização ou cálculo de KPI.
