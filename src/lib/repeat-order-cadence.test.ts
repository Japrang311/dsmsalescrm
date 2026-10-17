import { describe, expect, test } from "bun:test";
import {
  REPEAT_ORDER_RULE_VERSION,
  evaluateRepeatOrderCadence,
} from "./repeat-order-cadence";
import { normalizeRepeatOrderSnapshot } from "./data/repeat-order-cadence";

describe("repeat-order cadence D05", () => {
  test("deduplicates order dates and excludes dates outside the 365-day window", () => {
    expect(
      evaluateRepeatOrderCadence({
        asOfDate: "2026-10-17",
        historyObservedFrom: "2025-01-01",
        orderDates: [
          "2025-10-17",
          "2025-10-18",
          "2026-07-01",
          "2026-08-01",
          "2026-08-01",
          "2026-09-01",
          "2026-11-01",
        ],
      }),
    ).toMatchObject({
      ruleVersion: REPEAT_ORDER_RULE_VERSION,
      historyWindowStartDate: "2025-10-18",
      historyWindowEndDate: "2026-10-17",
      historyCoverage: "full_window",
      sampleCount: 4,
      intervalCount: 3,
      lastOrderDate: "2026-09-01",
      medianIntervalDays: 31,
      daysSinceLastOrder: 46,
      overdueThresholdDays: 46.5,
      state: "on_cadence",
    });
  });

  test("uses the median so one outlier does not distort the overdue signal", () => {
    expect(
      evaluateRepeatOrderCadence({
        asOfDate: "2026-11-20",
        historyObservedFrom: "2020-01-01",
        orderDates: ["2026-06-01", "2026-07-01", "2026-07-31", "2026-09-29"],
      }),
    ).toEqual({
      ruleVersion: "d05-v1",
      historyWindowStartDate: "2025-11-21",
      historyWindowEndDate: "2026-11-20",
      historyObservedFrom: "2020-01-01",
      historyCoverage: "full_window",
      sampleCount: 4,
      intervalCount: 3,
      lastOrderDate: "2026-09-29",
      medianIntervalDays: 30,
      daysSinceLastOrder: 52,
      overdueThresholdDays: 45,
      overdueByDays: 7,
      state: "overdue",
      reason:
        "Terlambat 7 hari: 52 hari sejak order terakhir, melewati ambang 45 hari.",
    });
  });

  test("does not emit a risk label below the four-date minimum", () => {
    expect(
      evaluateRepeatOrderCadence({
        asOfDate: "2026-10-17",
        historyObservedFrom: "2026-07-01",
        orderDates: ["2026-07-01", "2026-08-01", "2026-09-01"],
      }),
    ).toMatchObject({
      historyCoverage: "partial_window",
      sampleCount: 3,
      intervalCount: 2,
      medianIntervalDays: null,
      overdueThresholdDays: null,
      overdueByDays: null,
      state: "data_insufficient",
      reason:
        "Data belum cukup: 3 dari minimum 4 tanggal order berbeda dalam 365 hari.",
    });
  });

  test("keeps an older factual last order while assigning no risk without window samples", () => {
    expect(
      evaluateRepeatOrderCadence({
        asOfDate: "2026-10-17",
        historyObservedFrom: "2020-01-01",
        orderDates: ["2025-01-01", "2026-10-18"],
      }),
    ).toMatchObject({
      sampleCount: 0,
      intervalCount: 0,
      lastOrderDate: "2025-01-01",
      daysSinceLastOrder: 654,
      medianIntervalDays: null,
      overdueThresholdDays: null,
      state: "data_insufficient",
      reason:
        "Data belum cukup: 0 dari minimum 4 tanggal order berbeda dalam 365 hari.",
    });
  });

  test("uses a strict greater-than cutoff and supports a fractional threshold", () => {
    const exactThreshold = evaluateRepeatOrderCadence({
      asOfDate: "2026-10-16",
      historyObservedFrom: "2020-01-01",
      orderDates: ["2026-06-01", "2026-07-01", "2026-07-31", "2026-09-01"],
    });
    expect(exactThreshold).toMatchObject({
      medianIntervalDays: 30,
      overdueThresholdDays: 45,
      daysSinceLastOrder: 45,
      overdueByDays: 0,
      state: "on_cadence",
    });

    const fractionalThreshold = evaluateRepeatOrderCadence({
      asOfDate: "2026-10-08",
      historyObservedFrom: "2020-01-01",
      orderDates: [
        "2026-06-01",
        "2026-06-11",
        "2026-07-01",
        "2026-07-31",
        "2026-09-01",
      ],
    });

    expect(fractionalThreshold).toMatchObject({
      medianIntervalDays: 25,
      overdueThresholdDays: 37.5,
      daysSinceLastOrder: 37,
      overdueByDays: 0,
      state: "on_cadence",
    });
  });

  test("keeps a quarterly seasonal cadence transparent instead of calling it churn", () => {
    expect(
      evaluateRepeatOrderCadence({
        asOfDate: "2026-12-31",
        historyObservedFrom: "2020-01-01",
        orderDates: ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01"],
      }),
    ).toMatchObject({
      medianIntervalDays: 91,
      daysSinceLastOrder: 91,
      overdueThresholdDays: 136.5,
      state: "on_cadence",
    });
  });
});

describe("repeat-order cadence adapter", () => {
  test("normalizes numeric fields and accepts an internally consistent snapshot", () => {
    const snapshot = normalizeRepeatOrderSnapshot({
      asOfDate: "2026-11-20",
      fetchedAt: "2026-11-20T01:00:00Z",
      ruleVersion: "d05-v1",
      historyWindow: {
        days: 365,
        startDate: "2025-11-21",
        endDate: "2026-11-20",
      },
      totals: {
        candidateCount: 1,
        overdueCount: 1,
        onCadenceCount: 0,
        dataInsufficientCount: 0,
        partialHistoryCount: 0,
      },
      page: { limit: 50, offset: 0, returnedCount: 1, totalCount: 1 },
      items: [
        {
          clientId: "00000000-0000-4000-8000-000000000001",
          clientName: "Fixture Client",
          ownerId: "00000000-0000-4000-8000-000000000002",
          ownerName: "Fixture Owner",
          clientStatus: "Repeat Order",
          ruleVersion: "d05-v1",
          historyWindowStartDate: "2025-11-21",
          historyWindowEndDate: "2026-11-20",
          historyObservedFrom: "2025-01-01",
          historyCoverage: "full_window",
          sampleCount: 4,
          intervalCount: 3,
          lastOrderDate: "2026-09-29",
          medianIntervalDays: "30",
          daysSinceLastOrder: 52,
          overdueThresholdDays: "45",
          overdueByDays: "7",
          state: "overdue",
          reason:
            "Terlambat 7 hari: 52 hari sejak order terakhir, melewati ambang 45 hari.",
          sourceHref: "/clients/00000000-0000-4000-8000-000000000001",
        },
      ],
    });

    expect(snapshot.items[0]).toMatchObject({
      medianIntervalDays: 30,
      overdueThresholdDays: 45,
      overdueByDays: 7,
    });
  });

  test("rejects a risk label below the approved minimum sample", () => {
    expect(() =>
      normalizeRepeatOrderSnapshot({
        asOfDate: "2026-11-20",
        fetchedAt: "2026-11-20T01:00:00Z",
        ruleVersion: "d05-v1",
        historyWindow: {
          days: 365,
          startDate: "2025-11-21",
          endDate: "2026-11-20",
        },
        totals: {
          candidateCount: 1,
          overdueCount: 1,
          onCadenceCount: 0,
          dataInsufficientCount: 0,
          partialHistoryCount: 1,
        },
        page: { limit: 50, offset: 0, returnedCount: 1, totalCount: 1 },
        items: [
          {
            clientId: "00000000-0000-4000-8000-000000000001",
            clientName: "Fixture Client",
            ownerId: "00000000-0000-4000-8000-000000000002",
            ownerName: "Fixture Owner",
            clientStatus: "Active Customer",
            ruleVersion: "d05-v1",
            historyWindowStartDate: "2025-11-21",
            historyWindowEndDate: "2026-11-20",
            historyObservedFrom: "2026-06-01",
            historyCoverage: "partial_window",
            sampleCount: 3,
            intervalCount: 2,
            lastOrderDate: "2026-09-29",
            medianIntervalDays: 30,
            daysSinceLastOrder: 52,
            overdueThresholdDays: 45,
            overdueByDays: 7,
            state: "overdue",
            reason: "Invalid risk label",
            sourceHref: "/clients/00000000-0000-4000-8000-000000000001",
          },
        ],
      }),
    ).toThrow("REPEAT_ORDER_SNAPSHOT_MISMATCH");
  });
});
