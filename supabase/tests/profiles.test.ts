import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers | undefined;

function getFixtures(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Role fixtures were not created");
  return fixtures;
}

async function reactivateProfile(profileId: string): Promise<void> {
  const { error } = await adminClient
    .from("profiles")
    .update({
      account_status: "active",
      status_change_reason: "test reset",
    })
    .eq("id", profileId);
  if (error) throw error;
}

async function withProfileReactivation<T>(
  profileId: string,
  operation: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (operationError) {
    try {
      await reactivateProfile(profileId);
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "Profile assertion failed and test reactivation was incomplete",
      );
    }
    throw operationError;
  }
  await reactivateProfile(profileId);
  return result;
}

async function withFixtureCleanup<T>(
  users: Partial<RoleFixtureUsers>,
  operation: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (operationError) {
    try {
      await deleteRoleFixtureUsers(users);
    } catch (cleanupError) {
      throw new AggregateError(
        [operationError, cleanupError],
        "Profile assertion failed and Auth cleanup was incomplete",
      );
    }
    throw operationError;
  }
  await deleteRoleFixtureUsers(users);
  return result;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  await deleteRoleFixtureUsers(fixtures);
});

describe("profiles RLS", () => {
  test("sales role sees only their own profile", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client.from("profiles").select("*");
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].role).toBe("sales");
  });

  test("manager role sees every profile", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client.from("profiles").select("*");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(4);
  });

  test("executive role sees every profile but cannot write", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client.from("profiles").select("*");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(4);

    const { error: updateError } = await client
      .from("profiles")
      .update({ role: "manager" })
      .eq("id", fixtures.executive.id);
    expect(updateError).not.toBeNull();
  });

  test("sales role cannot change their own role", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.sales);
    const { error } = await client
      .from("profiles")
      .update({ role: "manager" })
      .eq("id", fixtures.sales.id);
    expect(error).not.toBeNull();
  });

  test("super admin reads every profile but cannot update through Data API", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.super_admin);
    const { data, error } = await client.from("profiles").select("id, role");
    if (error) throw error;
    expect(data!.length).toBeGreaterThanOrEqual(4);

    const { error: updateError } = await client
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", fixtures.sales.id);
    expect(updateError).not.toBeNull();
  });

  test("inactive token resolves no role and cannot read profiles", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.sales);
    const { error: deactivateError } = await adminClient
      .from("profiles")
      .update({ account_status: "inactive", status_change_reason: "test" })
      .eq("id", fixtures.sales.id);
    if (deactivateError) throw deactivateError;

    await withProfileReactivation(fixtures.sales.id, async () => {
      const { data: role, error: roleError } =
        await client.rpc("current_user_role");
      if (roleError) throw roleError;
      expect(role).toBeNull();

      const { data, error } = await client.from("profiles").select("id");
      if (error) throw error;
      expect(data).toEqual([]);
    });
  });

  test("active privileged caller sees an inactive target profile", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.super_admin);
    const { error: deactivateError } = await adminClient
      .from("profiles")
      .update({ account_status: "inactive", status_change_reason: "test" })
      .eq("id", fixtures.sales.id);
    if (deactivateError) throw deactivateError;

    await withProfileReactivation(fixtures.sales.id, async () => {
      const { data, error } = await client
        .from("profiles")
        .select("id, account_status")
        .eq("id", fixtures.sales.id);
      if (error) throw error;
      expect(data).toEqual([
        { id: fixtures.sales.id, account_status: "inactive" },
      ]);
    });
  });

  test("inactive privileged caller resolves no role and sees no roster", async () => {
    const fixtures = getFixtures();
    const client = await signInAs(fixtures.manager);
    const { error: deactivateError } = await adminClient
      .from("profiles")
      .update({ account_status: "inactive", status_change_reason: "test" })
      .eq("id", fixtures.manager.id);
    if (deactivateError) throw deactivateError;

    await withProfileReactivation(fixtures.manager.id, async () => {
      const { data: role, error: roleError } =
        await client.rpc("current_user_role");
      if (roleError) throw roleError;
      expect(role).toBeNull();

      const { data, error } = await client.from("profiles").select("id");
      if (error) throw error;
      expect(data).toEqual([]);
    });
  });

  test("authenticated user without a profile resolves no role and sees no profiles", async () => {
    const email = `missing-profile+${crypto.randomUUID()}@example.com`;
    const password = "test-password-123";
    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createError) throw createError;
    const authOnlyUser = { id: created.user.id, email, password };

    await withFixtureCleanup({ sales: authOnlyUser }, async () => {
      const client = await signInAs(authOnlyUser);
      const { data: role, error: roleError } =
        await client.rpc("current_user_role");
      if (roleError) throw roleError;
      expect(role).toBeNull();

      const { data, error } = await client.from("profiles").select("id");
      if (error) throw error;
      expect(data).toEqual([]);
    });
  });
});
