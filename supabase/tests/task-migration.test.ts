import { SQL } from "bun";
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

async function insertTask(ownerId: string): Promise<string> {
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;

  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: client.id,
      owner_id: ownerId,
      title: "Task migration cutover fixture",
      due_date: "2026-07-27",
      method: "Phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("Sales Task Control Loop Task 16 cutover", () => {
  test("migration audit passes with zero unexplained mismatches", async () => {
    const [data] = await db`
      select
        passed,
        task_count,
        deterministic_count,
        review_required_count,
        owner_mismatch_count,
        archive_mismatch_count,
        timeline_orphan_count
      from private.task_control_loop_migration_audit
      order by generated_at desc
      limit 1
    `;

    expect(data.passed).toBe(true);
    expect(data.task_count).toBe(data.deterministic_count);
    expect(Number(data.review_required_count)).toBe(0);
    expect(Number(data.owner_mismatch_count)).toBe(0);
    expect(Number(data.archive_mismatch_count)).toBe(0);
    expect(Number(data.timeline_orphan_count)).toBe(0);
  });

  test("legacy tasks.status column and task_status enum are retired", async () => {
    const columns = await db`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'status'
    `;
    expect(columns).toHaveLength(0);

    const enumRows = await db`
      select 1
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'task_status'
    `;
    expect(enumRows).toHaveLength(0);
  });

  test("record_task_progress still works after legacy dual-write removal", async () => {
    const fixtures = await createRoleFixtureUsers();
    let taskId: string | undefined;
    try {
      taskId = await insertTask(fixtures.sales.id);
      const client = await signInAs(fixtures.sales);
      const { data, error } = await client.rpc("record_task_progress", {
        p_task_id: taskId,
        p_next_action: null,
        p_next_action_date: null,
        p_workflow_status_target: "Done",
      });
      if (error) throw error;
      expect(data?.[0]?.workflow_status).toBe("Done");

      const { data: task, error: taskError } = await adminClient
        .from("tasks")
        .select("workflow_status")
        .eq("id", taskId)
        .single();
      if (taskError) throw taskError;
      expect(task.workflow_status).toBe("Done");
    } finally {
      if (taskId) {
        await adminClient.from("activity_log").delete().eq("task_id", taskId);
        await adminClient.from("follow_up_logs").delete().eq("task_id", taskId);
        await adminClient.from("tasks").delete().eq("id", taskId);
      }
      await deleteRoleFixtureUsers(fixtures);
    }
  });
});
