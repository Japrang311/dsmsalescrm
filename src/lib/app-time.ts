function startOfLocalToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Business date for filters and dashboards. Create forms also default to the
// real local day, so this must not drift behind them or newly created records
// disappear from "today/YTD" views.
export const NOW = startOfLocalToday();
export const PINNED_TODAY = [
  NOW.getFullYear(),
  String(NOW.getMonth() + 1).padStart(2, "0"),
  String(NOW.getDate()).padStart(2, "0"),
].join("-");
export const CURRENT_MONTH = NOW.getMonth() + 1;
export const CURRENT_YEAR = NOW.getFullYear();
