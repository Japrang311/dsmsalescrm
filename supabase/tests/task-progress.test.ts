import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  jakartaDateDaysFromToday,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let clientId: string;
const createdTaskIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: anyClient, error } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (error) throw error;
  clientId = anyClient.id;
});

afterAll(async () => {
  if (createdTaskIds.length > 0) {
    // record_task_progress() writes follow_up_logs/activity_log rows that
    // reference the fixture users as owner_id/actor_id -- those must be
    // gone before deleteRoleFixtureUsers() can delete the profiles, or
    // Postgres rejects it with a foreign key violation (tasks itself has
    // no such rows left to worry about once deleted, but these two don't
    // cascade from a task delete).
    await adminClient
      .from("follow_up_logs")
      .delete()
      .in("task_id", createdTaskIds);
    await adminClient
      .from("activity_log")
      .delete()
      .in("task_id", createdTaskIds);
    await adminClient.from("tasks").delete().in("id", createdTaskIds);
  }
  await deleteRoleFixtureUsers(fixtures);
});

// Runs raw SQL against the local Postgres container as a genuinely
// separate OS process (docker exec + psql), not an in-process Bun
// connection. This was written while chasing a full-suite-only failure
// where this file's presence broke unrelated test files' `supabase.auth`
// calls elsewhere in the suite; the root cause turned out to be a
// duplicate test-file basename (both this file and
// src/lib/data/task-progress.test.ts were literally named
// "task-progress.test.ts" -- bun:test corrupts shared state across files
// with the same basename when not run with --isolate; renaming the other
// file to task-progress-adapter.test.ts fixed it). Bun.SQL itself was
// never actually at fault, but this shells out anyway since it was
// already proven correct by that point and there's no reason to
// reintroduce risk switching back. "supabase_db_DSM_SALES_WEB_APP_V2" is
// this project's fixed local container name (CLAUDE.md: local Supabase
// project ID is DSM_SALES_WEB_APP_V2), not something read from the
// environment.
async function runSql(sqlText: string): Promise<void> {
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      "supabase_db_DSM_SALES_WEB_APP_V2",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sqlText,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`psql exited ${exitCode}: ${stderr}`);
  }
}

async function insertTask(
  ownerId: string,
  dueDate = jakartaDateDaysFromToday(-10),
) {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: clientId,
      owner_id: ownerId,
      title: "Task progress fixture",
      due_date: dueDate,
      method: "Phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  createdTaskIds.push(data.id);
  return data.id as string;
}

describe("record_task_progress: one call writes exactly one follow_up_logs and one activity_log row", () => {
  test("Sales owner records a progress update with note, next action, next date, and workflow status", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const { data, error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Call back with pricing",
      p_next_action_date: "2026-08-01",
      p_note: "Discussed requirements",
      p_workflow_status_target: "In Progress",
    });
    if (error) throw error;
    const result = data![0];
    expect(result.task_id).toBe(taskId);
    expect(result.workflow_status).toBe("In Progress");

    const { data: task } = await adminClient
      .from("tasks")
      .select(
        "workflow_status, next_action, next_action_date, first_progress_at",
      )
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("In Progress");
    expect(task?.next_action).toBe("Call back with pricing");
    expect(task?.next_action_date).toBe("2026-08-01");
    expect(task?.first_progress_at).not.toBeNull();

    const { data: logs } = await adminClient
      .from("follow_up_logs")
      .select("id, task_id, owner_id, notes, next_action")
      .eq("task_id", taskId);
    expect(logs).toHaveLength(1);
    expect(logs![0].owner_id).toBe(fixtures.sales.id);
    expect(logs![0].notes).toBe("Discussed requirements");

    const { data: events } = await adminClient
      .from("activity_log")
      .select("id, kind, actor_id, owner_id")
      .eq("task_id", taskId);
    expect(events).toHaveLength(1);
    expect(events![0].kind).toBe("task_progress");
    expect(events![0].actor_id).toBe(fixtures.sales.id);
    expect(events![0].owner_id).toBe(fixtures.sales.id);
  });

  test("actor and timestamp come from the database, never the client", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);
    const before = new Date();

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Follow up",
      p_next_action_date: "2026-08-01",
    });
    if (error) throw error;

    const { data: event } = await adminClient
      .from("activity_log")
      .select("actor_id, created_at")
      .eq("task_id", taskId)
      .single();
    expect(event?.actor_id).toBe(fixtures.sales.id);
    expect(new Date(event!.created_at).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });
});

describe("record_task_progress: validation rules", () => {
  test("rejects an active workflow_status without next_action/next_action_date", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Waiting External",
    });
    expect(error?.code).toBe("23514");

    const { data: logs } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("task_id", taskId);
    expect(logs).toHaveLength(0);
  });

  test("rejects Cancelled without a cancellation_reason", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Cancelled",
    });
    expect(error?.code).toBe("23514");
  });

  test("Cancelled with a reason succeeds and clears next_action requirements", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Cancelled",
      p_cancellation_reason: "Client no longer interested",
    });
    if (error) throw error;

    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status, cancellation_reason")
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("Cancelled");
    expect(task?.cancellation_reason).toBe("Client no longer interested");
  });

  test("Done persists as workflow_status without legacy dual-write", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Done",
    });
    if (error) throw error;

    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status")
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("Done");
  });

  test("reopening a Cancelled task back to Open requires a fresh next_action and clears cancellation_reason", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Cancelled",
      p_cancellation_reason: "Paused for budget review",
    });

    const reopenMissingNextAction = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Open",
    });
    expect(reopenMissingNextAction.error?.code).toBe("23514");

    const { error: reopenError } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Re-engage client",
      p_next_action_date: "2026-09-01",
      p_workflow_status_target: "Open",
    });
    expect(reopenError).toBeNull();

    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status, cancellation_reason")
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("Open");
    expect(task?.cancellation_reason).toBeNull();
  });

  test("a direct write bypassing the RPC after first_progress_at is set must still satisfy the next-action constraint", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Initial next step",
      p_next_action_date: "2026-08-01",
    });

    const { error } = await client
      .from("tasks")
      .update({ next_action: null, next_action_date: null })
      .eq("id", taskId);
    expect(error?.code).toBe("23514");
  });

  test("a freshly created task (no progress yet) is not blocked by the next-action constraint", async () => {
    // Task creation still does not require next_action. The constraint starts
    // only after the first atomic progress entry sets first_progress_at.
    const taskId = await insertTask(fixtures.sales.id);
    const { data: task, error } = await adminClient
      .from("tasks")
      .select("workflow_status, next_action, first_progress_at")
      .eq("id", taskId)
      .single();
    expect(error).toBeNull();
    expect(task?.workflow_status).toBe("Open");
    expect(task?.next_action).toBeNull();
    expect(task?.first_progress_at).toBeNull();
  });
});

describe("record_task_progress: correction entries", () => {
  test("a correction call references the entry it corrects via corrects_id, without altering the original", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const first = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Wrong next step",
      p_next_action_date: "2026-08-01",
      p_note: "Typo'd note",
    });
    if (first.error) throw first.error;
    const originalLogId = first.data![0].follow_up_log_id as string;

    const correction = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Correct next step",
      p_next_action_date: "2026-08-02",
      p_note: "Correcting the previous entry",
      p_corrects_id: originalLogId,
    });
    if (correction.error) throw correction.error;

    const { data: original } = await adminClient
      .from("follow_up_logs")
      .select("id, notes, next_action, corrects_id")
      .eq("id", originalLogId)
      .single();
    expect(original?.notes).toBe("Typo'd note"); // untouched, insert-only
    expect(original?.corrects_id).toBeNull();

    const { data: correctionRow } = await adminClient
      .from("follow_up_logs")
      .select("id, notes, corrects_id")
      .eq("id", correction.data![0].follow_up_log_id)
      .single();
    expect(correctionRow?.corrects_id).toBe(originalLogId);

    const { data: allLogs } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("task_id", taskId);
    expect(allLogs).toHaveLength(2); // original preserved, correction added
  });
});

describe("record_task_progress: role/action matrix", () => {
  test("Manager can record progress on a Sales-owned task without changing owner_id", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.manager);

    const { data, error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Manager correction",
      p_next_action_date: "2026-08-01",
    });
    if (error) throw error;
    expect(data![0].task_id).toBe(taskId);

    const { data: task } = await adminClient
      .from("tasks")
      .select("owner_id")
      .eq("id", taskId)
      .single();
    expect(task?.owner_id).toBe(fixtures.sales.id); // unchanged

    const { data: event } = await adminClient
      .from("activity_log")
      .select("actor_id, owner_id")
      .eq("task_id", taskId)
      .single();
    expect(event?.actor_id).toBe(fixtures.manager.id);
    expect(event?.owner_id).toBe(fixtures.sales.id);
  });

  test("Super Admin can record progress on a Sales-owned task without becoming owner", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.super_admin);

    const { data, error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Super Admin correction",
      p_next_action_date: "2026-08-01",
    });
    if (error) throw error;
    expect(data![0].task_id).toBe(taskId);

    const { data: task } = await adminClient
      .from("tasks")
      .select("owner_id")
      .eq("id", taskId)
      .single();
    expect(task?.owner_id).toBe(fixtures.sales.id);
  });

  test("Sales cannot record progress on another Sales rep's task", async () => {
    const otherOwnerTaskId = await insertTask(
      "22222222-2222-2222-2222-222222222222",
    );
    const client = await signInAs(fixtures.sales);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: otherOwnerTaskId,
      p_next_action: "Should be rejected",
      p_next_action_date: "2026-08-01",
    });
    expect(error).not.toBeNull();

    const { data: logs } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("task_id", otherOwnerTaskId);
    expect(logs).toHaveLength(0);
  });

  test("Executive cannot record progress (read-only exception detail)", async () => {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.executive);

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Should be rejected",
      p_next_action_date: "2026-08-01",
    });
    expect(error).not.toBeNull();

    const { data: logs } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("task_id", taskId);
    expect(logs).toHaveLength(0);
    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status")
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("Open"); // unchanged
  });
});

describe("record_task_progress: atomicity", () => {
  const FAILURE_MARKER = "__FORCE_ATOMICITY_TEST_FAILURE__";

  test("a failure on the last step rolls back the follow_up_logs insert and the Task update", async () => {
    // Fault injection, scoped to this test only: forces the LAST write the
    // RPC makes (the activity_log insert, spec §3.3 step 5) to fail after
    // the follow_up_logs insert and tasks update have already happened
    // inside the same transaction -- proving Postgres rolls back the
    // earlier writes rather than leaving a partial follow-up log or a
    // Task update with no audit trail (the exact risk Task 2's
    // LogFollowUpDialog inventory documented). FAILURE_MARKER is a
    // compile-time constant in this file, not external input -- safe to
    // inline directly into the SQL text passed to psql.
    try {
      await runSql(`
        create or replace function private.zzz_test_force_activity_log_failure()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.detail = '${FAILURE_MARKER}' then
            raise exception 'Forced failure for atomicity test';
          end if;
          return new;
        end;
        $$;
      `);
      await runSql(`
        create trigger zzz_test_force_activity_log_failure
        before insert on public.activity_log
        for each row execute function private.zzz_test_force_activity_log_failure();
      `);

      await runAtomicityFailureAssertions();

      await runSql(
        `drop trigger if exists zzz_test_force_activity_log_failure on public.activity_log`,
      );
      await runSql(
        `drop function if exists private.zzz_test_force_activity_log_failure()`,
      );
    } finally {
      // Best-effort cleanup even if an assertion above threw -- the two
      // drops above are idempotent (IF EXISTS), so running them again
      // here is harmless if they already succeeded.
      await runSql(
        `drop trigger if exists zzz_test_force_activity_log_failure on public.activity_log`,
      ).catch(() => {});
      await runSql(
        `drop function if exists private.zzz_test_force_activity_log_failure()`,
      ).catch(() => {});
    }
  });

  async function runAtomicityFailureAssertions() {
    const taskId = await insertTask(fixtures.sales.id);
    const client = await signInAs(fixtures.sales);

    const before = await adminClient
      .from("tasks")
      .select("workflow_status, next_action")
      .eq("id", taskId)
      .single();
    expect(before.data?.workflow_status).toBe("Open");
    expect(before.data?.next_action).toBeNull();

    const { error } = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: "Should not persist",
      p_next_action_date: "2026-08-01",
      p_note: FAILURE_MARKER,
      p_workflow_status_target: "In Progress",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Forced failure for atomicity test");

    const after = await adminClient
      .from("tasks")
      .select(
        "workflow_status, next_action, next_action_date, first_progress_at",
      )
      .eq("id", taskId)
      .single();
    expect(after.data?.workflow_status).toBe("Open"); // unchanged
    expect(after.data?.next_action).toBeNull(); // not persisted
    expect(after.data?.first_progress_at).toBeNull();

    const { data: logs } = await adminClient
      .from("follow_up_logs")
      .select("id")
      .eq("task_id", taskId);
    expect(logs).toHaveLength(0); // rolled back, not orphaned

    const { data: events } = await adminClient
      .from("activity_log")
      .select("id")
      .eq("task_id", taskId);
    expect(events).toHaveLength(0);
  }
});
