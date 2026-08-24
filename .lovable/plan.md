# Plan: Particular Revenue Breakdown by Payment Method

The user wants to see how "Particular" (private pay) revenue was billed (e.g., PIX, Transfer, Cash) when clicking on the "Particular" slice of the dashboard charts. Currently, the drill-down only shows procedures and items without grouping by payment method.

## Proposed Changes

### 1. Database & Library (`src/lib/dashboard-data.ts`)
- Update `fetchLabProducaoRows` to fetch payment information from `lab_recebimento` (which stores `forma_pagamento`) linked via `documento_id` (the Feegow `invoice_id`).
- Enrich the `LabProducaoRow` type and the returned objects with a `formas_pagamento` array or a primary payment method.

### 2. UI - Dashboard (`src/routes/_authenticated/dashboard.tsx` & `src/routes/public-dashboard.tsx`)
- In the `detalheOrigem` drill-down (when clicking "Particular"):
  - Add a summary section showing the breakdown by payment method (Total PIX, Total Dinheiro, etc.).
  - Update the item list to display the payment method used for each launch if available.
- Ensure these changes are reflected in both the authenticated and public dashboards.

## Verification Plan
1. **Visual Check**: Open the dashboard, click on the "Particular" slice of the "Particular vs. Convênio" chart.
2. **Data Integrity**: Verify that the sum of payment methods matches the total particular revenue displayed.
3. **Fallback**: Ensure that records without specific payment data (e.g., old syncs) display a "Não informado" status rather than breaking.
