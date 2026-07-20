import type { CommercialItem } from "@/lib/domain";
import type { ActivityLogEntry } from "@/lib/data/activity-log";
import type { FollowUpLog } from "@/lib/data/follow-ups";

export type FeedLink = {
  to: string;
  params?: Record<string, string>;
  label: string;
};

export type FeedEvent = {
  id: string;
  at: string;
  kind:
    | "follow_up"
    | "client_created"
    | "status_change"
    | "commercial_history"
    | "task_history"
    | "commercial_created"
    | "order_created"
    | "task_created"
    | "so_tax_change"
    | "team_admin";
  clientId?: string;
  ownerName?: string;
  actorName?: string;
  targetName?: string;
  kindLabel?: string;
  administrativeReason?: string;
  title: string;
  detail?: string;
  link?: FeedLink;
};

// Direct Order/Prototype/Customer PO no longer have a dedicated list/detail
// page — those pages always read from commercial_documents, which never
// carries those types for real (sheet-imported) data (they're recorded as
// sales_orders instead); the pages were removed 2026-07-20. RFQ/Quotation
// are the only real commercial_documents types.
const COMMERCIAL_ROUTE: Partial<
  Record<CommercialItem["type"], { to: string; label: string }>
> = {
  RFQ: { to: "/rfq/$id", label: "Buka RFQ" },
  Quotation: { to: "/quotations/$id", label: "Buka Quotation" },
};

function commercialLink(
  item: Pick<CommercialItem, "id" | "type"> | undefined,
): FeedLink | undefined {
  if (!item) return undefined;
  const route = COMMERCIAL_ROUTE[item.type];
  return route
    ? { to: route.to, params: { id: item.id }, label: route.label }
    : undefined;
}

type BuildActivityFeedInput = {
  activity: ActivityLogEntry[];
  followUps: FollowUpLog[];
  owners: Record<string, { name: string }>;
  commercialItems: CommercialItem[];
};

export function buildActivityFeed({
  activity,
  followUps,
  owners,
  commercialItems,
}: BuildActivityFeedInput): FeedEvent[] {
  const commercialIndex = new Map(
    commercialItems.map((item) => [item.id, item]),
  );

  const events: FeedEvent[] = followUps.map((followUp) => ({
    id: `follow-up-${followUp.id}`,
    at: followUp.createdAt,
    kind: "follow_up",
    clientId: followUp.clientId,
    ownerName: owners[followUp.ownerId]?.name,
    title: `${followUp.method} · ${followUp.result}`,
    detail: followUp.notes || followUp.nextAction,
    link: commercialLink(commercialIndex.get(followUp.commercialItemId ?? "")),
  }));

  for (const entry of activity) {
    const base = {
      id: `activity-${entry.id}`,
      at: entry.createdAt,
      clientId: entry.clientId,
      ownerName: owners[entry.actorId]?.name,
      title: entry.title,
      detail: entry.detail,
    };

    if (entry.kind === "client_created") {
      events.push({ ...base, kind: "client_created" });
    } else if (entry.kind === "client_status_change") {
      events.push({ ...base, kind: "status_change" });
    } else if (entry.kind === "commercial_item_created") {
      events.push({
        ...base,
        kind: "commercial_created",
        link: commercialLink(commercialIndex.get(entry.commercialItemId ?? "")),
      });
    } else if (entry.kind === "commercial_item_stage_change") {
      events.push({
        ...base,
        kind: "commercial_history",
        link: commercialLink(commercialIndex.get(entry.commercialItemId ?? "")),
      });
    } else if (entry.kind === "task_created") {
      events.push({
        ...base,
        kind: "task_created",
        link: { to: "/tasks", label: "Buka Task Inbox" },
      });
    } else if (entry.kind === "task_status_change") {
      events.push({
        ...base,
        kind: "task_history",
        link: { to: "/tasks", label: "Buka Task Inbox" },
      });
    } else if (entry.kind === "sales_order_created") {
      events.push({
        ...base,
        kind: "order_created",
        link: entry.salesOrderId
          ? {
              to: "/sales-orders/$soId",
              params: { soId: entry.salesOrderId },
              label: "Buka Sales Order",
            }
          : undefined,
      });
    } else if (entry.kind === "sales_order_tax_change") {
      events.push({
        ...base,
        kind: "so_tax_change",
        link: entry.salesOrderId
          ? {
              to: "/sales-orders/$soId",
              params: { soId: entry.salesOrderId },
              label: "Buka Sales Order",
            }
          : undefined,
      });
    } else if (entry.kind.startsWith("team_member_")) {
      events.push({
        ...base,
        kind: "team_admin",
        ownerName: owners[entry.ownerId]?.name,
        actorName: owners[entry.actorId]?.name,
        targetName:
          (entry.targetProfileId
            ? owners[entry.targetProfileId]?.name
            : undefined) ?? entry.targetProfileSnapshot?.name,
        kindLabel: entry.kindLabel,
        administrativeReason: entry.administrativeReason,
      });
    }
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}
