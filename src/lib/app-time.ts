function startOfLocalToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Local calendar date as "YYYY-MM-DD", read from getFullYear/getMonth/
// getDate rather than .toISOString(). .toISOString() converts through UTC,
// which rolls a local-midnight Date (like NOW, or any date built via
// `new Date(y, m, d)`) back to the previous calendar day in every timezone
// ahead of UTC (e.g. GMT+7) -- silently excluding "today" from date-range
// filters and mis-dating "today" defaults on write. Always use this instead
// of `date.toISOString().slice(0, 10)` for calendar-date-only values.
export function toLocalIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

// Business date for filters and dashboards. Create forms also default to the
// real local day, so this must not drift behind them or newly created records
// disappear from "today/YTD" views.
export const NOW = startOfLocalToday();
export const PINNED_TODAY = toLocalIsoDate(NOW);
export const CURRENT_MONTH = NOW.getMonth() + 1;
export const CURRENT_YEAR = NOW.getFullYear();
