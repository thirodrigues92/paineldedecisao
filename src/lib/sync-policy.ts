export const PAUSE_HOURS = 2;
export const RETRY_DELAY_MS = 2000;
export const SYNC_STAGES = ['producao', 'safety', 'repasse', 'receita', 'itens', 'agendamentos'] as const;
export function appointmentWindow(today: string) {
  const shift = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return { inicio: shift(-2), fim: shift(7) };
}
export function pauseExpired(until: string | null, now = Date.now()) {
  // Legacy indefinite automatic pauses must also be retried.
  return until === null || new Date(until).getTime() <= now;
}
export async function isolatedStage<T>(task: () => Promise<T>) {
  try { return { ok: true as const, result: await task() }; }
  catch (error) { return { ok: false as const, erro: error instanceof Error ? error.message : String(error) }; }
}