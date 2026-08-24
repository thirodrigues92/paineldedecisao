# Plano — Mapa de calor regional em duas camadas

## Objetivo
Transformar a visão geográfica em um mapa regional baseado em dados reais, com alternância entre quantidade de pacientes e faturamento, detalhamento específico de Rio Verde e drill-down para pacientes/atendimentos.

## Entregas
1. **Normalização de localidades**
   - Criar uma origem normalizada para cidade, removendo acentos e consolidando grafias equivalentes.
   - Aplicar de-para para casos conhecidos, incluindo Acreúna e Santa Helena de Goiás.
   - Tratar cidade e bairro ausentes como “Não informado”, mantendo-os visíveis nas contagens.

2. **Camada 1 — mapa por cidade**
   - Usar pacientes com coordenadas e calcular latitude/longitude médias por cidade.
   - Exibir uma bolha por cidade, com tamanho/intensidade proporcional à métrica selecionada.
   - Adicionar toggle entre “Por quantidade de pacientes” e “Por faturamento”.
   - Calcular faturamento por paciente a partir de `lab_producao_feegow`, respeitando o período global e os filtros atuais.

3. **Camada 2 — Rio Verde**
   - Exibir ranking de bairros de Rio Verde com pacientes e faturamento.
   - Permitir alternância da mesma métrica da camada 1.
   - Manter “Não informado” como categoria própria.

4. **Drill-down unificado**
   - Ao selecionar cidade ou bairro, abrir o drawer padrão do dashboard.
   - Listar Data, Paciente, Procedimento, Profissional, Valor e Situação dos atendimentos no período filtrado.
   - Garantir que a seleção da região preserve os filtros globais existentes.

5. **Validação**
   - Conferir a origem e o período dos números exibidos.
   - Verificar estados vazios, localidades sem coordenadas e dados faltantes.
   - Validar a rota em desktop e mobile, sem alterar o restante do dashboard.

## Detalhes técnicos
- Reaproveitar o contexto de filtros e os componentes visuais já existentes.
- Centralizar a normalização em função/utilitário compartilhado, evitando agregações divergentes entre mapa e ranking.
- Expandir as consultas e tipos de dados necessários sem modificar tabelas protegidas/geradas automaticamente.
- Preservar a rota TanStack Start existente e adicionar metadata própria à rota do mapa, se necessário.
