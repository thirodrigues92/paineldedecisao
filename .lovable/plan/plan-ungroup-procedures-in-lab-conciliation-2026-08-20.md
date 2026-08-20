# Plan - Ungroup Procedures in Lab Conciliation

The user reported that the reconciliation screen is grouping procedures for the same patient on the same day. This usually happens when multiple procedures are linked to the same `agendamento_id` or when the UI logic aggregates items by agendamento.

## User Review Required

> [!IMPORTANT]
> I will modify the reconciliation logic to treat each individual procedure/execution as a separate line item, rather than grouping them by appointment. This will ensure the dashboard matches the Feegow production report item by item.

## Technical Details

### 1. Data Processing Update
- In `src/lib/lab-faturamento.functions.ts`, the `getLabConciliacao` function currently treats `agenda` (from `lab_producao_feegow`) as the primary list.
- If multiple procedures share the same `agendamento_id` but have different `feegow_id`s in `lab_producao_feegow`, the current logic might be summing values or simply picking one if not careful.
- Actually, the current code maps over `agenda` which contains rows from `lab_producao_feegow`. If `lab_producao_feegow` has one row per procedure (which it should, as it comes from a production report), the grouping might be happening in how we link faturamentos.
- **The Issue:** `faturamentoMap` groups by `agendamento_id`. If one appointment has two procedures, the map stores the *sum* of both faturamentos for that ID. Then, when mapping the first production row, it shows the total sum. When mapping the second production row, it also shows the total sum. This makes it look like they are "grouped" or duplicated in value.

### 2. Proposed Solution
- Change the matching logic to be more granular. Since `lab_faturamento` also has `item_id` and `procedimento_id`, I will try to match production records to faturamento items using both `agendamento_id` AND `procedimento_id` (or even `item_id` if available in the production payload).
- If an exact match isn't possible (e.g., faturamento doesn't have the procedure ID correctly set but has the appointment ID), I will distribute the faturamentos across the production items to avoid double-counting the total appointment value on each line.

### 3. UI Changes
- In `src/routes/lab/conciliacao.tsx`, ensure the table key uses a unique identifier (like a combination of `agendamento_id` and `procedimento_id` or the `feegow_id` if passed through).

## Proposed Changes

#### [src/lib/lab-faturamento.functions.ts](src/lib/lab-faturamento.functions.ts)
- Update `getLabConciliacao` to include `feegow_id` from production.
- Refactor `faturamentoMap` to be more specific (e.g., Map of `agendamento_id` to an array of faturamento items).
- Implement a smarter "attribution" logic to link specific faturamento items to production rows.

#### [src/routes/lab/conciliacao.tsx](src/routes/lab/conciliacao.tsx)
- Update table key to `item.feegow_id` or similar unique key.
- Display individual values per line correctly.
