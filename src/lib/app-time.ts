// The prototype uses a deterministic business date so dashboards and fixtures
// remain stable across local runs. Replace this one value when the product
// moves to a server-provided organization clock.
export const PINNED_TODAY = "2026-07-17";
export const NOW = new Date(PINNED_TODAY);
export const CURRENT_MONTH = NOW.getMonth() + 1;
export const CURRENT_YEAR = NOW.getFullYear();
