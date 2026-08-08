import { supabase } from "@/lib/supabase";
import {
  encodePageCursor,
  normalizeListPageInput,
  type ListPageInput,
} from "@/lib/pagination-contracts";
import type { FeedEvent, FeedLink } from "@/lib/data/activity-feed";

export type ActivityFeedFilters = {
  from?: Date;
  to?: Date;
  feedKind?: string; // "all" | FeedEvent["kind"]
  ownerId?: string; // "all" or profile id
  query?: string;
  clientId?: string;
  commercialItemId?: string;
  salesOrderId?: string;
};

export type ActivityFeedPage = {
  rows: ActivityFeedEventRow[];
  totalCount: number;
  nextCursor: string | null;
};

// Normalized read of the public.activity_feed_events view (camelCase,
// matching every other data-layer row type in this codebase).
export type ActivityFeedEventRow = {
  eventId: string;
  source: "activity_log" | "follow_up_logs";
  sourceId: string;
  at: string;
  feedKind: FeedEvent["kind"];
  dbKind: string | null;
  clientId: string | null;
  ownerId: string | null;
  actorId: string | null;
  targetProfileId: string | null;
  targetProfileSnapshot: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  administrativeReason: string | null;
  kindLabel: string | null;
  title: string;
  detail: string | null;
  commercialItemId: string | null;
  commercialItemType: string | null;
  salesOrderId: string | null;
};

type ActivityFeedEventDbRow = {
  event_id: string;
  source: "activity_log" | "follow_up_logs";
  source_id: string;
  at: string;
  feed_kind: FeedEvent["kind"];
  db_kind: string | null;
  client_id: string | null;
  owner_id: string | null;
  actor_id: string | null;
  target_profile_id: string | null;
  target_profile_snapshot: ActivityFeedEventRow["targetProfileSnapshot"];
  administrative_reason: string | null;
  kind_label: string | null;
  title: string;
  detail: string | null;
  commercial_item_id: string | null;
  commercial_item_type: string | null;
  sales_order_id: string | null;
};

function toRow(row: ActivityFeedEventDbRow): ActivityFeedEventRow {
  return {
    eventId: row.event_id,
    source: row.source,
    sourceId: row.source_id,
    at: row.at,
    feedKind: row.feed_kind,
    dbKind: row.db_kind,
    clientId: row.client_id,
    ownerId: row.owner_id,
    actorId: row.actor_id,
    targetProfileId: row.target_profile_id,
    targetProfileSnapshot: row.target_profile_snapshot,
    administrativeReason: row.administrative_reason,
    kindLabel: row.kind_label,
    title: row.title,
    detail: row.detail,
    commercialItemId: row.commercial_item_id,
    commercialItemType: row.commercial_item_type,
    salesOrderId: row.sales_order_id,
  };
}

function isoDateTime(date: Date): string {
  return date.toISOString();
}

// Bounded per-page keyset load over the merged activity_log +
// follow_up_logs view, same shape as listClientRowsPage /
// listSalesOrdersPage. Ordered by `at` descending — the view's `event_id`
// is a stable per-row tiebreak (text, unique across both sources).
export async function listActivityFeedPage(input: {
  filters?: ActivityFeedFilters;
  page?: ListPageInput;
}): Promise<ActivityFeedPage> {
  const filters = input.filters ?? {};
  const page = normalizeListPageInput(input.page);
  let query = supabase
    .from("activity_feed_events")
    .select("*", { count: "exact" })
    .order("at", { ascending: false })
    .order("event_id", { ascending: false })
    .limit(page.pageSize + 1);

  if (filters.from) query = query.gte("at", isoDateTime(filters.from));
  if (filters.to) query = query.lte("at", isoDateTime(filters.to));
  if (filters.feedKind && filters.feedKind !== "all")
    query = query.eq("feed_kind", filters.feedKind);
  if (filters.ownerId && filters.ownerId !== "all")
    query = query.eq("owner_id", filters.ownerId);
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.commercialItemId)
    query = query.eq("commercial_item_id", filters.commercialItemId);
  if (filters.salesOrderId)
    query = query.eq("sales_order_id", filters.salesOrderId);
  if (filters.query && filters.query.trim().length > 0) {
    query = query.ilike("search_text", `%${filters.query.trim()}%`);
  }

  if (page.cursor) {
    const sortValue = JSON.stringify(page.cursor.sortValue);
    const id = JSON.stringify(page.cursor.id);
    query = query.or(
      `at.lt.${sortValue},and(at.eq.${sortValue},event_id.lt.${id})`,
    );
  }

  const { data, error, count } = await query;
  if (error) throw error;

  const rawRows = (data ?? []) as ActivityFeedEventDbRow[];
  const pageRows = rawRows.slice(0, page.pageSize);
  const lastRow = pageRows.at(-1);

  return {
    rows: pageRows.map(toRow),
    totalCount: count ?? pageRows.length,
    nextCursor:
      rawRows.length > page.pageSize && lastRow
        ? encodePageCursor({ sortValue: lastRow.at, id: lastRow.event_id })
        : null,
  };
}

// Export path: every filtered row, not just the loaded page. Same
// unbounded-but-filtered pattern as listSalesOrders() used by Sales
// Orders' export — an explicit user action expected to cover everything.
export async function listAllActivityFeedEvents(
  filters: ActivityFeedFilters = {},
): Promise<ActivityFeedEventRow[]> {
  let query = supabase
    .from("activity_feed_events")
    .select("*")
    .order("at", { ascending: false })
    .order("event_id", { ascending: false });

  if (filters.from) query = query.gte("at", isoDateTime(filters.from));
  if (filters.to) query = query.lte("at", isoDateTime(filters.to));
  if (filters.feedKind && filters.feedKind !== "all")
    query = query.eq("feed_kind", filters.feedKind);
  if (filters.ownerId && filters.ownerId !== "all")
    query = query.eq("owner_id", filters.ownerId);
  if (filters.clientId) query = query.eq("client_id", filters.clientId);
  if (filters.commercialItemId)
    query = query.eq("commercial_item_id", filters.commercialItemId);
  if (filters.salesOrderId)
    query = query.eq("sales_order_id", filters.salesOrderId);
  if (filters.query && filters.query.trim().length > 0) {
    query = query.ilike("search_text", `%${filters.query.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ActivityFeedEventDbRow[]).map(toRow);
}

// Powers the Activity Log detail drawer's "related events" panel: events
// within `windowDays` of `at` sharing the same client, commercial item, or
// sales order — a bounded, targeted query instead of scanning an
// in-memory array of every event ever fetched.
export async function listRelatedActivityFeedEvents(input: {
  excludeEventId: string;
  at: string;
  clientId?: string;
  commercialItemId?: string;
  salesOrderId?: string;
  windowDays?: number;
  limit?: number;
}): Promise<ActivityFeedEventRow[]> {
  const matchers = [
    input.clientId ? `client_id.eq.${JSON.stringify(input.clientId)}` : null,
    input.commercialItemId
      ? `commercial_item_id.eq.${JSON.stringify(input.commercialItemId)}`
      : null,
    input.salesOrderId
      ? `sales_order_id.eq.${JSON.stringify(input.salesOrderId)}`
      : null,
  ].filter((clause): clause is string => clause !== null);
  if (matchers.length === 0) return [];

  const windowMs = (input.windowDays ?? 7) * 24 * 60 * 60 * 1000;
  const center = new Date(input.at).getTime();
  const from = new Date(center - windowMs).toISOString();
  const to = new Date(center + windowMs).toISOString();

  const { data, error } = await supabase
    .from("activity_feed_events")
    .select("*")
    .or(matchers.join(","))
    .gte("at", from)
    .lte("at", to)
    .neq("event_id", input.excludeEventId)
    .order("at", { ascending: false })
    .limit(input.limit ?? 30);
  if (error) throw error;
  return ((data ?? []) as ActivityFeedEventDbRow[]).map(toRow);
}

const TASK_INBOX_LINK: FeedLink = { to: "/tasks", label: "Buka Task Inbox" };

function commercialLink(row: ActivityFeedEventRow): FeedLink | undefined {
  if (!row.commercialItemId || row.commercialItemType !== "Quotation")
    return undefined;
  return {
    to: "/quotations/$id",
    params: { id: row.commercialItemId },
    label: "Buka Quotation",
  };
}

function salesOrderLink(row: ActivityFeedEventRow): FeedLink | undefined {
  if (!row.salesOrderId) return undefined;
  return {
    to: "/sales-orders/$soId",
    params: { soId: row.salesOrderId },
    label: "Buka Sales Order",
  };
}

// Mirrors activityFeedEvent() in activity-feed.ts, operating on the merged
// view row instead of two separate source arrays.
export function mapActivityFeedRow(
  row: ActivityFeedEventRow,
  owners: Record<string, { name: string }>,
): FeedEvent {
  const ownerName = row.ownerId ? owners[row.ownerId]?.name : undefined;
  const base = {
    id: row.eventId,
    at: row.at,
    clientId: row.clientId ?? undefined,
    ownerName,
    title: row.title,
    detail: row.detail ?? undefined,
    commercialItemId: row.commercialItemId ?? undefined,
    salesOrderId: row.salesOrderId ?? undefined,
  };

  switch (row.feedKind) {
    case "commercial_created":
    case "commercial_history":
      return { ...base, kind: row.feedKind, link: commercialLink(row) };
    case "follow_up":
      return { ...base, kind: "follow_up", link: commercialLink(row) };
    case "order_created":
    case "so_tax_change":
      return { ...base, kind: row.feedKind, link: salesOrderLink(row) };
    case "task_created":
    case "task_history":
      return { ...base, kind: row.feedKind, link: TASK_INBOX_LINK };
    case "ownership_change":
      return {
        ...base,
        kind: "ownership_change",
        ownerName: row.actorId ? owners[row.actorId]?.name : undefined,
        targetName: ownerName,
      };
    case "record_lifecycle":
      return {
        ...base,
        kind: "record_lifecycle",
        link:
          row.dbKind === "commercial_document_restored"
            ? commercialLink(row)
            : row.dbKind === "sales_order_restored"
              ? salesOrderLink(row)
              : undefined,
      };
    case "team_admin": {
      const targetName = row.targetProfileId
        ? owners[row.targetProfileId]?.name
        : (row.targetProfileSnapshot?.name ?? undefined);
      return {
        ...base,
        kind: "team_admin",
        ownerName,
        actorName: row.actorId ? owners[row.actorId]?.name : undefined,
        targetName,
        kindLabel: row.kindLabel ?? undefined,
        administrativeReason: row.administrativeReason ?? undefined,
      };
    }
    default:
      return { ...base, kind: row.feedKind };
  }
}
