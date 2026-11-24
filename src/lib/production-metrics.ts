type MetricRow = { valor: number | string | null; valor_pago?: number | string | null; situacao?: string | null };

export function productionMetrics(rows: MetricRow[]) {
  const result = { produzido: 0, faturado: 0, nao_faturado: 0, recebido: 0 };
  for (const row of rows) {
    const value = Number(row.valor ?? 0);
    result.produzido += value;
    if (row.situacao === "Faturado") result.faturado += value;
    if (row.situacao === "Não Faturado") result.nao_faturado += value;
    result.recebido += Number(row.valor_pago ?? 0);
  }
  return result;
}

export function unbilledWarning(produzido: number, naoFaturado: number) {
  return produzido > 0 && naoFaturado / produzido > 0.10;
}

export function missingGroupWarning(value: number) { return value > 1000; }