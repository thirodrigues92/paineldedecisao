# Plan - Fix Date Discrepancy and Enhance CSV Export in Lab Conciliation

The user reported that dates in the reconciliation screen are shown as 16/08/2026 instead of 17/08/2026, and requested a better CSV export for analysis.

## User Review Required

> [!IMPORTANT]
> I will fix the date display to ensure it shows the exact date stored in the database (avoiding timezone shifts) and I will update the CSV export to include all relevant data in separate columns.

## Technical Details

### 1. Date Fix
- The issue is likely due to `new Date(item.data).toLocaleDateString('pt-BR')` in `src/routes/lab/conciliacao.tsx`. When a date string like "2026-08-17" is passed to `new Date()`, it is treated as UTC midnight. Depending on the browser's local timezone (e.g., UTC-3 for Brazil), it might shift to the previous day (e.g., 2026-08-16 21:00).
- **Solution:** I will use a utility function to format the date string directly or use `new Date(item.data + 'T12:00:00')` to avoid the shift.

### 2. Enhanced CSV Export
- Update the `exportCSV` function in `src/routes/lab/conciliacao.tsx` to include additional columns like "Profissional", "Procedimento", and ensure each item is in its own column.

### 3. Sync Logic Review
- Briefly check if the `labSyncProducao` function in `src/lib/lab-faturamento.functions.ts` handles the date range correctly.

## Proposed Changes

### Logic & Helpers
#### [src/lib/lab-faturamento.functions.ts](src/lib/lab-faturamento.functions.ts)
- Add a helper to format dates for the UI without timezone issues if needed, or ensure the server returns formatted strings.

### Components & Routes
#### [src/routes/lab/conciliacao.tsx](src/routes/lab/conciliacao.tsx)
- Update date formatting in the table row.
- Expand the `exportCSV` columns and data mapping.
- Ensure "Pagamento" column is included in the export (if not already fully covered).

### Database & Memory
#### [mem://features/lab-conciliacao-date-fix.md](mem://features/lab-conciliacao-date-fix.md)
- Record the fix for future reference.
