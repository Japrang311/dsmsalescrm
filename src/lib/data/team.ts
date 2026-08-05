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

type ProfileRow = {
  id: string;
  name: string;
  initials: string;
  role: AppRole;
  email: string;
  account_status: AccountStatus;
  status_changed_at: string | null;
  status_changed_by: string | null;
  status_change_reason: string | null;
};

type AdminActivityRow = {
  target_profile_id: string | null;
  kind: string;
  title: string;
  administrative_reason: string | null;
  created_at: string;
};

const ADMIN_ACTIVITY_KINDS = [
  "team_member_created",
  "team_member_profile_updated",
  "team_member_role_changed",
  "team_member_deactivated",
  "team_member_reactivated",
  "team_member_ownership_transferred",
  "team_member_deleted",
] as const;

const TEAM_SUMMARY_BATCH_SIZE = 8;
const ACTIVE_TRANSFER_WORKFLOW_STATUSES = [
  "Open",
  "In Progress",
  "Waiting External",
] as const;

function throwQueryError(error: unknown): void {
  if (error) throw error;
}

function exactCount(result: { count?: number | null; error: unknown }): number {
  throwQueryError(result.error);
  if (result.count == null) {
    throw new Error("Server tidak mengembalikan exact count.");
  }
  return result.count;
}

async function countActiveCommercialItems(
  ownerId: string,
  client: TeamSupabaseClient,
): Promise<number> {
  // Call server-side RPC that computes the exact count using the Task 4 transfer
  // predicate: lower(btrim(stage)) not in ('closed won', 'closed lost', 'revenue recorded', 'closed').
  // This ensures client and server use identical normalization.
  const result = await client.rpc("admin_count_active_commercial_items", {
    p_owner_id: ownerId,
  });
  throwQueryError(result.error);

  const count = result.data;
  if (typeof count !== "number") {
    throw new Error("Server tidak mengembalikan count komersial.");
  }
  return count;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const mapped: R[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    mapped.push(
      ...(await Promise.all(items.slice(index, index + batchSize).map(mapper))),
    );
  }
  return mapped;
}

// Privileged RLS readers receive every profile row, including inactive
// accounts. Ownership totals mirror the server transfer scope: non-Lost
// clients, workflow-active/unarchived tasks, and non-terminal commercial items.
export function listTeamMembers(): Promise<TeamMember[]>;
export function listTeamMembers(
  client: TeamSupabaseClient,
): Promise<TeamMember[]>;
export async function listTeamMembers(
  client: TeamSupabaseClient = realTeamClient,
): Promise<TeamMember[]> {
  const profilesResult = await client
    .from("profiles")
    .select(
      "id, name, initials, role, email, account_status, status_changed_at, status_changed_by, status_change_reason",
    );
  throwQueryError(profilesResult.error);

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  return mapInBatches(profiles, TEAM_SUMMARY_BATCH_SIZE, async (row) => {
    const [clientsResult, tasksResult, commercialResult, logResult] =
      await Promise.all([
        client
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", row.id)
          .neq("status", "Lost"),
        client
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", row.id)
          .in("workflow_status", [...ACTIVE_TRANSFER_WORKFLOW_STATUSES])
          .eq("archived", false),
        countActiveCommercialItems(row.id, client),
        client
          .from("activity_log")
          .select(
            "target_profile_id, kind, title, administrative_reason, created_at",
          )
          .eq("target_profile_id", row.id)
          .in("kind", [...ADMIN_ACTIVITY_KINDS])
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

    const clients = exactCount(clientsResult);
    const tasks = exactCount(tasksResult);
    const commercialItems = commercialResult;
    throwQueryError(logResult.error);
    const lastChange = (
      Array.isArray(logResult.data) ? (logResult.data[0] ?? null) : null
    ) as AdminActivityRow | null;

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
      ...(lastChange
        ? {
            lastAdministrativeChange: {
              kind: lastChange.kind,
              title: lastChange.title,
              ...(lastChange.administrative_reason
                ? { reason: lastChange.administrative_reason }
                : {}),
              createdAt: lastChange.created_at,
            },
          }
        : {}),
    };
  });
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
