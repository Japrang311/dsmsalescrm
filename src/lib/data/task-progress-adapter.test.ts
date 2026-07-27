// Exercises the real src/lib/data/task-progress.ts wrapper end-to-end
// against the local Supabase stack — proves the TypeScript adapter maps
// correctly onto public.record_task_progress(), not just the raw RPC
// mechanics (already covered by supabase/tests/task-progress.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import {
  recordTaskProgress,
  TASK_PROGRESS_INVALIDATION_KEYS,
} from "./task-progress";
import { supabase } from "@/lib/supabase";

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

async function insertTask() {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      title: "task-progress.ts fixture",
      due_date: "2026-07-01",
      method: "Phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  createdTaskIds.push(data.id);
  return data.id as string;
}

describe("src/lib/data/task-progress.ts", () => {
  test("recordTaskProgress() maps camelCase input to the RPC and back", async () => {
    const taskId = await insertTask();
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const result = await recordTaskProgress({
      taskId,
      nextAction: "Send revised quotation",
      nextActionDate: "2026-08-01",
      note: "Client asked for a revision",
      workflowStatusTarget: "In Progress",
    });

    expect(result.taskId).toBe(taskId);
    expect(result.workflowStatus).toBe("In Progress");
    expect(result.followUpLogId).toBeTruthy();
    expect(result.activityLogId).toBeTruthy();
    expect(typeof result.calendarIncomplete).toBe("boolean");

    const { data: task } = await adminClient
      .from("tasks")
      .select("workflow_status, next_action, next_action_date")
      .eq("id", taskId)
      .single();
    expect(task?.workflow_status).toBe("In Progress");
    expect(task?.next_action).toBe("Send revised quotation");

    await supabase.auth.signOut();
  });

  test("recordTaskProgress() surfaces the database's validation error, unchanged", async () => {
    const taskId = await insertTask();
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    await expect(
      recordTaskProgress({
        taskId,
        nextAction: null,
        nextActionDate: null,
        workflowStatusTarget: "Cancelled",
      }),
    ).rejects.toMatchObject({ code: "23514" });

    await supabase.auth.signOut();
  });

  test("TASK_PROGRESS_INVALIDATION_KEYS names the exact cache keys from spec §7.8", () => {
    expect(TASK_PROGRESS_INVALIDATION_KEYS).toContainEqual(["tasks"]);
    expect(TASK_PROGRESS_INVALIDATION_KEYS).toContainEqual(["dashboard"]);
    expect(TASK_PROGRESS_INVALIDATION_KEYS).toContainEqual(["reports"]);
    expect(TASK_PROGRESS_INVALIDATION_KEYS).toContainEqual(["follow-ups"]);
    expect(TASK_PROGRESS_INVALIDATION_KEYS).toContainEqual(["activity-log"]);
  });
});
