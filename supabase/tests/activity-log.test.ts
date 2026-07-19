import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let logIds: { own: string; other: string };

const ADMINISTRATIVE_KINDS = [
  "team_member_created",
  "team_member_profile_updated",
  "team_member_role_changed",
  "team_member_deactivated",
  "team_member_reactivated",
  "team_member_ownership_transferred",
  "team_member_deleted",
] as const;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data: own, error: ownError } = await adminClient
    .from("activity_log")
    .insert({
      kind: "client_status_change",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.sales.id,
      title: "Status diubah ke Active",
    })
    .select("id")
    .single();
  if (ownError) throw ownError;

  const { data: other, error: otherError } = await adminClient
    .from("activity_log")
    .insert({
      kind: "client_status_change",
      owner_id: "22222222-2222-2222-2222-222222222222",
      actor_id: "22222222-2222-2222-2222-222222222222",
      title: "Status diubah ke Prospect",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;

  logIds = { own: own.id, other: other.id };
});

afterAll(async () => {
  await adminClient
    .from("activity_log")
    .delete()
    .in("id", [logIds.own, logIds.other]);
  await deleteRoleFixtureUsers(fixtures);
});

describe("activity_log RLS", () => {
  test("sales role sees only activity where they are the owner", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("activity_log").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(logIds.own);
    expect(ids).not.toContain(logIds.other);
  });

  test("manager role sees every activity entry", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("activity_log").select("id");
    if (error) throw error;
    const ids = data!.map((row) => row.id);
    expect(ids).toContain(logIds.own);
    expect(ids).toContain(logIds.other);
  });

  test("executive role sees every activity entry but cannot insert", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("activity_log").select("id");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(2);

    const { error: insertError } = await client.from("activity_log").insert({
      kind: "client_status_change",
      owner_id: fixtures.executive.id,
      actor_id: fixtures.executive.id,
      title: "Should be rejected",
    });
    expect(insertError).not.toBeNull();
  });

  test("sales role can only insert activity where they are the owner", async () => {
    const client = await signInAs(fixtures.sales);

    const { error: ownError } = await client.from("activity_log").insert({
      kind: "client_status_change",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.sales.id,
      title: "Sales logging their own activity",
    });
    expect(ownError).toBeNull();

    const { error: otherError } = await client.from("activity_log").insert({
      kind: "client_status_change",
      owner_id: fixtures.manager.id,
      actor_id: fixtures.sales.id,
      title: "Sales should not log activity for someone else's entity",
    });
    expect(otherError).not.toBeNull();

    await adminClient
      .from("activity_log")
      .delete()
      .eq("owner_id", fixtures.sales.id)
      .neq("id", logIds.own);
  });

  test("manager role can insert activity for any owner", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client
      .from("activity_log")
      .insert({
        kind: "client_status_change",
        owner_id: fixtures.sales.id,
        actor_id: fixtures.manager.id,
        title: "Manager correcting a client owned by sales",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data) {
      await adminClient.from("activity_log").delete().eq("id", data.id);
    }
  });

  test("Sales, Manager, Executive, and Super Admin cannot update or delete an activity_log entry", async () => {
    for (const role of [
      "sales",
      "manager",
      "executive",
      "super_admin",
    ] as const) {
      const client = await signInAs(fixtures[role]);

      const { data: updated, error: updateError } = await client
        .from("activity_log")
        .update({ title: `Tampered by ${role}` })
        .eq("id", logIds.own)
        .select("id");
      if (updateError) {
        expect(updateError).not.toBeNull();
      } else {
        expect(updated).toHaveLength(0);
      }

      const { data: deleted, error: deleteError } = await client
        .from("activity_log")
        .delete()
        .eq("id", logIds.own)
        .select("id");
      if (deleteError) {
        expect(deleteError).not.toBeNull();
      } else {
        expect(deleted).toHaveLength(0);
      }
    }

    const { data: stillThere } = await adminClient
      .from("activity_log")
      .select("id")
      .eq("id", logIds.own)
      .single();
    expect(stillThere?.id).toBe(logIds.own);
  });

  test("all seven administrative event kinds are accepted with a non-empty reason", async () => {
    const ids: string[] = [];
    try {
      for (const kind of ADMINISTRATIVE_KINDS) {
        const { data, error } = await adminClient
          .from("activity_log")
          .insert({
            kind,
            owner_id: fixtures.sales.id,
            actor_id: fixtures.super_admin.id,
            target_profile_id: fixtures.manager.id,
            target_profile_snapshot: {
              name: "Test Manager",
              email: fixtures.manager.email,
              role: "manager",
            },
            administrative_reason: `Test contract for ${kind}`,
            title: kind,
          })
          .select("id")
          .single();
        expect(error).toBeNull();
        if (data) ids.push(data.id);
      }
    } finally {
      if (ids.length > 0) {
        await adminClient.from("activity_log").delete().in("id", ids);
      }
    }
  });

  test("an authenticated website role cannot insert administrative fields or event kinds through the Data API", async () => {
    const client = await signInAs(fixtures.sales);

    const { data, error } = await client
      .from("activity_log")
      .insert({
        kind: "team_member_created",
        owner_id: fixtures.sales.id,
        actor_id: fixtures.sales.id,
        target_profile_id: fixtures.manager.id,
        target_profile_snapshot: {
          name: "Test Manager",
          email: fixtures.manager.email,
          role: "manager",
        },
        administrative_reason: "Website callers cannot write protected fields",
        title: "team_member_created",
      })
      .select("id");

    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  test("every administrative event kind rejects a missing or blank reason", async () => {
    for (const kind of ADMINISTRATIVE_KINDS) {
      for (const administrativeReason of [null, "", "   "]) {
        const { error } = await adminClient.from("activity_log").insert({
          kind,
          owner_id: fixtures.sales.id,
          actor_id: fixtures.super_admin.id,
          target_profile_snapshot: {
            name: "Test Sales",
            email: fixtures.sales.email,
            role: "sales",
          },
          administrative_reason: administrativeReason,
          title: `Missing reason for ${kind}`,
        });
        expect(error?.code).toBe("23514");
        expect(error?.message).toContain(
          "activity_log_administrative_reason_required",
        );
      }
    }
  });

  test("target snapshots reject every top-level key outside name, email, and role", async () => {
    for (const unsafeKey of [
      "password",
      "access_token",
      "refresh_token",
      "service_role_key",
      "api_key",
    ]) {
      const { error } = await adminClient.from("activity_log").insert({
        kind: "team_member_role_changed",
        owner_id: fixtures.sales.id,
        actor_id: fixtures.super_admin.id,
        target_profile_snapshot: {
          name: "Unsafe snapshot",
          email: "unsafe@example.com",
          role: "sales",
          [unsafeKey]: "must-not-be-stored",
        },
        administrative_reason: "Prove snapshot allowlist",
        title: `Unsafe snapshot key: ${unsafeKey}`,
      });
      expect(error?.code).toBe("23514");
      expect(error?.message).toContain(
        "activity_log_target_profile_snapshot_safe",
      );
    }
  });

  test("target snapshots reject role values outside the immutable four-role model", async () => {
    const { data, error } = await adminClient
      .from("activity_log")
      .insert({
        kind: "team_member_role_changed",
        owner_id: fixtures.sales.id,
        actor_id: fixtures.super_admin.id,
        target_profile_snapshot: {
          name: "Invalid role snapshot",
          email: "invalid-role@example.com",
          role: "administrator",
        },
        administrative_reason: "Prove four-role snapshot boundary",
        title: "Invalid target role snapshot",
      })
      .select("id")
      .single();
    if (data) {
      await adminClient.from("activity_log").delete().eq("id", data.id);
    }
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(
      "activity_log_target_profile_snapshot_safe",
    );
  });

  test("safe target snapshot survives eligible target profile deletion", async () => {
    const email = `unused-${crypto.randomUUID()}@example.com`;
    const password = "test-password-123";
    let targetId: string | undefined;
    let activityId: string | undefined;

    try {
      const { data: created, error: createError } =
        await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      if (createError) throw createError;
      targetId = created.user.id;

      const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
          id: targetId,
          role: "sales",
          account_status: "active",
          name: "Unused Test User",
          initials: "UT",
          email,
        });
      if (profileError) throw profileError;

      const snapshot = {
        name: "Unused Test User",
        email: "unused@example.com",
        role: "sales",
      };
      const { data: activity, error: activityError } = await adminClient
        .from("activity_log")
        .insert({
          kind: "team_member_deleted",
          owner_id: fixtures.sales.id,
          actor_id: fixtures.super_admin.id,
          target_profile_id: targetId,
          target_profile_snapshot: snapshot,
          administrative_reason: "Unused disposable account",
          title: "Anggota tim dihapus permanen",
        })
        .select("id")
        .single();
      if (activityError) throw activityError;
      activityId = activity.id;

      const { error: deleteError } =
        await adminClient.auth.admin.deleteUser(targetId);
      if (deleteError) throw deleteError;
      targetId = undefined;

      const { data: persisted, error: persistedError } = await adminClient
        .from("activity_log")
        .select(
          "target_profile_id, target_profile_snapshot, administrative_reason",
        )
        .eq("id", activityId)
        .single();
      if (persistedError) throw persistedError;

      expect(persisted.target_profile_id).toBeNull();
      expect(persisted.target_profile_snapshot).toEqual(snapshot);
      expect(Object.keys(persisted.target_profile_snapshot).sort()).toEqual([
        "email",
        "name",
        "role",
      ]);
      expect(persisted.administrative_reason).toBe("Unused disposable account");
    } finally {
      if (activityId) {
        await adminClient.from("activity_log").delete().eq("id", activityId);
      }
      if (targetId) {
        await adminClient.auth.admin.deleteUser(targetId);
      }
    }
  });
});
