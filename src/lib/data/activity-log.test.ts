import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { listActivityLog } from "./activity-log";

const ADMINISTRATIVE_LABELS = {
  team_member_created: "Anggota Tim Dibuat",
  team_member_profile_updated: "Profil Anggota Tim Diperbarui",
  team_member_role_changed: "Role Anggota Tim Diubah",
  team_member_deactivated: "Anggota Tim Dinonaktifkan",
  team_member_reactivated: "Anggota Tim Diaktifkan Kembali",
  team_member_ownership_transferred: "Kepemilikan Anggota Tim Dialihkan",
  team_member_deleted: "Anggota Tim Dihapus Permanen",
} as const;

let fixtures: RoleFixtureUsers;
let activityIds: string[] = [];

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
});

afterAll(async () => {
  await supabase.auth.signOut();
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
