import type { CommercialItem } from "@/lib/domain";
import type { ActivityLogEntry } from "@/lib/data/activity-log";
import type { FollowUpLog } from "@/lib/data/follow-ups";

const CLIENT_STATUSES = new Set([
  "Prospect",
  "Active Customer",
  "Dormant",
  "Lost",
  "Repeat Order",
]);

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
    | "ownership_change"
    | "record_lifecycle"
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
  // Raw ids behind `link`, kept so callers (the related-events lookup) can
  // query "same underlying record" without re-parsing link.params.
  commercialItemId?: string;
  salesOrderId?: string;
};

// Direct Order/Prototype/Customer PO no longer have a dedicated list/detail
// page — those pages always read from commercial_documents, which never
// carries those types for real (sheet-imported) data (they're recorded as
// sales_orders instead); the pages were removed 2026-07-20. Quotation is the
// only active commercial_documents type.
const COMMERCIAL_ROUTE: Partial<
  Record<CommercialItem["type"], { to: string; label: string }>
> = {
  Quotation: { to: "/quotations/$id", label: "Buka Quotation" },
};

const TASK_INBOX_LINK: FeedLink = { to: "/tasks", label: "Buka Task Inbox" };

function commercialLink(
  item: Pick<CommercialItem, "id" | "type"> | undefined,
): FeedLink | undefined {
  if (!item) return undefined;
  const route = COMMERCIAL_ROUTE[item.type];
  return route
    ? { to: route.to, params: { id: item.id }, label: route.label }
    : undefined;
}

function salesOrderLink(
  salesOrderId: string | undefined,
): FeedLink | undefined {
  if (!salesOrderId) return undefined;
  return {
    to: "/sales-orders/$soId",
    params: { soId: salesOrderId },
    label: "Buka Sales Order",
  };
}

type BuildActivityFeedInput = {
  activity: ActivityLogEntry[];
  followUps: FollowUpLog[];
  owners: Record<string, { name: string }>;
  commercialItems: CommercialItem[];
};

type OwnersById = BuildActivityFeedInput["owners"];
type CommercialIndex = Map<string, CommercialItem>;
type ActivityFeedBase = Pick<
  FeedEvent,
  "id" | "at" | "clientId" | "ownerName" | "title" | "detail"
>;

function activityFeedBase(
  entry: ActivityLogEntry,
  owners: OwnersById,
): ActivityFeedBase {
  return {
    id: `activity-${entry.id}`,
    at: entry.createdAt,
    clientId: entry.clientId,
    ownerName: owners[entry.actorId]?.name,
    title: entry.title,
    detail: entry.detail,
  };
}

function teamAdminTargetName(
  entry: ActivityLogEntry,
  owners: OwnersById,
): string | undefined {
  const targetProfileName = entry.targetProfileId
    ? owners[entry.targetProfileId]?.name
    : undefined;
  return targetProfileName ?? entry.targetProfileSnapshot?.name;
}

function isLegacyOwnerChange(entry: ActivityLogEntry): boolean {
  if (entry.kind !== "client_status_change") return false;
  const [statusLine] = (entry.detail ?? "").split("\n");
  const [from, to] = statusLine.split(" → ").map((value) => value.trim());
  return !from || !to || !CLIENT_STATUSES.has(from) || !CLIENT_STATUSES.has(to);
}

function activityFeedEvent(
  entry: ActivityLogEntry,
  owners: OwnersById,
  commercialIndex: CommercialIndex,
): FeedEvent | undefined {
  const base = activityFeedBase(entry, owners);

  switch (entry.kind) {
    case "client_created":
      return { ...base, kind: "client_created" };
    case "client_status_change":
      if (isLegacyOwnerChange(entry)) {
        return {
          ...base,
          kind: "ownership_change",
          targetName: owners[entry.ownerId]?.name,
        };
      }
      return { ...base, kind: "status_change" };
    case "client_owner_change":
      return {
        ...base,
        kind: "ownership_change",
        targetName: owners[entry.ownerId]?.name,
      };
    case "commercial_item_created":
      return {
        ...base,
        kind: "commercial_created",
        link: commercialLink(commercialIndex.get(entry.commercialItemId ?? "")),
      };
    case "commercial_item_stage_change":
      return {
        ...base,
        kind: "commercial_history",
        link: commercialLink(commercialIndex.get(entry.commercialItemId ?? "")),
      };
    case "task_created":
      return { ...base, kind: "task_created", link: TASK_INBOX_LINK };
    case "task_status_change":
      return { ...base, kind: "task_history", link: TASK_INBOX_LINK };
    case "sales_order_created":
      return {
        ...base,
        kind: "order_created",
        link: salesOrderLink(entry.salesOrderId),
      };
    case "sales_order_tax_change":
      return {
        ...base,
        kind: "so_tax_change",
        link: salesOrderLink(entry.salesOrderId),
      };
    case "commercial_document_deleted":
    case "commercial_document_restored":
      return {
        ...base,
        kind: "record_lifecycle",
        link:
          entry.kind === "commercial_document_restored"
            ? commercialLink(
                commercialIndex.get(entry.commercialDocumentId ?? ""),
              )
            : undefined,
      };
    case "sales_order_deleted":
    case "sales_order_restored":
      return {
        ...base,
        kind: "record_lifecycle",
        link:
          entry.kind === "sales_order_restored"
            ? salesOrderLink(entry.salesOrderId)
            : undefined,
      };
    case "team_member_created":
    case "team_member_profile_updated":
    case "team_member_role_changed":
    case "team_member_deactivated":
    case "team_member_reactivated":
    case "team_member_ownership_transferred":
    case "team_member_deleted":
      return {
        ...base,
        kind: "team_admin",
        ownerName: owners[entry.ownerId]?.name,
        actorName: owners[entry.actorId]?.name,
        targetName: teamAdminTargetName(entry, owners),
        kindLabel: entry.kindLabel,
        administrativeReason: entry.administrativeReason,
      };
    default:
      return undefined;
  }
}

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
    const event = activityFeedEvent(entry, owners, commercialIndex);
    if (event) events.push(event);
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}
