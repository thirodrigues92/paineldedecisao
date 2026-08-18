# Plan: Lab — Faturamento x Recebimento

## Goals
Create an isolated experimental module for auditing billing vs collection.

## Technical Details

### 1. Database (PostgreSQL)
- **Tables**: lab_faturamento, lab_recebimento, lab_sync_log, lab_dim_categoria, lab_dim_centro_custo.
- **View**: lab_vw_faturado_x_recebido.
- **Isolation**: All tables prefixed with lab_.
- **Security**: Enable RLS and standard grants.

### 2. Edge Functions
- **lab-debug-feegow**: Diagnostic only, returns raw JSON.
- **lab-sync-particular**: Syncs financial/list-accounts (billing and payments).
- **lab-sync-convenio**: Syncs billing/insurances-billing guides.
- **Utils**: Shared logic for Brazilian number format (R$ 1.234,56) and date parsing.

### 3. Frontend (TanStack Start)
- **Route**: /lab/faturamento (new route).
- **Sidebar**: Add 'Lab - Faturamento' in a dedicated Experimental section.
- **Tabs**:
  1. **Diagnóstico**: Raw API explorer.
  2. **Sincronização**: Execution controls and logs.
  3. **Faturado x Recebido**: KPI cards and comparative charts.
  4. **Auditoria**: Data quality and raw record inspection.

### 4. Implementation Details
- Ensure all monetary values are numeric(14,2).
- Paginate API calls with start/offset.
- Store raw payloads for auditing.
