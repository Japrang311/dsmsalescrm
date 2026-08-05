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
const documentIds: string[] = [];
const taskIds: string[] = [];
const followUpIds: string[] = [];
const activityIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error } = await adminClient
    .from("clients")
    .insert({
      name: `Stage transition RPC ${crypto.randomUUID()}`,
      status: "Prospect",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = client.id;
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
  if (documentIds.length > 0) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .in("id", documentIds);
  }
  if (clientId) {
    await adminClient.from("clients").delete().eq("id", clientId);
  }
  await deleteRoleFixtureUsers(fixtures);
});

async function insertQuotation(stage = "Negotiation") {
  const { data, error } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-08-05",
      stage,
    })
    .select("id")
    .single();
  if (error) throw error;
  documentIds.push(data.id);
  return data.id as string;
}

async function insertTask(documentId: string) {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: clientId,
      commercial_document_id: documentId,
      owner_id: fixtures.sales.id,
      title: "Stage transition linked Task",
      due_date: "2026-08-06",
      method: "Phone",
      category: "Quotation",
    })
    .select("id")
    .single();
  if (error) throw error;
  taskIds.push(data.id);
  return data.id as string;
}

describe("transition_commercial_stage", () => {
  test("updates stage, writes structured stage audit, and progresses the exact linked Task", async () => {
    const documentId = await insertQuotation("Negotiation");
    const taskId = await insertTask(documentId);
    const client = await signInAs(fixtures.sales);

    const { data, error } = await client.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Negotiation",
      p_to_stage: "Hot Prospect",
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Confirm budget approval",
      p_next_action_date: "2026-08-08",
      p_note: "Pipeline moved after call",
      p_method: "Phone",
      p_result: "Negotiation",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
      p_lost_reason: null,
      p_lost_reason_detail: null,
    });

    expect(error).toBeNull();
    const row = data![0];
    taskIds.push(row.task_id);
    followUpIds.push(row.follow_up_log_id);
    activityIds.push(row.task_activity_log_id, row.stage_activity_log_id);
    expect(row.from_stage).toBe("Negotiation");
    expect(row.to_stage).toBe("Hot Prospect");

    const { data: document } = await adminClient
      .from("commercial_documents")
      .select("stage")
      .eq("id", documentId)
      .single();
    expect(document?.stage).toBe("Hot Prospect");

    const { data: stageAudit } = await adminClient
      .from("activity_log")
      .select("event_data")
      .eq("id", row.stage_activity_log_id)
      .single();
    expect(stageAudit?.event_data).toMatchObject({
      schema_version: 1,
      from_stage: "Negotiation",
      to_stage: "Hot Prospect",
    });
  });

  test("rejects stale stage transitions without changing the document", async () => {
    const documentId = await insertQuotation("Negotiation");
    const taskId = await insertTask(documentId);
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Quotes Sent",
      p_to_stage: "Hot Prospect",
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Confirm budget approval",
      p_next_action_date: "2026-08-08",
    });

    expect(error?.code).toBe("P0001");
    expect(error?.message).toContain("STALE_COMMERCIAL_STAGE");

    const { data: document } = await adminClient
      .from("commercial_documents")
      .select("stage")
      .eq("id", documentId)
      .single();
    expect(document?.stage).toBe("Negotiation");
  });

  test("enforces Closed Lost reason and clears it when reopened", async () => {
    const documentId = await insertQuotation("Negotiation");
    const taskId = await insertTask(documentId);
    const client = await signInAs(fixtures.sales);

    const rejected = await client.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Negotiation",
      p_to_stage: "Closed Lost",
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Close out lost quotation",
      p_next_action_date: "2026-08-08",
    });
    expect(rejected.error?.code).toBe("23514");

    const accepted = await client.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Negotiation",
      p_to_stage: "Closed Lost",
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Archive lost quotation notes",
      p_next_action_date: "2026-08-08",
      p_lost_reason: "Harga tidak kompetitif",
      p_lost_reason_detail: null,
    });
    expect(accepted.error).toBeNull();
    const closed = accepted.data![0];
    followUpIds.push(closed.follow_up_log_id);
    activityIds.push(closed.task_activity_log_id, closed.stage_activity_log_id);

    const reopened = await client.rpc("transition_commercial_stage", {
      p_commercial_document_id: documentId,
      p_expected_from_stage: "Closed Lost",
      p_to_stage: "Negotiation",
      p_task_id: taskId,
      p_create_task_title: null,
      p_task_due_date: null,
      p_next_action: "Restart negotiation",
      p_next_action_date: "2026-08-09",
    });
    expect(reopened.error).toBeNull();
    const reopenedRow = reopened.data![0];
    followUpIds.push(reopenedRow.follow_up_log_id);
    activityIds.push(
      reopenedRow.task_activity_log_id,
      reopenedRow.stage_activity_log_id,
    );

    const { data: document } = await adminClient
      .from("commercial_documents")
      .select("stage, lost_reason, lost_reason_detail")
      .eq("id", documentId)
      .single();
    expect(document).toMatchObject({
      stage: "Negotiation",
      lost_reason: null,
      lost_reason_detail: null,
    });
  });

  test("rolls back document stage and created Task when stage audit insert fails", async () => {
    const documentId = await insertQuotation("Negotiation");
    const client = await signInAs(fixtures.sales);

    try {
      await db`drop trigger if exists zzz_test_stage_transition_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_stage_transition_activity_failure()`;
      await db`
        create or replace function private.zzz_test_stage_transition_activity_failure()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.detail = 'FORCE_STAGE_TRANSITION_ROLLBACK' then
            raise exception 'forced stage transition failure' using errcode = 'P0001';
          end if;
          return new;
        end;
        $$;
      `;
      await db`
        create trigger zzz_test_stage_transition_activity_failure
        before insert on public.activity_log
        for each row execute function private.zzz_test_stage_transition_activity_failure();
      `;

      const { error } = await client.rpc("transition_commercial_stage", {
        p_commercial_document_id: documentId,
        p_expected_from_stage: "Negotiation",
        p_to_stage: "Hot Prospect",
        p_task_id: null,
        p_create_task_title: "Rollback stage Task",
        p_task_due_date: "2026-08-07",
        p_next_action: "Should not persist",
        p_next_action_date: "2026-08-08",
        p_note: "FORCE_STAGE_TRANSITION_ROLLBACK",
      });

      expect(error?.code).toBe("P0001");
      const { data: document } = await adminClient
        .from("commercial_documents")
        .select("stage")
        .eq("id", documentId)
        .single();
      expect(document?.stage).toBe("Negotiation");

      const { count: taskCount } = await adminClient
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("title", "Rollback stage Task");
      expect(taskCount).toBe(0);
    } finally {
      await db`drop trigger if exists zzz_test_stage_transition_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_stage_transition_activity_failure()`;
    }
  });
});
