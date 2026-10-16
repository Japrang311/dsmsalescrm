import { describe, expect, test } from "bun:test";
import { CRM_ORDERS, CRM_TARGETS } from "../../tests/fixtures/crm-reliability";
import { defaultReportFilters } from "@/components/reports/report-filters";
import { filterSalesOrders } from "./report-selectors";
import {
  metricScope,
  targetComparison,
  customerShare,
} from "./report-metric-scope";

const filters = (from: string, to: string) =>
  defaultReportFilters({
    from: new Date(`${from}T12:00:00`),
    to: new Date(`${to}T12:00:00`),
  });

describe("Reports accepted metric contract", () => {
  test("AC01 includes both boundaries and uses whole filtered population", () => {
    const rows = filterSalesOrders(
      CRM_ORDERS,
      filters("2026-02-01", "2026-02-28"),
    );
    const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    expect(total).toBe(100_000_000);
    expect(customerShare(rows[0].value!, total)).toBe(0.2);
    expect(customerShare(0, 0)).toBeNull();
  });
  test("AC02 sums full calendar months across years", () => {
    const scope = metricScope(filters("2025-12-01", "2026-02-28"));
    expect(scope.from).toBe("2025-12-01");
    expect(targetComparison(scope, CRM_TARGETS).target).toBe(150_000_000);
    expect(targetComparison(scope, CRM_TARGETS).comparable).toBe(true);
  });
  test("leap day is a full February; invalid dates and reversed ranges fail", () => {
    expect(
      targetComparison(metricScope(filters("2024-02-01", "2024-02-29")), [])
        .comparable,
    ).toBe(true);
    expect(() => metricScope(filters("2026-03-01", "2026-02-01"))).toThrow();
    expect(() => metricScope(filters("bad", "2026-02-01"))).toThrow();
  });
  test("partial periods never prorate and subsets never borrow team targets", () => {
    expect(
      targetComparison(
        metricScope(filters("2026-02-02", "2026-02-28")),
        CRM_TARGETS,
      ).target,
    ).toBeNull();
    for (const key of ["clientId", "taxType", "soType", "source"] as const) {
      expect(
        targetComparison(
          metricScope({
            ...filters("2026-02-01", "2026-02-28"),
            [key]: {
              clientId: "subset",
              taxType: "PPN",
              soType: "Regular",
              source: "New Product",
            }[key],
          }),
          CRM_TARGETS,
        ).comparable,
      ).toBe(false);
    }
  });
  test("owner allocation excludes other owners; query errors cannot be supplied as targets", () => {
    const scope = metricScope({
      ...filters("2026-02-01", "2026-02-28"),
      ownerId: "owner-b",
    });
    expect(targetComparison(scope, CRM_TARGETS).target).toBe(0);
  });
});
