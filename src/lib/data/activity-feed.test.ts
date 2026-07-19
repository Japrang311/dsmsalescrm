import { describe, expect, test } from "bun:test";
import { buildActivityFeed } from "@/lib/data/activity-feed";
import type { ActivityLogEntry } from "@/lib/data/activity-log";

describe("buildActivityFeed", () => {
  test("maps persisted sales-order creation into a linked feed event", () => {
    const activity: ActivityLogEntry[] = [
      {
        id: "activity-1",
        kind: "sales_order_created",
        kindLabel: "Sales Order Baru",
        ownerId: "sales-1",
        actorId: "sales-1",
        clientId: "client-1",
        salesOrderId: "so-1",
        title: "SO DSM-001 dibuat",
        detail: "Regular · PPN",
        createdAt: "2026-07-19T08:00:00.000Z",
      },
    ];

    expect(
      buildActivityFeed({
        activity,
        followUps: [],
        owners: { "sales-1": { name: "Aditya" } },
        commercialItems: [],
      }),
    ).toEqual([
      {
        id: "activity-activity-1",
        at: "2026-07-19T08:00:00.000Z",
        kind: "order_created",
        clientId: "client-1",
        ownerName: "Aditya",
        title: "SO DSM-001 dibuat",
        detail: "Regular · PPN",
        link: {
          to: "/sales-orders/$soId",
          params: { soId: "so-1" },
          label: "Buka Sales Order",
        },
      },
    ]);
  });

  test("contains only the supplied persisted activity and follow-ups", () => {
    const feed = buildActivityFeed({
      activity: [],
      followUps: [
        {
          id: "follow-up-1",
          clientId: "client-1",
          ownerId: "sales-1",
          fuDate: "2026-07-19",
          method: "Phone",
          result: "Interested",
          notes: "Minta quotation",
          createdAt: "2026-07-19T07:00:00.000Z",
        },
      ],
      owners: { "sales-1": { name: "Aditya" } },
      commercialItems: [],
    });

    expect(feed.map((event) => event.id)).toEqual(["follow-up-follow-up-1"]);
  });
});
