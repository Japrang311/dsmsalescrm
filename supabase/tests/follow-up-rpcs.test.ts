import { SQL } from "bun";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

let fixtures: RoleFixtureUsers;
let clientId: string;
let commercialDocumentId: string;
const taskIds: string[] = [];
const activityIds: string[] = [];
const followUpIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `RPC follow-up client ${crypto.randomUUID()}`,
      status: "Prospect",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-08-05",
      stage: "Negotiation",
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  commercialDocumentId = document.id;
});

afterAll(async () => {
  if (followUpIds.length > 0) {
    await adminClient.from("follow_up_logs").delete().in("id", followUpIds);
  }
  if (activityIds.length > 0) {
    await adminClient.from("activity_log").delete().in("id", activityIds);
  }
  if (taskIds.length > 0) {
    await adminClient.from("tasks").delete().in("id", taskIds);
  }
  if (commercialDocumentId) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("id", commercialDocumentId);
  }
  if (clientId) {
    await adminClient.from("clients").delete().eq("id", clientId);
  }
  await deleteRoleFixtureUsers(fixtures);
});

async function insertTask(input: { commercialDocumentId?: string } = {}) {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: clientId,
      commercial_document_id: input.commercialDocumentId ?? null,
      owner_id: fixtures.sales.id,
      title: "Existing follow-up Task",
      due_date: "2026-08-06",
      method: "Phone",
      category: "Follow-Up",
    })
    .select("id")
    .single();
  if (error) throw error;
  taskIds.push(data.id);
  return data.id as string;
}

describe("record_client_follow_up", () => {
  test("progresses an explicitly selected Task and writes one follow-up plus one activity event atomically", async () => {
    const taskId = await insertTask();
    const client = await signInAs(fixtures.sales);

    const { data, error } = await client.rpc("record_client_follow_up", {
      p_client_id: clientId,
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Send sample availability",
      p_next_action_date: "2026-08-08",
      p_note: "Client asked for sample timing",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    });

    expect(error).toBeNull();
    const row = data![0];
    taskIds.push(row.task_id);
    followUpIds.push(row.follow_up_log_id);
    activityIds.push(row.activity_log_id);
    expect(row.task_id).toBe(taskId);
    expect(row.created_task).toBe(false);

    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status, next_action, next_action_date")
      .eq("id", taskId)
      .single();
    expect(task).toMatchObject({
      workflow_status: "In Progress",
      next_action: "Send sample availability",
      next_action_date: "2026-08-08",
    });
  });

  test("requires exactly one explicit Task selection or create-new Task instruction", async () => {
    const taskId = await insertTask();
    const client = await signInAs(fixtures.sales);

    const missingChoice = await client.rpc("record_client_follow_up", {
      p_client_id: clientId,
      p_task_id: null,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Follow up",
      p_next_action_date: "2026-08-08",
    });
    expect(missingChoice.error?.code).toBe("23514");

    const doubleChoice = await client.rpc("record_client_follow_up", {
      p_client_id: clientId,
      p_task_id: taskId,
      p_create_task_title: "Create and progress should be rejected",
      p_task_due_date: "2026-08-07",
      p_next_action: "Follow up",
      p_next_action_date: "2026-08-08",
    });
    expect(doubleChoice.error?.code).toBe("23514");
  });
});

describe("record_commercial_follow_up", () => {
  test("creates one explicit commercial Task and logs its first progress in the same transaction", async () => {
    const client = await signInAs(fixtures.sales);

    const { data, error } = await client.rpc("record_commercial_follow_up", {
      p_commercial_document_id: commercialDocumentId,
      p_task_id: null,
      p_create_task_title: "Follow quotation after sample review",
      p_task_due_date: "2026-08-07",
      p_next_action: "Confirm quotation feedback",
      p_next_action_date: "2026-08-08",
      p_note: "Commercial follow-up created from drawer",
      p_method: "WhatsApp",
      p_result: "Negotiation",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    });

    expect(error).toBeNull();
    const row = data![0];
    taskIds.push(row.task_id);
    followUpIds.push(row.follow_up_log_id);
    activityIds.push(row.activity_log_id);
    expect(row.created_task).toBe(true);

    const { data: persisted } = await adminClient
      .from("tasks")
      .select("client_id, commercial_document_id, title, workflow_status")
      .eq("id", row.task_id)
      .single();
    expect(persisted).toMatchObject({
      client_id: clientId,
      commercial_document_id: commercialDocumentId,
      title: "Follow quotation after sample review",
      workflow_status: "In Progress",
    });
  });

  test("rolls back Task creation when the final audit insert fails", async () => {
    const client = await signInAs(fixtures.sales);

    await db`drop trigger if exists zzz_test_stage1_activity_failure on public.activity_log`;
    await db`drop function if exists private.zzz_test_stage1_activity_failure()`;
    await db`
          create or replace function private.zzz_test_stage1_activity_failure()
          returns trigger
          language plpgsql
          as $$
          begin
            raise exception 'forced follow-up activity failure' using errcode = 'P0001';
          end;
          $$;
      `;

    await db`
          create trigger zzz_test_stage1_activity_failure
          before insert on public.activity_log
          for each row execute function private.zzz_test_stage1_activity_failure();
      `;

    try {
      const beforeCounts = await countsForTitle("Rollback commercial Task");

      const { error } = await client.rpc("record_commercial_follow_up", {
        p_commercial_document_id: commercialDocumentId,
        p_task_id: null,
        p_create_task_title: "Rollback commercial Task",
        p_task_due_date: "2026-08-07",
        p_next_action: "Should not persist",
        p_next_action_date: "2026-08-08",
        p_note: "Should roll back",
      });

      expect(error?.code).toBe("P0001");
      expect(await countsForTitle("Rollback commercial Task")).toEqual(
        beforeCounts,
      );
    } finally {
      await db`drop trigger if exists zzz_test_stage1_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_stage1_activity_failure()`;
    }
  });
});

async function countsForTitle(title: string) {
  const { count: taskCount, error: taskError } = await adminClient
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("title", title);
  if (taskError) throw taskError;

  const { count: followUpCount, error: followUpError } = await adminClient
    .from("follow_up_logs")
    .select("id", { count: "exact", head: true })
    .eq("notes", "Should roll back");
  if (followUpError) throw followUpError;

  const { count: activityCount, error: activityError } = await adminClient
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("detail", "Should roll back");
  if (activityError) throw activityError;

  return { taskCount, followUpCount, activityCount };
}
