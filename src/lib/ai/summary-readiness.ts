/**
 * `useDashboardData` returns `orders.data ?? []` and its `isLoading` only
 * covers the initial load, so a failed query leaves the hook reporting "not
 * loading" with empty arrays. Generating from that state produces a fluent,
 * confident paragraph reporting Rp0 revenue and 0% attainment — worse than no
 * summary at all. Generation is therefore refused unless the data really
 * loaded.
 */
export const DATA_UNAVAILABLE_MESSAGE =
  "Data dashboard gagal dimuat, jadi Ringkasan AI tidak bisa dibuat. Muat ulang halaman lalu coba lagi.";

export function summaryDataBlocked(state: {
  isLoading: boolean;
  hasError: boolean;
}): boolean {
  return state.isLoading || state.hasError;
}
