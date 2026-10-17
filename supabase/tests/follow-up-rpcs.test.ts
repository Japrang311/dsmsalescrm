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
let exceptionCommercialDocumentId: string;
let otherOwnerClientId: string;
let otherOwnerCommercialDocumentId: string;
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

  const { data: exceptionDocument, error: exceptionDocumentError } =
    await adminClient
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
  if (exceptionDocumentError) throw exceptionDocumentError;
  exceptionCommercialDocumentId = exceptionDocument.id;

  const { data: otherOwnerClient, error: otherOwnerClientError } =
    await adminClient
      .from("clients")
      .insert({
        name: `Other owner follow-up client ${crypto.randomUUID()}`,
        status: "Prospect",
        source: "Referral",
        owner_id: fixtures.manager.id,
      })
      .select("id")
      .single();
  if (otherOwnerClientError) throw otherOwnerClientError;
  otherOwnerClientId = otherOwnerClient.id;

  const { data: otherOwnerDocument, error: otherOwnerDocumentError } =
    await adminClient
      .from("commercial_documents")
      .insert({
        client_id: otherOwnerClientId,
        owner_id: fixtures.manager.id,
        type: "Quotation",
        source_flow: "RFQ / New Product",
        document_date: "2026-08-05",
        stage: "Negotiation",
      })
      .select("id")
      .single();
  if (otherOwnerDocumentError) throw otherOwnerDocumentError;
  otherOwnerCommercialDocumentId = otherOwnerDocument.id;
});

afterAll(async () => {
  if (fixtures) {
    await db`
      delete from private.crm_command_replays
      where actor_id in (
        ${fixtures.sales.id},
        ${fixtures.manager.id},
        ${fixtures.executive.id},
        ${fixtures.super_admin.id}
      )
    `;
  }
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
  if (exceptionCommercialDocumentId) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("id", exceptionCommercialDocumentId);
  }
  if (otherOwnerCommercialDocumentId) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("id", otherOwnerCommercialDocumentId);
  }
  if (otherOwnerClientId) {
    await adminClient.from("clients").delete().eq("id", otherOwnerClientId);
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

describe("record_commercial_exception_follow_up", () => {
  test("serializes concurrent exception actions, reuses the active Task, and replays one request without duplicate writes", async () => {
    const client = await signInAs(fixtures.sales);
    const firstRequestId = crypto.randomUUID();
    const secondRequestId = crypto.randomUUID();
    const input = {
      p_commercial_document_id: exceptionCommercialDocumentId,
      p_preferred_task_id: null,
      p_create_task_title: "Exception follow-up Task",
      p_task_due_date: "2026-08-07",
      p_next_action: "Confirm exception follow-up",
      p_next_action_date: "2026-08-08",
      p_note: "Exception follow-up from action queue",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    };

    const [first, second] = await Promise.all([
      client.rpc("record_commercial_exception_follow_up", {
        ...input,
        p_request_id: firstRequestId,
      }),
      client.rpc("record_commercial_exception_follow_up", {
        ...input,
        p_request_id: secondRequestId,
      }),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data.task_id).toBe(second.data.task_id);
    expect([first.data.created_task, second.data.created_task].sort()).toEqual([
      false,
      true,
    ]);

    taskIds.push(first.data.task_id);
    for (const result of [first.data, second.data]) {
      followUpIds.push(result.follow_up_log_id);
      activityIds.push(result.activity_log_id);
    }

    const replay = await client.rpc("record_commercial_exception_follow_up", {
      ...input,
      p_request_id: firstRequestId,
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);

    const mismatch = await client.rpc("record_commercial_exception_follow_up", {
      ...input,
      p_request_id: firstRequestId,
      p_next_action: "Payload berbeda",
    });
    expect(mismatch.error?.code).toBe("23514");

    const { count: taskCount } = await adminClient
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("commercial_document_id", exceptionCommercialDocumentId)
      .eq("archived", false)
      .not("workflow_status", "in", '("Done","Cancelled")');
    expect(taskCount).toBe(1);

    const { count: followUpCount } = await adminClient
      .from("follow_up_logs")
      .select("id", { count: "exact", head: true })
      .eq("commercial_document_id", exceptionCommercialDocumentId);
    expect(followUpCount).toBe(2);
  });

  test("rejects the read-only Executive role", async () => {
    const client = await signInAs(fixtures.executive);
    const result = await client.rpc("record_commercial_exception_follow_up", {
      p_request_id: crypto.randomUUID(),
      p_commercial_document_id: exceptionCommercialDocumentId,
      p_preferred_task_id: null,
      p_create_task_title: "Must not be created",
      p_task_due_date: "2026-08-07",
      p_next_action: "Must not persist",
      p_next_action_date: "2026-08-08",
      p_note: "Executive cannot mutate",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    });

    expect(result.error?.code).toBe("42501");
  });

  test("revokes anonymous execution and blocks cross-owner Sales access", async () => {
    const input = {
      p_request_id: crypto.randomUUID(),
      p_commercial_document_id: otherOwnerCommercialDocumentId,
      p_preferred_task_id: null,
      p_create_task_title: "Must not be created",
      p_task_due_date: "2026-08-07",
      p_next_action: "Must not persist",
      p_next_action_date: "2026-08-08",
      p_note: "Unauthorized direct call",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    };

    const privilegeRows = await db`
      select has_function_privilege(
        'anon',
        'public.record_commercial_exception_follow_up(uuid,uuid,uuid,text,date,text,date,text,public.task_method,public.follow_up_result,date,public.task_workflow_status)',
        'EXECUTE'
      ) as allowed
    `;
    expect(privilegeRows[0].allowed).toBe(false);

    const sales = await signInAs(fixtures.sales);
    const crossOwnerResult = await sales.rpc(
      "record_commercial_exception_follow_up",
      { ...input, p_request_id: crypto.randomUUID() },
    );
    expect(crossOwnerResult.error?.code).toBe("42501");

    const { count } = await adminClient
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("commercial_document_id", otherOwnerCommercialDocumentId);
    expect(count).toBe(0);
  });

  test("rejects an invalid preferred Task and requires a choice when several active Tasks exist", async () => {
    const unrelatedTaskId = await insertTask();
    const { data: wrongClientTask, error: wrongClientTaskError } =
      await adminClient
        .from("tasks")
        .insert({
          client_id: otherOwnerClientId,
          commercial_document_id: exceptionCommercialDocumentId,
          owner_id: fixtures.sales.id,
          title: "Wrong-client exception Task",
          due_date: "2026-08-07",
          method: "Phone",
          category: "Follow-Up",
        })
        .select("id")
        .single();
    if (wrongClientTaskError) throw wrongClientTaskError;
    taskIds.push(wrongClientTask.id);
    const sales = await signInAs(fixtures.sales);
    const baseInput = {
      p_request_id: crypto.randomUUID(),
      p_commercial_document_id: exceptionCommercialDocumentId,
      p_preferred_task_id: unrelatedTaskId,
      p_create_task_title: "Fallback exception Task",
      p_task_due_date: "2026-08-07",
      p_next_action: "Confirm next step",
      p_next_action_date: "2026-08-08",
      p_note: "Invalid preferred Task",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: "2026-08-05",
      p_workflow_status_target: "In Progress",
    };
    const invalidPreferred = await sales.rpc(
      "record_commercial_exception_follow_up",
      baseInput,
    );
    expect(invalidPreferred.error?.code).toBe("23514");
    expect(invalidPreferred.error?.message).toContain("ACTIVE_TASK_NOT_FOUND");

    const wrongClientPreferred = await sales.rpc(
      "record_commercial_exception_follow_up",
      {
        ...baseInput,
        p_request_id: crypto.randomUUID(),
        p_preferred_task_id: wrongClientTask.id,
      },
    );
    expect(wrongClientPreferred.error?.code).toBe("23514");
    expect(wrongClientPreferred.error?.message).toContain(
      "ACTIVE_TASK_NOT_FOUND",
    );

    await adminClient.from("tasks").delete().eq("id", wrongClientTask.id);

    const { data: ambiguousTasks, error: ambiguousTaskError } =
      await adminClient
        .from("tasks")
        .insert([
          {
            client_id: otherOwnerClientId,
            commercial_document_id: otherOwnerCommercialDocumentId,
            owner_id: fixtures.manager.id,
            title: "Ambiguous exception Task A",
            due_date: "2026-08-07",
            method: "Phone",
            category: "Follow-Up",
          },
          {
            client_id: otherOwnerClientId,
            commercial_document_id: otherOwnerCommercialDocumentId,
            owner_id: fixtures.manager.id,
            title: "Ambiguous exception Task B",
            due_date: "2026-08-07",
            method: "Phone",
            category: "Follow-Up",
          },
        ])
        .select("id");
    if (ambiguousTaskError) throw ambiguousTaskError;

    try {
      const manager = await signInAs(fixtures.manager);
      const ambiguous = await manager.rpc(
        "record_commercial_exception_follow_up",
        {
          ...baseInput,
          p_request_id: crypto.randomUUID(),
          p_commercial_document_id: otherOwnerCommercialDocumentId,
          p_preferred_task_id: null,
          p_note: "Ambiguous active Tasks",
        },
      );
      expect(ambiguous.error?.code).toBe("23514");
      expect(ambiguous.error?.message).toContain(
        "ACTIVE_TASK_SELECTION_REQUIRED",
      );
    } finally {
      await adminClient
        .from("tasks")
        .delete()
        .in(
          "id",
          (ambiguousTasks ?? []).map((task) => task.id),
        );
    }
  });

  test("rolls back Task, progress records, and replay state when audit insertion fails", async () => {
    const client = await signInAs(fixtures.manager);
    const requestId = crypto.randomUUID();

    await db`drop trigger if exists zzz_test_exception_activity_failure on public.activity_log`;
    await db`drop function if exists private.zzz_test_exception_activity_failure()`;
    await db`
      create function private.zzz_test_exception_activity_failure()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'forced exception follow-up activity failure' using errcode = 'P0001';
      end;
      $$
    `;
    await db`
      create trigger zzz_test_exception_activity_failure
      before insert on public.activity_log
      for each row execute function private.zzz_test_exception_activity_failure()
    `;

    try {
      const result = await client.rpc("record_commercial_exception_follow_up", {
        p_request_id: requestId,
        p_commercial_document_id: otherOwnerCommercialDocumentId,
        p_preferred_task_id: null,
        p_create_task_title: "Rollback exception Task",
        p_task_due_date: "2026-08-07",
        p_next_action: "Must roll back",
        p_next_action_date: "2026-08-08",
        p_note: "Rollback exception follow-up",
        p_method: "Phone",
        p_result: "Interested",
        p_fu_date: "2026-08-05",
        p_workflow_status_target: "In Progress",
      });
      expect(result.error?.code).toBe("P0001");

      const { count: taskCount } = await adminClient
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("commercial_document_id", otherOwnerCommercialDocumentId);
      const { count: followUpCount } = await adminClient
        .from("follow_up_logs")
        .select("id", { count: "exact", head: true })
        .eq("commercial_document_id", otherOwnerCommercialDocumentId);
      const replayRows = await db`
        select count(*)::integer as count
        from private.crm_command_replays
        where actor_id = ${fixtures.manager.id}
          and command = 'commercial_exception_follow_up'
          and request_id = ${requestId}
      `;

      expect(taskCount).toBe(0);
      expect(followUpCount).toBe(0);
      expect(replayRows[0].count).toBe(0);
    } finally {
      await db`drop trigger if exists zzz_test_exception_activity_failure on public.activity_log`;
      await db`drop function if exists private.zzz_test_exception_activity_failure()`;
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
