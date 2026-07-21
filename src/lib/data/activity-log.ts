import { supabase } from "@/lib/supabase";
import type { ClientStatus } from "@/lib/domain";
import type { Role } from "@/lib/domain";

export type ActivityKind =
  | "client_created"
  | "client_status_change"
  | "client_details_change"
  | "task_created"
  | "task_status_change"
  | "commercial_item_created"
  | "commercial_item_stage_change"
  | "sales_order_created"
  | "sales_order_tax_change"
  | "sales_order_header_change"
  | "sales_order_item_change"
  | "team_member_created"
  | "team_member_profile_updated"
  | "team_member_role_changed"
  | "team_member_deactivated"
  | "team_member_reactivated"
  | "team_member_ownership_transferred"
  | "team_member_deleted";

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  client_created: "Client Baru",
  client_status_change: "Perubahan Status Client",
  client_details_change: "Perubahan Info Klien",
  task_created: "Task Baru",
  task_status_change: "Perubahan Status Task",
  commercial_item_created: "Commercial Baru",
  commercial_item_stage_change: "Perubahan Tahap Commercial",
  sales_order_created: "Sales Order Baru",
  sales_order_tax_change: "Koreksi Pajak Sales Order",
  sales_order_header_change: "Perubahan Detail Sales Order",
  sales_order_item_change: "Perubahan Item Sales Order",
  team_member_created: "Anggota Tim Dibuat",
  team_member_profile_updated: "Profil Anggota Tim Diperbarui",
  team_member_role_changed: "Role Anggota Tim Diubah",
  team_member_deactivated: "Anggota Tim Dinonaktifkan",
  team_member_reactivated: "Anggota Tim Diaktifkan Kembali",
  team_member_ownership_transferred: "Kepemilikan Anggota Tim Dialihkan",
  team_member_deleted: "Anggota Tim Dihapus Permanen",
};

export type ActivityTargetProfileSnapshot = {
  name?: string;
  email?: string;
  role?: "sales" | "manager" | "executive" | "super_admin";
};

export type ActivityLogEntry = {
  id: string;
  kind: ActivityKind;
  kindLabel: string;
  ownerId: string;
  actorId: string;
  targetProfileId?: string;
  targetProfileSnapshot?: ActivityTargetProfileSnapshot;
  administrativeReason?: string;
  clientId?: string;
  taskId?: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  salesOrderId?: string;
  title: string;
  detail?: string;
  createdAt: string;
};

type ActivityLogRow = {
  id: string;
  kind: ActivityKind;
  owner_id: string;
  actor_id: string;
  target_profile_id: string | null;
  target_profile_snapshot: ActivityTargetProfileSnapshot | null;
  administrative_reason: string | null;
  client_id: string | null;
  task_id: string | null;
  commercial_item_id: string | null;
  commercial_document_id: string | null;
  sales_order_id: string | null;
  title: string;
  detail: string | null;
  created_at: string;
};

function toEntry(row: ActivityLogRow): ActivityLogEntry {
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: ACTIVITY_KIND_LABELS[row.kind],
    ownerId: row.owner_id,
    actorId: row.actor_id,
    targetProfileId: row.target_profile_id ?? undefined,
    targetProfileSnapshot: row.target_profile_snapshot ?? undefined,
    administrativeReason: row.administrative_reason ?? undefined,
    clientId: row.client_id ?? undefined,
    taskId: row.task_id ?? undefined,
    commercialItemId:
      row.commercial_document_id ?? row.commercial_item_id ?? undefined,
    commercialDocumentId: row.commercial_document_id ?? undefined,
    salesOrderId: row.sales_order_id ?? undefined,
    title: row.title,
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  };
}

// The activity_log RLS insert policy requires actor_id to be the signed-in
// user (for the sales role) — callers need the current auth user's id to
// pass as actorId, so this is exposed here rather than re-derived per call site.
export async function getCurrentActorId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

// No role/userId parameter needed: RLS scopes rows the same way every
// other real table here does (own rows for sales, all for manager/executive).
export async function listActivityLog(): Promise<ActivityLogEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export type ClientStatusAuditEntry = {
  id: string;
  clientId: string;
  from: ClientStatus;
  to: ClientStatus;
  byUserName: string;
  byRole: Role;
  at: string;
  note?: string;
};

// Powers StatusAuditTrail.tsx (Client Detail page). Reads the same
// activity_log rows the general /activity feed shows, filtered to one
// client's `client_status_change` events, and parses the "from → to"
// (plus an optional note on a second line) format that the write side
// (_app.clients.$clientId.tsx) encodes into `detail`.
export async function listClientStatusHistory(
  clientId: string,
): Promise<ClientStatusAuditEntry[]> {
  const [
    { data: logs, error: logsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, client_id, actor_id, detail, created_at")
      .eq("client_id", clientId)
      .eq("kind", "client_status_change")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name, role"),
  ]);
  if (logsError) throw logsError;
  if (profilesError) throw profilesError;

  const actorsById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (logs ?? []).flatMap((row) => {
    const [statusLine, note] = (row.detail ?? "").split("\n");
    const [from, to] = statusLine.split(" → ").map((s: string) => s.trim());
    if (!from || !to) return [];
    const actor = actorsById.get(row.actor_id);
    return [
      {
        id: row.id,
        clientId: row.client_id,
        from: from as ClientStatus,
        to: to as ClientStatus,
        byUserName: actor?.name ?? "—",
        byRole: (actor?.role as Role) ?? "sales",
        at: row.created_at,
        note,
      },
    ];
  });
}

export async function logActivity(input: {
  kind: ActivityKind;
  ownerId: string;
  actorId: string;
  clientId?: string;
  taskId?: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  salesOrderId?: string;
  title: string;
  detail?: string;
}): Promise<void> {
  const { error } = await supabase.from("activity_log").insert({
    kind: input.kind,
    owner_id: input.ownerId,
    actor_id: input.actorId,
    client_id: input.clientId,
    task_id: input.taskId,
    commercial_item_id: input.commercialItemId,
    commercial_document_id: input.commercialDocumentId,
    sales_order_id: input.salesOrderId,
    title: input.title,
    detail: input.detail,
  });
  if (error) throw error;
}

export type SalesOrderTaxAuditEntry = {
  id: string;
  salesOrderId: string;
  from: "PPN" | "Non-PPN" | "—";
  to: "PPN" | "Non-PPN";
  byUserName: string;
  byRole: Role;
  at: string;
  note?: string;
};

// Powers the "Riwayat perubahan pajak" panel on
// _app.sales-orders.$soId.tsx. Same "from → to\nnote" parsing convention
// as listClientStatusHistory.
export async function listSalesOrderTaxHistory(
  salesOrderId: string,
): Promise<SalesOrderTaxAuditEntry[]> {
  const [
    { data: logs, error: logsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, sales_order_id, actor_id, detail, created_at")
      .eq("sales_order_id", salesOrderId)
      .eq("kind", "sales_order_tax_change")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name, role"),
  ]);
  if (logsError) throw logsError;
  if (profilesError) throw profilesError;

  const actorsById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (logs ?? []).flatMap((row) => {
    const [taxLine, note] = (row.detail ?? "").split("\n");
    const [from, to] = taxLine.split(" → ").map((s: string) => s.trim());
    if (!from || !to) return [];
    const actor = actorsById.get(row.actor_id);
    return [
      {
        id: row.id,
        salesOrderId: row.sales_order_id,
        from: from as SalesOrderTaxAuditEntry["from"],
        to: to as SalesOrderTaxAuditEntry["to"],
        byUserName: actor?.name ?? "—",
        byRole: (actor?.role as Role) ?? "sales",
        at: row.created_at,
        note,
      },
    ];
  });
}

export type TaskHistoryEntry = {
  id: string;
  actorName: string;
  actorRole: Role;
  title: string;
  detail?: string;
  at: string;
};

// Powers the "Riwayat" panel on TaskDetailDrawer.tsx. Same shape/reasoning
// as listCommercialItemHistory: plain title/detail text, no structured
// per-field parsing.
export async function listTaskHistory(
  taskId: string,
): Promise<TaskHistoryEntry[]> {
  const [
    { data: logs, error: logsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, actor_id, title, detail, created_at")
      .eq("task_id", taskId)
      .in("kind", ["task_created", "task_status_change"])
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name, role"),
  ]);
  if (logsError) throw logsError;
  if (profilesError) throw profilesError;

  const actorsById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (logs ?? []).map((row) => {
    const actor = actorsById.get(row.actor_id);
    return {
      id: row.id,
      actorName: actor?.name ?? "—",
      actorRole: (actor?.role as Role) ?? "sales",
      title: row.title,
      detail: row.detail ?? undefined,
      at: row.created_at,
    };
  });
}

export type CommercialItemHistoryEntry = {
  id: string;
  actorName: string;
  actorRole: Role;
  title: string;
  detail?: string;
  at: string;
};

// Powers the "History" panel on CommercialDetailPage.tsx and
// PipelineCardDrawer.tsx. Unlike listClientStatusHistory, this doesn't
// parse `detail` back into structured fields — it's shown as plain text
// (see describeCommercialItemChanges in commercial-items.ts for how it's
// built on write), since a single save can touch several fields at once.
export async function listCommercialItemHistory(
  commercialItemId: string,
): Promise<CommercialItemHistoryEntry[]> {
  const [
    { data: logs, error: logsError },
    { data: profiles, error: profilesError },
  ] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id, actor_id, title, detail, created_at")
      .or(
        `commercial_document_id.eq.${commercialItemId},commercial_item_id.eq.${commercialItemId}`,
      )
      .in("kind", ["commercial_item_created", "commercial_item_stage_change"])
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name, role"),
  ]);
  if (logsError) throw logsError;
  if (profilesError) throw profilesError;

  const actorsById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (logs ?? []).map((row) => {
    const actor = actorsById.get(row.actor_id);
    return {
      id: row.id,
      actorName: actor?.name ?? "—",
      actorRole: (actor?.role as Role) ?? "sales",
      title: row.title,
      detail: row.detail ?? undefined,
      at: row.created_at,
    };
  });
}
