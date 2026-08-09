import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type TeamQueryResult<T = unknown> = {
  data: T | null;
  error: unknown;
  count?: number | null;
};

export type TeamQueryBuilder = {
  select(
    columns: string,
    options?: { count?: string; head?: boolean },
  ): TeamQueryBuilder;
  eq(column: string, value: unknown): TeamQueryBuilder;
  neq(column: string, value: unknown): TeamQueryBuilder;
  not(column: string, operator: string, value: unknown): TeamQueryBuilder;
  in(column: string, values: unknown[]): TeamQueryBuilder;
  order(column: string, options?: unknown): TeamQueryBuilder;
  limit(value: number): TeamQueryBuilder;
  range(from: number, to: number): TeamQueryBuilder;
  then<TResult1 = TeamQueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: TeamQueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export type TeamSupabaseClient = {
  from(table: string): TeamQueryBuilder;
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<TeamQueryResult>;
  auth: {
    getUser(): PromiseLike<{
      data: { user?: { id: string } | null };
    }>;
  };
  functions: {
    invoke(
      name: string,
      options: { body: Record<string, unknown> },
    ): PromiseLike<TeamQueryResult>;
  };
};

const realTeamClient = supabase as unknown as TeamSupabaseClient;

// Task 6 will make this the canonical application-wide Role union. Keeping the
// explicit four-role contract local here prevents Team management from
// weakening its server contract while the older role context is migrated.
export type AppRole = "sales" | "manager" | "executive" | "super_admin";
export type AccountStatus = "active" | "inactive";

export type OwnedActiveCounts = {
  clients: number;
  tasks: number;
  commercialItems: number;
  total: number;
};

export type BlockingReferenceCounts = {
  clients?: number;
  tasks?: number;
  commercial_items?: number;
  sales_orders?: number;
  follow_up_logs?: number;
  targets?: number;
  activity_log_owner?: number;
  activity_log_actor?: number;
  activity_log_target?: number;
  profile_status_changes?: number;
  total_blocking?: number;
  total_all?: number;
};

export type TeamAdministrativeChange = {
  kind: string;
  title: string;
  reason?: string;
  createdAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  initials: string;
  role: AppRole;
  email: string;
  accountStatus: AccountStatus;
  statusChangedAt?: string;
  statusChangedBy?: string;
  statusChangeReason?: string;
  ownedActiveCounts: OwnedActiveCounts;
  lastAdministrativeChange?: TeamAdministrativeChange;
};

function throwQueryError(error: unknown): void {
  if (error) throw error;
}

type AdminTeamSummaryRow = {
  id: string;
  name: string;
  initials: string;
  role: AppRole;
  email: string;
  account_status: AccountStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_change_reason: string | null;
  clients_count: number;
  tasks_count: number;
  commercial_items_count: number;
  last_change_kind: string | null;
  last_change_title: string | null;
  last_change_reason: string | null;
  last_change_at: string | null;
};

function toTeamMember(row: AdminTeamSummaryRow): TeamMember {
  const clients = row.clients_count;
  const tasks = row.tasks_count;
  const commercialItems = row.commercial_items_count;

  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    role: row.role,
    email: row.email,
    accountStatus: row.account_status,
    ...(row.status_changed_at
      ? { statusChangedAt: row.status_changed_at }
      : {}),
    ...(row.status_changed_by
      ? { statusChangedBy: row.status_changed_by }
      : {}),
    ...(row.status_change_reason
      ? { statusChangeReason: row.status_change_reason }
      : {}),
    ownedActiveCounts: {
      clients,
      tasks,
      commercialItems,
      total: clients + tasks + commercialItems,
    },
    ...(row.last_change_kind && row.last_change_title && row.last_change_at
      ? {
          lastAdministrativeChange: {
            kind: row.last_change_kind,
            title: row.last_change_title,
            ...(row.last_change_reason
              ? { reason: row.last_change_reason }
              : {}),
            createdAt: row.last_change_at,
          },
        }
      : {}),
  };
}

// Privileged RLS readers receive every profile row, including inactive
// accounts. Ownership totals mirror the server transfer scope: non-Lost
// clients, workflow-active/unarchived tasks, and non-terminal commercial
// items (soft-deleted documents and superseded Quotation revisions
// excluded). One RPC call computes every member's row server-side
// (public.admin_team_summary) instead of 1 + 4*N round trips.
export function listTeamMembers(): Promise<TeamMember[]>;
export function listTeamMembers(
  client: TeamSupabaseClient,
): Promise<TeamMember[]>;
export async function listTeamMembers(
  client: TeamSupabaseClient = realTeamClient,
): Promise<TeamMember[]> {
  const result = await client.rpc("admin_team_summary", {});
  throwQueryError(result.error);
  const rows = (result.data ?? []) as AdminTeamSummaryRow[];
  return rows.map(toTeamMember);
}

export function getCurrentProfileId(): Promise<string | undefined>;
export function getCurrentProfileId(
  client: TeamSupabaseClient,
): Promise<string | undefined>;
export async function getCurrentProfileId(
  client: TeamSupabaseClient = realTeamClient,
): Promise<string | undefined> {
  const { data } = await client.auth.getUser();
  return data.user?.id;
}

type ErrorPayload = {
  error?: unknown;
  code?: unknown;
  details?: unknown;
};

function numericDetails(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" &&
      Number.isSafeInteger(entry[1]) &&
      entry[1] >= 0,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export class TeamAdminError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly details?: Record<string, number>;

  constructor(input: {
    message: string;
    code: string;
    status?: number;
    details?: Record<string, number>;
  }) {
    super(input.message);
    this.name = "TeamAdminError";
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

function errorFromPayload(
  payload: ErrorPayload | null,
  status?: number,
): TeamAdminError {
  const message =
    typeof payload?.error === "string"
      ? payload.error
      : "Operasi anggota tim gagal.";
  const code =
    typeof payload?.code === "string" ? payload.code : "TEAM_ADMIN_ERROR";
  return new TeamAdminError({
    message,
    code,
    status,
    details: numericDetails(payload?.details),
  });
}

async function mapInvokeError(error: unknown): Promise<TeamAdminError> {
  if (error instanceof TeamAdminError) return error;

  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const response = error.context;
    let payload: ErrorPayload | null = null;
    try {
      payload = (await response.clone().json()) as ErrorPayload;
    } catch {
      // A non-JSON gateway response is still represented safely by status.
    }
    return errorFromPayload(payload, response.status);
  }

  const message =
    error instanceof Error ? error.message : "Operasi anggota tim gagal.";
  return new TeamAdminError({ message, code: "TEAM_ADMIN_ERROR" });
}

async function invokeManageTeamMember<T>(
  body: Record<string, unknown>,
  client: TeamSupabaseClient,
): Promise<T> {
  const { data, error } = await client.functions.invoke("manage-team-member", {
    body,
  });
  if (error) throw await mapInvokeError(error);
  if (data && typeof data === "object" && "error" in data) {
    throw errorFromPayload(data as ErrorPayload);
  }
  return data as T;
}

function administrativeReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized) {
    throw new TeamAdminError({
      message: "Alasan administratif wajib diisi.",
      code: "ADMINISTRATIVE_REASON_REQUIRED",
      status: 400,
    });
  }
  return normalized;
}

type ActionResult = { id: string; action?: string };
type ReferenceCountsResult = {
  id: string;
  action?: string;
  referenceCounts?: BlockingReferenceCounts;
};

const BLOCKING_REFERENCE_LABELS: Record<
  Exclude<keyof BlockingReferenceCounts, "total_blocking" | "total_all">,
  string
> = {
  clients: "client historis",
  tasks: "task historis",
  commercial_items: "commercial historis",
  sales_orders: "sales order historis",
  follow_up_logs: "follow-up historis",
  targets: "target",
  activity_log_owner: "activity owner",
  activity_log_actor: "activity actor",
  activity_log_target: "activity target",
  profile_status_changes: "status profile",
};

export function formatOwnedActiveCounts(counts: OwnedActiveCounts): string {
  return [
    `${counts.total} ownership aktif`,
    `${counts.clients} client aktif`,
    `${counts.tasks} task aktif`,
    `${counts.commercialItems} commercial aktif`,
  ].join(" · ");
}

export function formatBlockingReferenceCounts(
  counts: BlockingReferenceCounts | undefined,
): string {
  if (!counts) return "Referensi historis belum dimuat.";
  const details = Object.entries(BLOCKING_REFERENCE_LABELS)
    .map(([key, label]) => {
      const value = counts[key as keyof typeof BLOCKING_REFERENCE_LABELS] ?? 0;
      return value > 0 ? `${value} ${label}` : undefined;
    })
    .filter(Boolean);
  const totalBlocking = counts.total_blocking ?? 0;
  return [`${totalBlocking} referensi historis blocking`, ...details].join(
    " · ",
  );
}

export async function createTeamMember(
  input: {
    name: string;
    email: string;
    initials: string;
    role: AppRole;
    password: string;
  },
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember({ action: "create", ...input }, client);
}

export async function updateTeamMemberProfile(
  id: string,
  profile: { name: string; initials: string },
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    { action: "update_profile", id, ...profile },
    client,
  );
}

export async function changeTeamMemberRole(
  id: string,
  role: AppRole,
  reason: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    {
      action: "change_role",
      id,
      role,
      reason: administrativeReason(reason),
    },
    client,
  );
}

export async function deactivateTeamMember(
  id: string,
  reason: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    {
      action: "deactivate",
      id,
      reason: administrativeReason(reason),
    },
    client,
  );
}

export async function reactivateTeamMember(
  id: string,
  reason: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    {
      action: "reactivate",
      id,
      reason: administrativeReason(reason),
    },
    client,
  );
}

export async function transferTeamOwnership(
  fromId: string,
  toId: string,
  reason: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    {
      action: "transfer_ownership",
      fromId,
      toId,
      reason: administrativeReason(reason),
    },
    client,
  );
}

export async function deleteEligibleTeamMember(
  id: string,
  reason: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    {
      action: "delete_eligible_account",
      id,
      reason: administrativeReason(reason),
    },
    client,
  );
}

export async function getTeamMemberReferenceCounts(
  id: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<BlockingReferenceCounts> {
  const result = await invokeManageTeamMember<ReferenceCountsResult>(
    {
      action: "account_reference_counts",
      id,
    },
    client,
  );
  return result.referenceCounts ?? {};
}
