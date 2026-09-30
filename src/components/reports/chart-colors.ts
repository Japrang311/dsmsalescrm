// These were hardcoded hex duplicates of the --chart-* tokens already defined
// for both themes in styles.css. Referencing the tokens instead means the
// charts follow dark mode for free (the light values shift by a hair, which is
// the token being the single source of truth rather than the copy).
export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];
