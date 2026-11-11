/** Invalid source identifiers remain in payload_raw, never rounded into another ID. */
export function feegowIntegerId(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 && id <= 2147483647 ? id : null;
}