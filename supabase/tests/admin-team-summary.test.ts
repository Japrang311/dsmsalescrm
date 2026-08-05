// Integration coverage for public.admin_team_summary() (Stage 3 N+1 fix
// for src/lib/data/team.ts's listTeamMembers()). The fake-client unit
// tests in src/lib/data/team.test.ts cover row-mapping; this file proves
// the real RPC against the real database: RLS gating, and the counting
// predicate (soft-deleted documents and superseded Quotation revisions
// must not count as "active").
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let clientId: string;
const documentIds: string[] = [];
const taskIds: string[] = [];
const activityIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Team summary fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const { data: task, error: taskError } = await adminClient
    .from("tasks")
    .insert({
      owner_id: fixtures.sales.id,
      client_id: clientId,
      title: "Team summary fixture task",
      method: "Phone",
      due_date: "2096-01-01",
      workflow_status: "Open",
      archived: false,
    })
    .select("id")
    .single();
  if (taskError) throw taskError;
  taskIds.push(task.id);

  // One active current-revision Quotation (must count), one soft-deleted
  // current-revision Quotation (must NOT count), one superseded revision
  // (must NOT count), one active but terminal-stage Quotation (must NOT
  // count) — this predicate is the correctness fix this migration makes.
  const documentRows = [
    {
      label: "active",
      stage: "Quotes Sent",
      is_current_revision: true,
      deleted_at: null as string | null,
    },
    {
      label: "soft-deleted",
      stage: "Quotes Sent",
      is_current_revision: true,
      deleted_at: new Date().toISOString(),
    },
    {
      label: "superseded",
      stage: "Quotes Sent",
      is_current_revision: false,
      deleted_at: null,
    },
    {
      label: "terminal-stage",
      stage: "Closed Won",
      is_current_revision: true,
      deleted_at: null,
    },
  ];
  for (const row of documentRows) {
    const { data: document, error: documentError } = await adminClient
      .from("commercial_documents")
      .insert({
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Quotation",
        source_flow: "RFQ / New Product",
        document_date: "2096-01-01",
        quotation_number: `QUO-TEAM-${row.label}-${crypto.randomUUID()}`,
        quotation_base_number: `QUO-TEAM-${row.label}-${crypto.randomUUID()}`,
        stage: row.stage,
        is_current_revision: row.is_current_revision,
        deleted_at: row.deleted_at,
      })
      .select("id")
      .single();
    if (documentError) throw documentError;
    documentIds.push(document.id);
  }

  const activityRows = [
    {
      kind: "team_member_role_changed",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.manager.id,
      target_profile_id: fixtures.sales.id,
      title: "Role diubah",
      administrative_reason: "Promosi awal",
      created_at: "2096-01-01T00:00:00Z",
    },
    {
      kind: "team_member_deactivated",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.manager.id,
      target_profile_id: fixtures.sales.id,
      title: "Dinonaktifkan sementara",
      administrative_reason: "Cuti",
      created_at: "2096-01-02T00:00:00Z",
    },
  ];
  const { data: insertedActivity, error: activityError } = await adminClient
    .from("activity_log")
    .insert(activityRows)
    .select("id");
  if (activityError) throw activityError;
  activityIds.push(...(insertedActivity ?? []).map((row) => row.id));
});

afterAll(async () => {
  await adminClient.from("activity_log").delete().in("id", activityIds);
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("tasks").delete().in("id", taskIds);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("admin_team_summary RPC", () => {
  test("Manager sees the roster with correct counts, excluding soft-deleted and superseded commercial documents", async () => {
    const managerClient = await signInAs(fixtures.manager);
    const { data, error } = await managerClient.rpc("admin_team_summary");
    if (error) throw error;

    const row = data!.find(
      (entry: { id: string }) => entry.id === fixtures.sales.id,
    );
    expect(row).toBeDefined();
    expect(row.clients_count).toBeGreaterThanOrEqual(1);
    expect(row.tasks_count).toBeGreaterThanOrEqual(1);
    // Exactly the one "active" document counts — soft-deleted, superseded,
    // and terminal-stage siblings must not.
    expect(row.commercial_items_count).toBe(1);
    // Latest activity_log row wins, not the first one inserted.
    expect(row.last_change_kind).toBe("team_member_deactivated");
    expect(row.last_change_reason).toBe("Cuti");
  });

  test("Executive can also read the roster (read-only role, still privileged)", async () => {
    const executiveClient = await signInAs(fixtures.executive);
    const { data, error } = await executiveClient.rpc("admin_team_summary");
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test("Sales is denied with INSUFFICIENT_PRIVILEGE", async () => {
    const salesClient = await signInAs(fixtures.sales);
    const { data, error } = await salesClient.rpc("admin_team_summary");
    expect(data).toBeNull();
    expect(error?.message).toContain("INSUFFICIENT_PRIVILEGE");
  });
});
