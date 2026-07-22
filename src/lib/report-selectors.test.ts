import { describe, expect, test } from "bun:test";

import { defaultReportFilters } from "@/components/reports/ReportFilterBar";
import { CURRENT_YEAR, NOW, PINNED_TODAY } from "@/lib/domain";
import type { SalesOrder } from "@/lib/domain";
import { filterSalesOrders } from "./report-selectors";

function order(date: string): SalesOrder {
  return {
    id: `so-${date}`,
    soNumber: `DSM-${date}-SO`,
    clientId: "client-1",
    ownerId: "owner-1",
    type: "Regular",
    taxType: "PPN",
    source: "Existing / Repeat Order",
    value: 1_000_000,
    date,
  };
}

describe("report selectors", () => {
  test("includes sales orders created on the current business day", () => {
    const filters = defaultReportFilters({
      from: new Date(CURRENT_YEAR, 0, 1),
      to: NOW,
    });

    expect(filterSalesOrders([order(PINNED_TODAY)], filters)).toHaveLength(1);
  });

  test("keeps future-dated sales orders outside the default range", () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureIso = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");
    const filters = defaultReportFilters({
      from: new Date(CURRENT_YEAR, 0, 1),
      to: NOW,
    });

    expect(filterSalesOrders([order(futureIso)], filters)).toHaveLength(0);
  });
});
