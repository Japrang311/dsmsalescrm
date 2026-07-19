import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

type ReferenceCounts = {
  clients: number;
  tasks: number;
  commercial_items: number;
  sales_orders: number;
  follow_up_logs: number;
  targets: number;
  activity_log_owner: number;
  activity_log_actor: number;
  activity_log_target: number;
  profile_status_changes: number;
  total_blocking: number;
  total_all: number;
};

type TransferCounts = {
  clients: number;
  tasks: number;
  commercial_items: number;
  total: number;
};

type CreatedRows = {
  clientOpen: string;
  clientLost: string;
  taskOpen: string;
  taskDone: string;
  taskArchived: string;
  commercialOpen: string;
  commercialClosedWon: string;
  commercialClosedLost: string;
  commercialRevenueRecorded: string;
  commercialClosed: string;
  salesOrder: string;
  followUp: string;
  target: string;
  activityOwner: string;
  activityActor: string;
  activityTarget: string;
};

let fixtures: RoleFixtureUsers | undefined;
let secondSuperAdminId: string | undefined;
let rows: CreatedRows | undefined;
let baselineActiveSuperAdminCount: number | undefined;
const disposableAuthIds = new Set<string>();

function requireFixtures(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Lifecycle role fixtures are unavailable");
  return fixtures;
}

function requireRows(): CreatedRows {
  if (!rows) throw new Error("Lifecycle business fixtures are unavailable");
  return rows;
}

async function ownerId(table: string, id: string): Promise<string> {
  const { data, error } = await adminClient
    .from(table)
    .select("owner_id")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data.owner_id;
}

async function runLocalSql(sql: string): Promise<void> {
  const process = Bun.spawn(
    ["bunx", "supabase", "db", "query", "--local", sql],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Local SQL failed:\n${stderr}\n${stdout}`);
  }
}

async function removeInjectedFailureTriggers(): Promise<void> {
  await runLocalSql(`
    do $task4_cleanup$
    begin
      execute 'drop trigger if exists task4_injected_transfer_failure on public.commercial_documents';
      execute 'drop function if exists private.task4_injected_transfer_failure()';
      execute 'drop trigger if exists task4_injected_audit_failure on public.activity_log';
      execute 'drop function if exists private.task4_injected_audit_failure()';
    end
    $task4_cleanup$;
  `);
}

async function insertId(
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await adminClient
    .from(table)
    .insert(values)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createSecondSuperAdmin(): Promise<string> {
  const marker = crypto.randomUUID().slice(0, 8);
  const email = `task-4-second-admin+${marker}@example.com`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: data.user.id,
    role: "super_admin",
    account_status: "inactive",
    name: "Second Task 4 Admin",
    initials: "S4",
    email,
  });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(data.user.id);
    throw profileError;
  }
  return data.user.id;
}

async function createAuthOnlyUser(label: string): Promise<{
  id: string;
  email: string;
}> {
  const marker = crypto.randomUUID().slice(0, 8);
  const email = `task-4-${label}+${marker}@example.com`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: "test-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  disposableAuthIds.add(data.user.id);
  return { id: data.user.id, email };
}

async function createDisposableProfile(
  label: string,
  role: "sales" | "manager" | "executive" | "super_admin" = "sales",
): Promise<{ id: string; email: string }> {
  const authUser = await createAuthOnlyUser(label);
  const { error } = await adminClient.from("profiles").insert({
    id: authUser.id,
    role,
    account_status: "active",
    name: `Task 4 ${label}`,
    initials: "T4",
    email: authUser.email,
  });
  if (error) {
    await deleteDisposableAuth(authUser.id);
    throw error;
  }
  return authUser;
}

async function deleteDisposableAuth(id: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) throw error;
  disposableAuthIds.delete(id);
}

async function deleteAuditIds(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await adminClient
    .from("activity_log")
    .delete()
    .in("id", [...ids]);
  if (error) throw error;
}

beforeAll(async () => {
  await removeInjectedFailureTriggers();

  const { data: baselineCount, error: baselineError } = await adminClient.rpc(
    "admin_active_super_admin_count",
  );
  if (baselineError) throw baselineError;
  baselineActiveSuperAdminCount = baselineCount as number;

  fixtures = await createRoleFixtureUsers();
  const users = requireFixtures();
  secondSuperAdminId = await createSecondSuperAdmin();

  const clientOpen = await insertId("clients", {
    name: "Task 4 active client",
    status: "Active Customer",
    source: "Referral",
    owner_id: users.sales.id,
  });
  const clientLost = await insertId("clients", {
    name: "Task 4 historical lost client",
    status: "Lost",
    source: "Referral",
    owner_id: users.sales.id,
  });

  const taskOpen = await insertId("tasks", {
    client_id: clientOpen,
    owner_id: users.sales.id,
    title: "Task 4 open task",
    due_date: "2026-07-19",
    method: "Email",
    status: "Upcoming",
    archived: false,
  });
  const taskDone = await insertId("tasks", {
    client_id: clientOpen,
    owner_id: users.sales.id,
    title: "Task 4 completed task",
    due_date: "2026-07-18",
    method: "Email",
    status: "Done",
    archived: false,
  });
  const taskArchived = await insertId("tasks", {
    client_id: clientOpen,
    owner_id: users.sales.id,
    title: "Task 4 archived task",
    due_date: "2026-07-17",
    method: "Email",
    status: "Upcoming",
    archived: true,
  });

  const commercialRows: Record<string, string> = {};
  for (const [key, stage] of [
    ["commercialOpen", "Negotiation"],
    ["commercialClosedWon", "Closed Won"],
    ["commercialClosedLost", "Closed Lost"],
    ["commercialRevenueRecorded", "Revenue Recorded"],
    ["commercialClosed", "Closed"],
  ] as const) {
    commercialRows[key] = await insertId("commercial_documents", {
      client_id: clientOpen,
      owner_id: users.sales.id,
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-19",
      rfq_number: `RFQ-TASK-4-${key}-${crypto.randomUUID()}`,
      stage,
    });
  }

  const salesOrder = await insertId("sales_orders", {
    so_number: `SO-TASK-4-${crypto.randomUUID()}`,
    client_id: clientOpen,
    owner_id: users.sales.id,
    type: "Regular",
    tax_type: "PPN",
    source: "RFQ / New Product",
    total_value: 1_000,
    date: "2026-07-19",
  });
  const followUp = await insertId("follow_up_logs", {
    task_id: taskOpen,
    client_id: clientOpen,
    commercial_document_id: commercialRows.commercialOpen,
    owner_id: users.sales.id,
    fu_date: "2026-07-19",
    method: "Phone",
    result: "Interested",
    notes: "Task 4 historical follow-up",
  });
  const target = await insertId("targets", {
    sales_id: users.sales.id,
    year: 2098,
    month: 1,
    target: 1_000,
  });

  const activityOwner = await insertId("activity_log", {
    kind: "client_status_change",
    owner_id: users.sales.id,
    actor_id: users.super_admin.id,
    client_id: clientOpen,
    title: "Task 4 owner reference",
  });
  const activityActor = await insertId("activity_log", {
    kind: "client_status_change",
    owner_id: users.manager.id,
    actor_id: users.sales.id,
    client_id: clientOpen,
    title: "Task 4 actor reference",
  });
  const activityTarget = await insertId("activity_log", {
    kind: "team_member_profile_updated",
    owner_id: users.manager.id,
    actor_id: users.super_admin.id,
    target_profile_id: users.sales.id,
    target_profile_snapshot: {
      name: "Test Sales",
      email: users.sales.email,
      role: "sales",
    },
    administrative_reason: "Task 4 target-only reference",
    title: "Task 4 target reference",
  });

  const { error: profileReferenceError } = await adminClient
    .from("profiles")
    .update({ status_changed_by: users.sales.id })
    .eq("id", users.executive.id);
  if (profileReferenceError) throw profileReferenceError;

  rows = {
    clientOpen,
    clientLost,
    taskOpen,
    taskDone,
    taskArchived,
    commercialOpen: commercialRows.commercialOpen,
    commercialClosedWon: commercialRows.commercialClosedWon,
    commercialClosedLost: commercialRows.commercialClosedLost,
    commercialRevenueRecorded: commercialRows.commercialRevenueRecorded,
    commercialClosed: commercialRows.commercialClosed,
    salesOrder,
    followUp,
    target,
    activityOwner,
    activityActor,
    activityTarget,
  };
});

afterAll(async () => {
  const failures: unknown[] = [];
  const users = fixtures;
  const created = rows;

  try {
    await removeInjectedFailureTriggers();
  } catch (error) {
    failures.push(error);
  }

  if (users) {
    const { error } = await adminClient
      .from("profiles")
      .update({ status_changed_by: null })
      .eq("id", users.executive.id);
    if (error) failures.push(error);
  }

  if (created) {
    for (const [table, ids] of [
      [
        "activity_log",
        [created.activityOwner, created.activityActor, created.activityTarget],
      ],
      ["follow_up_logs", [created.followUp]],
      ["sales_orders", [created.salesOrder]],
      ["tasks", [created.taskOpen, created.taskDone, created.taskArchived]],
      [
        "commercial_documents",
        [
          created.commercialOpen,
          created.commercialClosedWon,
          created.commercialClosedLost,
          created.commercialRevenueRecorded,
          created.commercialClosed,
        ],
      ],
      ["targets", [created.target]],
      ["clients", [created.clientOpen, created.clientLost]],
    ] as const) {
      const { error } = await adminClient.from(table).delete().in("id", ids);
      if (error) failures.push(error);
    }
  }

  if (secondSuperAdminId) {
    const { error } =
      await adminClient.auth.admin.deleteUser(secondSuperAdminId);
    if (error) failures.push(error);
  }
  try {
    await deleteRoleFixtureUsers(fixtures);
  } catch (error) {
    failures.push(error);
  }
  fixtures = undefined;
  rows = undefined;
  secondSuperAdminId = undefined;
  baselineActiveSuperAdminCount = undefined;

  for (const id of [...disposableAuthIds]) {
    try {
      await deleteDisposableAuth(id);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "Task 4 lifecycle cleanup failed");
  }
});

describe("account lifecycle database primitives", () => {
  test("reference-count foreign-key paths have supporting indexes", async () => {
    await runLocalSql(`
      do $$
      begin
        if to_regclass('public.activity_log_actor_id_idx') is null then
          raise exception 'MISSING_ACTIVITY_LOG_ACTOR_INDEX';
        end if;
        if to_regclass('public.profiles_status_changed_by_idx') is null then
          raise exception 'MISSING_PROFILE_STATUS_ACTOR_INDEX';
        end if;
      end
      $$
    `);
  });

  test("reference counts cover every current profile reference and keep snapshot-only targets non-blocking", async () => {
    const users = requireFixtures();
    const { data, error } = await adminClient.rpc(
      "admin_account_reference_counts",
      { p_target_id: users.sales.id },
    );

    expect(error).toBeNull();
    expect(data as ReferenceCounts).toEqual({
      clients: 2,
      tasks: 3,
      commercial_items: 5,
      sales_orders: 1,
      follow_up_logs: 1,
      targets: 1,
      activity_log_owner: 1,
      activity_log_actor: 1,
      activity_log_target: 1,
      profile_status_changes: 1,
      total_blocking: 16,
      total_all: 17,
    });
  });

  test("active Super Admin count excludes inactive profiles", async () => {
    if (baselineActiveSuperAdminCount === undefined) {
      throw new Error("Baseline active Super Admin count is unavailable");
    }
    const { data, error } = await adminClient.rpc(
      "admin_active_super_admin_count",
    );

    expect(error).toBeNull();
    // +1 accounts for the fixture's own active super_admin created in
    // beforeAll; the second (inactive) admin correctly contributes 0.
    // baselineActiveSuperAdminCount absorbs any ambient active Super Admin
    // rows already present in the local DB (e.g. the persistent local dev
    // bootstrap account), so this doesn't assume a super_admin-free DB.
    expect(data).toBe(baselineActiveSuperAdminCount + 1);
  });

  test("public lifecycle RPC wrappers remain inaccessible to authenticated browsers", async () => {
    const users = requireFixtures();
    const [superAdminClient, managerClient] = await Promise.all([
      signInAs(users.super_admin),
      signInAs(users.manager),
    ]);

    for (const browserClient of [superAdminClient, managerClient]) {
      const { data, error } = await browserClient.rpc(
        "admin_active_super_admin_count",
      );
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe("42501");
    }
  });

  test("ownership transfer rejects inactive, Executive, and Super Admin destinations before changing data", async () => {
    const users = requireFixtures();
    const created = requireRows();

    const { error: inactiveError } = await adminClient
      .from("profiles")
      .update({
        account_status: "inactive",
        status_change_reason: "Task 4 invalid transfer destination",
      })
      .eq("id", users.manager.id);
    if (inactiveError) throw inactiveError;

    try {
      for (const destinationId of [
        users.manager.id,
        users.executive.id,
        users.super_admin.id,
      ]) {
        const { error } = await adminClient.rpc(
          "admin_transfer_active_ownership",
          {
            p_actor_id: users.super_admin.id,
            p_source_id: users.sales.id,
            p_destination_id: destinationId,
            p_reason: "Task 4 invalid destination contract",
          },
        );
        expect(error?.message).toContain("INVALID_OWNERSHIP_DESTINATION");
      }
      expect(await ownerId("clients", created.clientOpen)).toBe(users.sales.id);
      expect(await ownerId("tasks", created.taskOpen)).toBe(users.sales.id);
      expect(
        await ownerId("commercial_documents", created.commercialOpen),
      ).toBe(users.sales.id);
    } finally {
      const { error } = await adminClient
        .from("profiles")
        .update({
          account_status: "active",
          status_change_reason: "Task 4 invalid destination reset",
        })
        .eq("id", users.manager.id);
      expect(error).toBeNull();
    }
  });

  test("ownership transfer moves only documented active/open rows and preserves history", async () => {
    const users = requireFixtures();
    const created = requireRows();
    let auditId: string | undefined;

    try {
      const { data, error } = await adminClient.rpc(
        "admin_transfer_active_ownership",
        {
          p_actor_id: users.super_admin.id,
          p_source_id: users.sales.id,
          p_destination_id: users.manager.id,
          p_reason: "Sales territory reassignment",
        },
      );
      expect(error).toBeNull();
      expect(data as TransferCounts).toEqual({
        clients: 1,
        tasks: 1,
        commercial_items: 1,
        total: 3,
      });

      expect(await ownerId("clients", created.clientOpen)).toBe(
        users.manager.id,
      );
      expect(await ownerId("clients", created.clientLost)).toBe(users.sales.id);
      expect(await ownerId("tasks", created.taskOpen)).toBe(users.manager.id);
      expect(await ownerId("tasks", created.taskDone)).toBe(users.sales.id);
      expect(await ownerId("tasks", created.taskArchived)).toBe(users.sales.id);
      expect(
        await ownerId("commercial_documents", created.commercialOpen),
      ).toBe(users.manager.id);
      for (const historicalId of [
        created.commercialClosedWon,
        created.commercialClosedLost,
        created.commercialRevenueRecorded,
        created.commercialClosed,
      ]) {
        expect(await ownerId("commercial_documents", historicalId)).toBe(
          users.sales.id,
        );
      }
      expect(await ownerId("sales_orders", created.salesOrder)).toBe(
        users.sales.id,
      );
      expect(await ownerId("follow_up_logs", created.followUp)).toBe(
        users.sales.id,
      );

      const { data: target } = await adminClient
        .from("targets")
        .select("sales_id")
        .eq("id", created.target)
        .single();
      expect(target?.sales_id).toBe(users.sales.id);

      const { data: historicalActivity } = await adminClient
        .from("activity_log")
        .select("owner_id, actor_id")
        .eq("id", created.activityActor)
        .single();
      expect(historicalActivity).toEqual({
        owner_id: users.manager.id,
        actor_id: users.sales.id,
      });

      const { data: audit, error: auditError } = await adminClient
        .from("activity_log")
        .select(
          "id, kind, owner_id, actor_id, target_profile_id, target_profile_snapshot, administrative_reason, detail",
        )
        .eq("kind", "team_member_ownership_transferred")
        .eq("actor_id", users.super_admin.id)
        .eq("target_profile_id", users.sales.id)
        .eq("administrative_reason", "Sales territory reassignment")
        .single();
      if (auditError) throw auditError;
      auditId = audit.id;
      expect(audit.owner_id).toBe(users.manager.id);
      expect(audit.target_profile_snapshot).toEqual({
        name: "Test Sales",
        email: users.sales.email,
        role: "sales",
      });
      expect(JSON.parse(audit.detail)).toEqual({
        result: "success",
        before_owner_id: users.sales.id,
        after_owner_id: users.manager.id,
        before: { owner_id: users.sales.id },
        after: { owner_id: users.manager.id },
        counts: {
          clients: 1,
          tasks: 1,
          commercial_items: 1,
          total: 3,
        },
      });
    } finally {
      if (auditId) {
        const { error } = await adminClient
          .from("activity_log")
          .delete()
          .eq("id", auditId);
        expect(error).toBeNull();
      }
      for (const [table, ids] of [
        ["clients", [created.clientOpen]],
        ["tasks", [created.taskOpen]],
        ["commercial_documents", [created.commercialOpen]],
      ] as const) {
        const { error } = await adminClient
          .from(table)
          .update({ owner_id: users.sales.id })
          .in("id", ids);
        expect(error).toBeNull();
      }
    }
  });

  test("a mid-transfer database failure rolls back every earlier owner update and audit insert", async () => {
    const users = requireFixtures();
    const created = requireRows();
    const installFailureTrigger = `
      do $task4_install$
      begin
        execute $function_sql$
          create or replace function private.task4_injected_transfer_failure()
          returns trigger
          language plpgsql
          set search_path = ''
          as $body$
          begin
            if new.stage = 'Negotiation' then
              raise exception using message = 'TASK4_INJECTED_FAILURE';
            end if;
            return new;
          end;
          $body$
        $function_sql$;
        execute 'drop trigger if exists task4_injected_transfer_failure on public.commercial_documents';
        execute 'create trigger task4_injected_transfer_failure before update of owner_id on public.commercial_documents for each row execute function private.task4_injected_transfer_failure()';
      end
      $task4_install$;
    `;
    const removeFailureTrigger = `
      do $task4_remove$
      begin
        execute 'drop trigger if exists task4_injected_transfer_failure on public.commercial_documents';
        execute 'drop function if exists private.task4_injected_transfer_failure()';
      end
      $task4_remove$;
    `;

    await runLocalSql(installFailureTrigger);
    try {
      const { error } = await adminClient.rpc(
        "admin_transfer_active_ownership",
        {
          p_actor_id: users.super_admin.id,
          p_source_id: users.sales.id,
          p_destination_id: users.manager.id,
          p_reason: "Task 4 rollback contract",
        },
      );
      expect(error?.message).toContain("TASK4_INJECTED_FAILURE");

      expect(await ownerId("clients", created.clientOpen)).toBe(users.sales.id);
      expect(await ownerId("tasks", created.taskOpen)).toBe(users.sales.id);
      expect(
        await ownerId("commercial_documents", created.commercialOpen),
      ).toBe(users.sales.id);

      const { count, error: auditError } = await adminClient
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("kind", "team_member_ownership_transferred")
        .eq("administrative_reason", "Task 4 rollback contract");
      if (auditError) throw auditError;
      expect(count).toBe(0);
    } finally {
      await runLocalSql(removeFailureTrigger);
    }
  }, 10_000);

  test("profile creation is atomic with an administrative audit snapshot", async () => {
    const users = requireFixtures();
    const authUser = await createAuthOnlyUser("create-profile");
    let auditId: string | undefined;

    try {
      const { data, error } = await adminClient.rpc(
        "admin_create_team_member_profile",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: authUser.id,
          p_name: "Created Team Member",
          p_email: authUser.email,
          p_initials: "CT",
          p_role: "sales",
        },
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({ id: authUser.id, action: "create" });
      auditId = data.audit_id;

      const { data: profile, error: profileError } = await adminClient
        .from("profiles")
        .select("role, account_status, name, initials, email")
        .eq("id", authUser.id)
        .single();
      if (profileError) throw profileError;
      expect(profile).toEqual({
        role: "sales",
        account_status: "active",
        name: "Created Team Member",
        initials: "CT",
        email: authUser.email,
      });

      const { data: audit, error: auditError } = await adminClient
        .from("activity_log")
        .select(
          "kind, owner_id, actor_id, target_profile_id, target_profile_snapshot, administrative_reason, detail",
        )
        .eq("id", auditId)
        .single();
      if (auditError) throw auditError;
      expect(audit).toMatchObject({
        kind: "team_member_created",
        // Administrative lifecycle events have no business owner. The actor
        // carries the non-null Activity Log scope column so the target keeps
        // only snapshot-compatible, non-blocking target references.
        owner_id: users.super_admin.id,
        actor_id: users.super_admin.id,
        target_profile_id: authUser.id,
        target_profile_snapshot: {
          name: "Created Team Member",
          email: authUser.email,
          role: "sales",
        },
        administrative_reason: "Membuat anggota tim",
      });
      expect(JSON.parse(audit.detail)).toEqual({
        result: "success",
        before: null,
        after: {
          name: "Created Team Member",
          initials: "CT",
          role: "sales",
          account_status: "active",
        },
      });
    } finally {
      if (auditId) await deleteAuditIds([auditId]);
      await deleteDisposableAuth(authUser.id);
    }
  });

  test("profile update writes before/after detail in the same transaction", async () => {
    const users = requireFixtures();
    const target = await createDisposableProfile("update-profile");
    let auditId: string | undefined;

    try {
      const { data, error } = await adminClient.rpc(
        "admin_update_team_member_profile",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_name: "Updated Team Member",
          p_initials: "UT",
        },
      );
      expect(error).toBeNull();
      auditId = data.audit_id;

      const { data: profile } = await adminClient
        .from("profiles")
        .select("name, initials")
        .eq("id", target.id)
        .single();
      expect(profile).toEqual({ name: "Updated Team Member", initials: "UT" });

      const { data: audit } = await adminClient
        .from("activity_log")
        .select("kind, administrative_reason, detail")
        .eq("id", auditId)
        .single();
      expect(audit?.kind).toBe("team_member_profile_updated");
      expect(audit?.administrative_reason).toBe(
        "Memperbarui profil anggota tim",
      );
      expect(JSON.parse(audit!.detail)).toEqual({
        result: "success",
        before: { name: "Task 4 update-profile", initials: "T4" },
        after: { name: "Updated Team Member", initials: "UT" },
      });
    } finally {
      if (auditId) await deleteAuditIds([auditId]);
      await deleteDisposableAuth(target.id);
    }
  });

  test("an audit insertion failure rolls back the profile update", async () => {
    const users = requireFixtures();
    const target = await createDisposableProfile("audit-rollback");
    const installFailureTrigger = `
      do $task4_install$
      begin
        execute $function_sql$
          create or replace function private.task4_injected_audit_failure()
          returns trigger
          language plpgsql
          set search_path = ''
          as $body$
          begin
            if new.target_profile_id = '${target.id}'::uuid then
              raise exception using message = 'TASK4_INJECTED_AUDIT_FAILURE';
            end if;
            return new;
          end;
          $body$
        $function_sql$;
        execute 'drop trigger if exists task4_injected_audit_failure on public.activity_log';
        execute 'create trigger task4_injected_audit_failure before insert on public.activity_log for each row execute function private.task4_injected_audit_failure()';
      end
      $task4_install$;
    `;
    const removeFailureTrigger = `
      do $task4_remove$
      begin
        execute 'drop trigger if exists task4_injected_audit_failure on public.activity_log';
        execute 'drop function if exists private.task4_injected_audit_failure()';
      end
      $task4_remove$;
    `;

    await runLocalSql(installFailureTrigger);
    try {
      const { error } = await adminClient.rpc(
        "admin_update_team_member_profile",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_name: "Must Roll Back",
          p_initials: "RB",
        },
      );
      expect(error?.message).toContain("TASK4_INJECTED_AUDIT_FAILURE");

      const { data: profile } = await adminClient
        .from("profiles")
        .select("name, initials")
        .eq("id", target.id)
        .single();
      expect(profile).toEqual({
        name: "Task 4 audit-rollback",
        initials: "T4",
      });
    } finally {
      await runLocalSql(removeFailureTrigger);
      await deleteDisposableAuth(target.id);
    }
  }, 10_000);

  test("role changes enforce caller, current-account, ownership, and last-admin protections", async () => {
    const users = requireFixtures();
    const target = await createDisposableProfile("role-change");
    const auditIds: string[] = [];

    try {
      const { error: managerError } = await adminClient.rpc(
        "admin_change_team_member_role",
        {
          p_actor_id: users.manager.id,
          p_target_id: target.id,
          p_role: "manager",
          p_reason: "Unauthorized Manager attempt",
        },
      );
      expect(managerError?.message).toContain("ACTIVE_SUPER_ADMIN_REQUIRED");

      const { error: selfError } = await adminClient.rpc(
        "admin_change_team_member_role",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: users.super_admin.id,
          p_role: "manager",
          p_reason: "Self demotion attempt",
        },
      );
      expect(selfError?.message).toContain("SELF_ROLE_CHANGE_FORBIDDEN");

      const { error: ownershipError } = await adminClient.rpc(
        "admin_change_team_member_role",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: users.sales.id,
          p_role: "executive",
          p_reason: "Referenced owner demotion attempt",
        },
      );
      expect(ownershipError?.message).toContain("ACCOUNT_HAS_OWNERSHIP");

      const { data, error } = await adminClient.rpc(
        "admin_change_team_member_role",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_role: "manager",
          p_reason: "Promote unused Sales account",
        },
      );
      expect(error).toBeNull();
      auditIds.push(data.audit_id);

      const { data: profile } = await adminClient
        .from("profiles")
        .select("role")
        .eq("id", target.id)
        .single();
      expect(profile?.role).toBe("manager");

      const { data: audit } = await adminClient
        .from("activity_log")
        .select("administrative_reason, detail")
        .eq("id", data.audit_id)
        .single();
      expect(audit?.administrative_reason).toBe("Promote unused Sales account");
      expect(JSON.parse(audit!.detail)).toMatchObject({
        result: "success",
        before: { role: "sales" },
        after: { role: "manager" },
      });
    } finally {
      await deleteAuditIds(auditIds);
      await deleteDisposableAuth(target.id);
    }
  });

  test("deactivate and reactivate change database authority first and append immutable audit", async () => {
    const users = requireFixtures();
    const target = await createDisposableProfile("status-change");
    const auditIds: string[] = [];

    try {
      const { error: managerError } = await adminClient.rpc(
        "admin_set_team_member_status",
        {
          p_actor_id: users.manager.id,
          p_target_id: target.id,
          p_account_status: "inactive",
          p_reason: "Manager cannot deactivate",
        },
      );
      expect(managerError?.message).toContain("ACTIVE_SUPER_ADMIN_REQUIRED");

      const { error: selfError } = await adminClient.rpc(
        "admin_set_team_member_status",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: users.super_admin.id,
          p_account_status: "inactive",
          p_reason: "Self deactivation attempt",
        },
      );
      expect(selfError?.message).toContain("SELF_DEACTIVATION_FORBIDDEN");

      const { data: deactivated, error: deactivateError } =
        await adminClient.rpc("admin_set_team_member_status", {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_account_status: "inactive",
          p_reason: "Contract ended",
        });
      expect(deactivateError).toBeNull();
      auditIds.push(deactivated.audit_id);

      const { data: inactiveProfile } = await adminClient
        .from("profiles")
        .select(
          "account_status, status_changed_by, status_change_reason, status_changed_at",
        )
        .eq("id", target.id)
        .single();
      expect(inactiveProfile).toMatchObject({
        account_status: "inactive",
        status_changed_by: users.super_admin.id,
        status_change_reason: "Contract ended",
      });
      expect(inactiveProfile?.status_changed_at).not.toBeNull();

      const { data: reactivated, error: reactivateError } =
        await adminClient.rpc("admin_set_team_member_status", {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_account_status: "active",
          p_reason: "Contract renewed",
        });
      expect(reactivateError).toBeNull();
      auditIds.push(reactivated.audit_id);

      const { data: activeProfile } = await adminClient
        .from("profiles")
        .select("account_status, status_change_reason")
        .eq("id", target.id)
        .single();
      expect(activeProfile).toEqual({
        account_status: "active",
        status_change_reason: "Contract renewed",
      });

      const { data: audits } = await adminClient
        .from("activity_log")
        .select("kind, administrative_reason, detail")
        .in("id", auditIds)
        .order("created_at", { ascending: true });
      expect(audits?.map((row) => row.kind).sort()).toEqual([
        "team_member_deactivated",
        "team_member_reactivated",
      ]);
      expect(
        audits?.every((row) => JSON.parse(row.detail).result === "success"),
      ).toBe(true);
    } finally {
      await deleteAuditIds(auditIds);
      await deleteDisposableAuth(target.id);
    }
  });

  test("eligible delete uses fresh blockers, preserves target-only audit snapshots, and deletes only the profile", async () => {
    const users = requireFixtures();
    const target = await createDisposableProfile("eligible-delete");
    const auditIds: string[] = [];

    try {
      const { data: targetAudit, error: targetAuditError } = await adminClient
        .from("activity_log")
        .insert({
          kind: "team_member_profile_updated",
          owner_id: users.manager.id,
          actor_id: users.super_admin.id,
          target_profile_id: target.id,
          target_profile_snapshot: {
            name: "Task 4 eligible-delete",
            email: target.email,
            role: "sales",
          },
          administrative_reason: "Target-only audit remains non-blocking",
          title: "Target-only audit",
          detail: JSON.stringify({ result: "success" }),
        })
        .select("id")
        .single();
      if (targetAuditError) throw targetAuditError;
      auditIds.push(targetAudit.id);

      const { error: referencedError } = await adminClient.rpc(
        "admin_delete_eligible_account",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: users.sales.id,
          p_reason: "Referenced account delete attempt",
        },
      );
      expect(referencedError?.message).toContain("ACCOUNT_HAS_REFERENCES");
      expect(referencedError?.details).toContain('"total_blocking": 16');

      const { data, error } = await adminClient.rpc(
        "admin_delete_eligible_account",
        {
          p_actor_id: users.super_admin.id,
          p_target_id: target.id,
          p_reason: "Duplicate account created by mistake",
        },
      );
      expect(error).toBeNull();
      expect(data).toMatchObject({
        id: target.id,
        action: "delete_eligible_account",
        reference_counts: { total_blocking: 0, activity_log_target: 1 },
      });
      auditIds.push(data.audit_id);

      const { data: profile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", target.id)
        .maybeSingle();
      expect(profile).toBeNull();

      const { data: preservedAudits } = await adminClient
        .from("activity_log")
        .select("id, target_profile_id, target_profile_snapshot, detail")
        .in("id", auditIds);
      expect(preservedAudits).toHaveLength(2);
      expect(
        preservedAudits?.every((row) => row.target_profile_id === null),
      ).toBe(true);
      expect(
        preservedAudits?.every(
          (row) => row.target_profile_snapshot?.email === target.email,
        ),
      ).toBe(true);
      const deleteAudit = preservedAudits?.find(
        (row) => row.id === data.audit_id,
      );
      expect(JSON.parse(deleteAudit!.detail)).toMatchObject({
        result: "database_deleted",
        before: { id: target.id, role: "sales", account_status: "active" },
        after: null,
      });
    } finally {
      await deleteAuditIds(auditIds);
      await deleteDisposableAuth(target.id);
    }
  });
});
