import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
const taskIds: string[] = [];

async function insertTask(input: {
  ownerId: string;
  title: string;
  dueDate?: string;
  workflowStatus?:
    "Open" | "In Progress" | "Waiting External" | "Done" | "Cancelled";
  archived?: boolean;
}) {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: clientId,
      owner_id: input.ownerId,
      title: input.title,
      due_date: input.dueDate ?? jakartaDateDaysFromToday(-10),
      method: "Phone",
      workflow_status: input.workflowStatus ?? "Open",
      archived: input.archived ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;
  taskIds.push(data.id);
  return data.id as string;
}

async function insertTimelineRows(taskId: string, ownerId: string) {
  const { error: followUpError } = await adminClient
    .from("follow_up_logs")
    .insert({
      task_id: taskId,
      client_id: clientId,
      owner_id: ownerId,
      fu_date: "2026-07-27",
      method: "Phone",
      result: "Progress Update",
      next_action: "Next action",
      next_fu_date: "2026-07-28",
      notes: "Progress note",
    })
    .select("id")
    .single();
  if (followUpError) throw followUpError;

  const { error: activityError } = await adminClient
    .from("activity_log")
    .insert({
      kind: "task_progress",
      owner_id: ownerId,
      actor_id: ownerId,
      client_id: clientId,
      task_id: taskId,
      title: "Progress dicatat",
      detail: "Progress note",
    })
    .select("id")
    .single();
  if (activityError) throw activityError;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;
  clientId = anyClient.id;
});

afterAll(async () => {
  if (taskIds.length > 0) {
    await adminClient.from("follow_up_logs").delete().in("task_id", taskIds);
    await adminClient.from("activity_log").delete().in("task_id", taskIds);
    await adminClient.from("tasks").delete().in("id", taskIds);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("Executive task exception RLS", () => {
  test("Executive sees only active escalated Manager-owned task detail", async () => {
    const managerEscalated = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager escalated visible",
    });
    const managerPreThreshold = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager overdue hidden",
      dueDate: jakartaDateDaysFromToday(-1),
    });
    const salesEscalated = await insertTask({
      ownerId: fixtures.sales.id,
      title: "sales escalated hidden",
    });
    const managerDone = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager done hidden",
      workflowStatus: "Done",
    });
    const managerArchived = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager archived hidden",
      archived: true,
    });

    const client = await signInAs(fixtures.executive);
    const { data, error } = await client
      .from("tasks")
      .select("id, title")
      .in("id", [
        managerEscalated,
        managerPreThreshold,
        salesEscalated,
        managerDone,
        managerArchived,
      ]);
    if (error) throw error;

    expect(data?.map((row) => row.id)).toEqual([managerEscalated]);
  });

  test("Executive sees timeline rows only for qualifying Manager exceptions", async () => {
    const visibleTask = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager exception timeline visible",
    });
    const hiddenTask = await insertTask({
      ownerId: fixtures.sales.id,
      title: "sales exception timeline hidden",
    });
    await insertTimelineRows(visibleTask, fixtures.manager.id);
    await insertTimelineRows(hiddenTask, fixtures.sales.id);

    const client = await signInAs(fixtures.executive);
    const followUps = await client
      .from("follow_up_logs")
      .select("task_id")
      .in("task_id", [visibleTask, hiddenTask]);
    if (followUps.error) throw followUps.error;
    expect(followUps.data?.map((row) => row.task_id)).toEqual([visibleTask]);

    const activity = await client
      .from("activity_log")
      .select("task_id")
      .in("task_id", [visibleTask, hiddenTask]);
    if (activity.error) throw activity.error;
    expect(activity.data?.map((row) => row.task_id)).toEqual([visibleTask]);
  });

  test("Executive cannot create, update, archive, cancel, or record progress", async () => {
    const taskId = await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager exception read only",
    });
    const client = await signInAs(fixtures.executive);

    const createAttempt = await client.from("tasks").insert({
      client_id: clientId,
      owner_id: fixtures.manager.id,
      title: "executive create forbidden",
      due_date: jakartaDateDaysFromToday(-10),
      method: "Phone",
    });
    expect(createAttempt.error).not.toBeNull();

    const updateAttempt = await client
      .from("tasks")
      .update({ title: "executive update forbidden" })
      .eq("id", taskId)
      .select("id");
    if (updateAttempt.error) throw updateAttempt.error;
    expect(updateAttempt.data).toEqual([]);

    const archiveAttempt = await client
      .from("tasks")
      .update({ archived: true })
      .eq("id", taskId)
      .select("id");
    if (archiveAttempt.error) throw archiveAttempt.error;
    expect(archiveAttempt.data).toEqual([]);

    const cancelAttempt = await client.rpc("record_task_progress", {
      p_task_id: taskId,
      p_next_action: null,
      p_next_action_date: null,
      p_workflow_status_target: "Cancelled",
      p_cancellation_reason: "Executive cannot cancel",
    });
    expect(cancelAttempt.error).not.toBeNull();
  });

  test("aggregate metrics are company-wide but do not expose row detail", async () => {
    await insertTask({
      ownerId: fixtures.manager.id,
      title: "manager aggregate row",
    });
    await insertTask({
      ownerId: fixtures.sales.id,
      title: "sales aggregate row",
    });

    const executiveClient = await signInAs(fixtures.executive);
    const { data, error } = await executiveClient.rpc(
      "task_control_loop_metrics",
    );
    if (error) throw error;
    const metrics = data![0];
    expect(metrics.total_tasks).toBeGreaterThanOrEqual(2);
    expect(metrics.escalated_tasks).toBeGreaterThanOrEqual(2);
    expect(Object.keys(metrics)).not.toContain("task_id");
    expect(Object.keys(metrics)).not.toContain("owner_id");
    expect(Object.keys(metrics)).not.toContain("title");

    const salesClient = await signInAs(fixtures.sales);
    const forbidden = await salesClient.rpc("task_control_loop_metrics");
    expect(forbidden.error?.code).toBe("42501");
  });

  test("Super Admin keeps correction visibility and write support without exception membership", async () => {
    const salesTask = await insertTask({
      ownerId: fixtures.sales.id,
      title: "sales correction remains supported",
    });
    const client = await signInAs(fixtures.super_admin);

    const visible = await client
      .from("tasks")
      .select("id")
      .eq("id", salesTask)
      .single();
    if (visible.error) throw visible.error;
    expect(visible.data.id).toBe(salesTask);

    const progress = await client.rpc("record_task_progress", {
      p_task_id: salesTask,
      p_next_action: "Super Admin correction",
      p_next_action_date: "2026-08-01",
    });
    if (progress.error) throw progress.error;

    const { data: task } = await adminClient
      .from("tasks")
      .select("owner_id")
      .eq("id", salesTask)
      .single();
    expect(task?.owner_id).toBe(fixtures.sales.id);
  });
});
