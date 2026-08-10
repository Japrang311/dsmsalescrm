export function formatDays(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)} hari`;
}
