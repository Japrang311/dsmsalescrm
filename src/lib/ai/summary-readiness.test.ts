import { describe, expect, test } from "bun:test";
import {
  DATA_UNAVAILABLE_MESSAGE,
  summaryDataBlocked,
} from "./summary-readiness";

describe("summaryDataBlocked", () => {
  test("blocks generation while the dashboard data is still loading", () => {
    expect(summaryDataBlocked({ isLoading: true, hasError: false })).toBe(true);
  });

  test("blocks generation when a dashboard query failed, so no all-zero summary is produced", () => {
    // useDashboardData falls back to empty arrays on error and isLoading goes
    // false, so without this guard the model would confidently report Rp0.
    expect(summaryDataBlocked({ isLoading: false, hasError: true })).toBe(true);
  });

  test("allows generation when data loaded successfully", () => {
    expect(summaryDataBlocked({ isLoading: false, hasError: false })).toBe(
      false,
    );
  });

  test("the unavailable message is plain Indonesian and explains why", () => {
    expect(DATA_UNAVAILABLE_MESSAGE.toLowerCase()).toContain("data");
    expect(DATA_UNAVAILABLE_MESSAGE).toContain("Ringkasan");
  });
});
