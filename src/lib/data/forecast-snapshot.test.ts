import { describe, expect, test } from "bun:test";
import {
  normalizeForecastSnapshot,
  reconcileForecastItems,
} from "./forecast-snapshot";

describe("forecast snapshot adapter", () => {
  test("normalizes numeric JSON values and preserves unavailable historical forecast", () => {
    const current = normalizeForecastSnapshot({
      snapshotMode: "current",
      period: { from: "2026-10-01", to: "2026-10-31" },
      asOfDate: "2026-10-16",
      fetchedAt: "2026-10-16T10:00:00Z",
      salesOrderValue: "5000",
      openPipelineValue: "300",
      forecastValue: "5300",
      undated: { count: 0, totalValue: "0" },
      overdue: { count: 0, totalValue: "0", weightedValue: "0" },
      page: {
        limit: 100,
        offset: 0,
        totalCount: 1,
        contributionValue: "300",
      },
      items: [
        {
          documentId: "q-1",
          quotationNumber: "QUO-1",
          clientId: "c-1",
          clientName: "Client",
          ownerId: "o-1",
          ownerName: "Sales",
          stage: "Quotes Sent",
          expectedCloseDate: "2026-10-20",
          totalValue: "1000",
          weight: "0.3",
          weightedValue: "300",
          bucket: "scheduled",
          contributes: true,
        },
      ],
    });
    expect(current.openPipelineValue).toBe(300);
    expect(current.items[0].weight).toBe(0.3);
    expect(reconcileForecastItems(current.items)).toBe(300);

    const historical = normalizeForecastSnapshot({
      ...current,
      snapshotMode: "historical_unavailable",
      openPipelineValue: null,
      forecastValue: null,
      page: { limit: 100, offset: 0, totalCount: 0, contributionValue: 0 },
      items: [],
    });
    expect(historical.openPipelineValue).toBeNull();
    expect(historical.forecastValue).toBeNull();
  });

  test("rejects aggregate and drilldown values that do not reconcile", () => {
    expect(() =>
      normalizeForecastSnapshot({
        snapshotMode: "current",
        period: { from: "2026-10-01", to: "2026-10-31" },
        asOfDate: "2026-10-16",
        fetchedAt: "2026-10-16T10:00:00Z",
        salesOrderValue: 5_000,
        openPipelineValue: 999,
        forecastValue: 5_999,
        undated: { count: 0, totalValue: 0 },
        overdue: { count: 0, totalValue: 0, weightedValue: 0 },
        page: {
          limit: 100,
          offset: 0,
          totalCount: 0,
          contributionValue: 0,
        },
        items: [],
      }),
    ).toThrow("FORECAST_DRILLDOWN_MISMATCH");
  });
});
