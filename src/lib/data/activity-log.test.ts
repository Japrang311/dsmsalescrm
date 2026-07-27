import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { ROLE_FIXTURES } from "../../../tests/fixtures/roles";
import { supabase } from "@/lib/supabase";
import { listActivityLog, listTaskTimeline } from "./activity-log";
import { recordTaskProgress } from "./task-progress";

const ADMINISTRATIVE_LABELS = {
  team_member_created: "Anggota Tim Dibuat",
  team_member_profile_updated: "Profil Anggota Tim Diperbarui",
  team_member_role_changed: "Role Anggota Tim Diubah",
  team_member_deactivated: "Anggota Tim Dinonaktifkan",
  team_member_reactivated: "Anggota Tim Diaktifkan Kembali",
  team_member_ownership_transferred: "Kepemilikan Anggota Tim Dialihkan",
  team_member_deleted: "Anggota Tim Dihapus Permanen",
} as const;
const SALES_FIXTURE_NAME = ROLE_FIXTURES.find(
  (fixture) => fixture.role === "sales",
)!.name;

let fixtures: RoleFixtureUsers;
let activityIds: string[] = [];
let timelineClientId: string;
const timelineTaskIds: string[] = [];
const timelineFollowUpIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const rows = Object.entries(ADMINISTRATIVE_LABELS).map(([kind]) => ({
    kind,
    owner_id: fixtures.sales.id,
    actor_id: fixtures.super_admin.id,
    target_profile_id: fixtures.manager.id,
    target_profile_snapshot: {
      name: "Test Manager",
      email: fixtures.manager.email,
      role: "manager",
    },
    administrative_reason: `Alasan ${kind}`,
    title: kind,
  }));
  const { data, error } = await adminClient
    .from("activity_log")
    .insert(rows)
    .select("id");
  if (error) throw error;
  activityIds = (data ?? []).map((row) => row.id);

  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;
  timelineClientId = anyClient.id;
});

afterAll(async () => {
  await supabase.auth.signOut();
  if (timelineTaskIds.length > 0) {
    await adminClient
      .from("follow_up_logs")
      .delete()
      .in("task_id", timelineTaskIds);
    await adminClient
      .from("activity_log")
      .delete()
      .in("task_id", timelineTaskIds);
    await adminClient.from("tasks").delete().in("id", timelineTaskIds);
  }
  if (timelineFollowUpIds.length > 0) {
    await adminClient
      .from("follow_up_logs")
      .delete()
      .in("id", timelineFollowUpIds);
  }
  if (activityIds.length > 0) {
    await adminClient.from("activity_log").delete().in("id", activityIds);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("activity log administrative event mapping", () => {
  test("maps all Indonesian labels and keeps actor, target snapshot, and reason separate", async () => {
    const client = await signInAs(fixtures.manager);
    const session = (await client.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const entries = await listActivityLog();
    const administrativeEntries = entries.filter((entry) =>
      activityIds.includes(entry.id),
    );

    expect(administrativeEntries).toHaveLength(7);
    for (const [kind, label] of Object.entries(ADMINISTRATIVE_LABELS)) {
      const entry = administrativeEntries.find((item) => item.kind === kind);
      expect(entry?.kindLabel).toBe(label);
      expect(entry?.actorId).toBe(fixtures.super_admin.id);
      expect(entry?.targetProfileId).toBe(fixtures.manager.id);
      expect(entry?.targetProfileSnapshot).toEqual({
        name: "Test Manager",
        email: fixtures.manager.email,
        role: "manager",
      });
      expect(entry?.administrativeReason).toBe(`Alasan ${kind}`);
    }
  });
});

async function insertTimelineTask() {
  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      client_id: timelineClientId,
      owner_id: fixtures.sales.id,
      title: "timeline fixture task",
      due_date: "2026-07-30",
      method: "Phone",
    })
    .select("id")
    .single();
  if (error) throw error;
  timelineTaskIds.push(data.id);
  return data.id as string;
}

describe("task timeline", () => {
  test("merges historical follow-ups and audit rows while suppressing RPC duplicates", async () => {
    const taskId = await insertTimelineTask();
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const { data: historicalFollowUp, error: followUpError } = await adminClient
      .from("follow_up_logs")
      .insert({
        task_id: taskId,
        client_id: timelineClientId,
        owner_id: fixtures.sales.id,
        fu_date: "2026-07-27",
        method: "Phone",
        result: "Follow-up Later",
        next_action: "Call again",
        next_fu_date: "2026-07-28",
        notes: "Historical follow-up note",
      })
      .select("id")
      .single();
    if (followUpError) throw followUpError;
    timelineFollowUpIds.push(historicalFollowUp.id);

    const { data: auditOnly, error: auditError } = await adminClient
      .from("activity_log")
      .insert({
        kind: "task_status_change",
        owner_id: fixtures.sales.id,
        actor_id: fixtures.manager.id,
        client_id: timelineClientId,
        task_id: taskId,
        title: "Audit-only correction",
        detail: "Due date corrected",
      })
      .select("id")
      .single();
    if (auditError) throw auditError;
    activityIds.push(auditOnly.id);

    const progress = await recordTaskProgress({
      taskId,
      workflowStatusTarget: "In Progress",
      nextAction: "Send recap",
      nextActionDate: "2026-07-29",
      note: "Progress note",
    });

    const timeline = await listTaskTimeline(taskId);

    expect(
      timeline.some(
        (entry) => entry.id === `follow-up-${historicalFollowUp.id}`,
      ),
    ).toBe(true);
    expect(
      timeline.some((entry) => entry.id === `activity-${auditOnly.id}`),
    ).toBe(true);
    expect(
      timeline.filter((entry) => entry.id.includes(progress.followUpLogId)),
    ).toHaveLength(1);
    expect(
      timeline.some(
        (entry) => entry.id === `activity-${progress.activityLogId}`,
      ),
    ).toBe(false);
    expect(
      timeline.find(
        (entry) => entry.id === `follow-up-${progress.followUpLogId}`,
      )?.actorName,
    ).toBe(SALES_FIXTURE_NAME);

    await supabase.auth.signOut();
  });
});
