# Plan: Visual Improvements for Payment Methods Chart

The user wants to revert the changes made to the Pie Chart ("Particular vs. Convênio") and instead apply visual improvements (larger, more colorful) to the "Formas de Pagamento (Particular)" bar chart.

## Proposed Changes

### 1. Revert Pie Chart Changes
- Restore the height of the Pie Chart container to its previous value (around `h-72`).
- Revert the `innerRadius` and `outerRadius` to their original proportions.
- Remove the extra padding and custom cell styling that was added.

### 2. Enhance Payment Methods Chart
- Increase the height of the "Formas de Pagamento (Particular)" chart container (e.g., from `h-[120px]` to `h-[300px]`).
- Improve the color scheme of the bars to be more vibrant and diverse (using a color scale instead of a single primary fade).
- Increase font sizes for better readability.
- Add grid lines or background bars for better visual context.
- Ensure these changes are applied to both `src/routes/_authenticated/dashboard.tsx` and `src/routes/public-dashboard.tsx`.

## Verification Plan
- Check the layout in the preview to ensure the Pie Chart is back to normal size.
- Verify that the "Formas de Pagamento" chart is larger and has a better color palette.
- Confirm the changes persist in both administrative and public dashboard views.
