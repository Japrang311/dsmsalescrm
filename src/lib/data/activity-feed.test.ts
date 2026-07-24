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

  test("maps commercial and Sales Order delete/restore audit events", () => {
    const kinds: ActivityLogEntry["kind"][] = [
      "commercial_document_deleted",
      "commercial_document_restored",
      "sales_order_deleted",
      "sales_order_restored",
    ];
    const activity: ActivityLogEntry[] = kinds.map((kind, index) => ({
      id: String(index),
      kind,
      kindLabel: "Lifecycle",
      ownerId: "sales-1",
      actorId: "manager-1",
      commercialDocumentId: kind.startsWith("commercial") ? "doc-1" : undefined,
      salesOrderId: kind.startsWith("sales_order") ? "so-1" : undefined,
      title: kind,
      createdAt: `2026-07-24T0${index}:00:00.000Z`,
    }));

    const feed = buildActivityFeed({
      activity,
      followUps: [],
      owners: { "manager-1": { name: "Manager" } },
      commercialItems: [],
    });

    expect(feed).toHaveLength(4);
    expect(feed.map((event) => event.kind)).toEqual([
      "record_lifecycle",
      "record_lifecycle",
      "record_lifecycle",
      "record_lifecycle",
    ]);
  });
});
