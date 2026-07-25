import { describe, expect, test } from "bun:test";

import { defaultReportFilters } from "@/components/reports/ReportFilterBar";
import { CURRENT_YEAR, NOW, PINNED_TODAY } from "@/lib/domain";
import type { CommercialItem, SalesOrder } from "@/lib/domain";
import {
  filterSalesOrders,
  quotationLostReasonBreakdown,
} from "./report-selectors";

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

  test("summarizes lost quotation count and value for dashboard reporting", () => {
    const lostQuotation = (
      id: string,
      reason: CommercialItem["lostReason"],
      estimatedValue: number,
    ): CommercialItem => ({
      id,
      clientId: "client-1",
      ownerId: "owner-1",
      type: "Quotation",
      sourceFlow: "RFQ / New Product",
      stage: "Closed Lost",
      description: id,
      estimatedValue,
      updatedAt: "2026-07-25T00:00:00.000Z",
      lostReason: reason,
    });

    expect(
      quotationLostReasonBreakdown([
        lostQuotation("quo-1", "Tidak ada respons", 4_000_000),
        lostQuotation("quo-2", "Harga tidak kompetitif", 8_000_000),
      ]),
    ).toEqual([
      {
        reason: "Harga tidak kompetitif",
        quotationCount: 1,
        lostValue: 8_000_000,
      },
      {
        reason: "Tidak ada respons",
        quotationCount: 1,
        lostValue: 4_000_000,
      },
    ]);
  });
});
