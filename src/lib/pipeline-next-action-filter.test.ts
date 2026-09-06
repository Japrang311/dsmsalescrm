import { describe, expect, test } from "bun:test";
import type { CommercialItem } from "@/lib/domain";
import {
  filterCommercialItemsByNextWindow,
  matchesPipelineNextWindow,
  pipelineMetricsFromItems,
} from "@/lib/pipeline-next-action-filter";

const asOf = new Date("2026-08-27T00:00:00+07:00");

function item(id: string, patch: Partial<CommercialItem> = {}): CommercialItem {
  return {
    id,
    clientId: `client-${id}`,
    ownerId: "owner-1",
    type: "Quotation",
    sourceFlow: "New Product",
    stage: "Quotes Sent",
    description: `Item ${id}`,
    estimatedValue: 100,
    updatedAt: "2026-08-27",
    ...patch,
  };
}

describe("pipeline next-action filtering", () => {
  test("matches each next-action window by date", () => {
    expect(matchesPipelineNextWindow("2026-08-26", "overdue", asOf)).toBe(true);
    expect(matchesPipelineNextWindow("2026-08-27", "today", asOf)).toBe(true);
    expect(matchesPipelineNextWindow("2026-09-03", "week", asOf)).toBe(true);
    expect(matchesPipelineNextWindow("2026-09-04", "week", asOf)).toBe(false);
    expect(matchesPipelineNextWindow(undefined, "none", asOf)).toBe(true);
    expect(matchesPipelineNextWindow("2026-08-27", "none", asOf)).toBe(false);
    expect(matchesPipelineNextWindow(undefined, "all", asOf)).toBe(true);
  });

  test("filters commercial items using their earliest active linked task date", () => {
    const rows = [
      item("overdue"),
      item("today"),
      item("week"),
      item("future"),
      item("none"),
    ];
    const nextByItem = new Map<string, string | undefined>([
      ["overdue", "2026-08-25"],
      ["today", "2026-08-27"],
      ["week", "2026-09-01"],
      ["future", "2026-09-10"],
      ["none", undefined],
    ]);

    expect(
      filterCommercialItemsByNextWindow(rows, nextByItem, "overdue", asOf).map(
        (row) => row.id,
      ),
    ).toEqual(["overdue"]);
    expect(
      filterCommercialItemsByNextWindow(rows, nextByItem, "today", asOf).map(
        (row) => row.id,
      ),
    ).toEqual(["today"]);
    expect(
      filterCommercialItemsByNextWindow(rows, nextByItem, "week", asOf).map(
        (row) => row.id,
      ),
    ).toEqual(["today", "week"]);
    expect(
      filterCommercialItemsByNextWindow(rows, nextByItem, "none", asOf).map(
        (row) => row.id,
      ),
    ).toEqual(["none"]);
  });

  test("builds visible pipeline metrics from filtered items", () => {
    const metrics = pipelineMetricsFromItems([
      item("open", { estimatedValue: 100, stage: "Commit" }),
      item("won", { estimatedValue: 200, stage: "Closed Won" }),
      item("lost", { estimatedValue: 300, stage: "Closed Lost" }),
    ]);

    expect(metrics.totals).toMatchObject({
      itemCount: 3,
      totalValue: 600,
      openValue: 100,
      wonValue: 200,
      lostValue: 300,
      wonCount: 1,
      lostCount: 1,
      winRate: 50,
    });
  });
});
