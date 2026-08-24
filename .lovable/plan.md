# Plan - Drill-down Enhancements for Dashboard

The objective is to implement a detailed drill-down for the "Formas de Pagamento (Particular)" chart. When a user clicks on a payment method bar (like "Cartão de Crédito"), the application will open a side panel (`Sheet`) showing the grouped procedures for that specific payment method. Clicking on a procedure will then reveal the individual transactions (patients).

## Proposed Changes

### 1. State Management
- Add `detalhePagamento` state in both `src/routes/_authenticated/dashboard.tsx` and `src/routes/public-dashboard.tsx` to track the selected payment method for drill-down.

### 2. Logic Update
- Modify the `filteredRows` logic within the `byOrigem` bucket generation to support filtering by `forma_pagamento`.
- Ensure "Múltiplas Formas" logic is consistent (it will show all "Particular" transactions that have multiple payment methods concatenated).

### 3. UI Components
- Update the `Bar` click handler in the "Formas de Pagamento" chart to set `detalhePagamento`.
- Update the `Sheet` component to render when `detalhePagamento` is set, showing the correct procedures and their drill-down into transactions.

### 4. Code Consistency
- Apply identical logic to both the administrative (`_authenticated/dashboard.tsx`) and public (`public-dashboard.tsx`) dashboards.

## Detailed Implementation Steps

### Step 1: `src/routes/_authenticated/dashboard.tsx`
- Add `const [detalhePagamento, setDetalhePagamento] = useState<string | null>(null);`
- Update `byOrigem` calculation to include `detalhePagamento` in its dependencies and filtering logic.
- Update the `onClick` handler of the `Bar` in the "Formas de Pagamento" chart.
- Ensure the `Sheet` for `activeBucket` correctly identifies and displays data when `detalhePagamento` is active.
- Close `detalhePagamento` when the sheet is dismissed.

### Step 2: `src/routes/public-dashboard.tsx`
- Mirror the changes from Step 1.

### Step 3: `src/lib/dashboard-data.ts` (if needed)
- No changes expected here as `fetchLabProducaoRows` already returns `forma_pagamento`.
