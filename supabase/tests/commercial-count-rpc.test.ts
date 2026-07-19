import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ROLE_FIXTURES } from "../../tests/fixtures/roles";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers | undefined;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  if (fixtures) {
    await deleteRoleFixtureUsers(fixtures);
  }
});

function getFixtures(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Role fixtures were not created");
  return fixtures;
}

describe("admin_count_active_commercial_items RPC authorization", () => {
  test("manager can call RPC and get commercial item count", async () => {
    const managerClient = await signInAs(getFixtures().manager);
    const { data, error } = await managerClient.rpc(
      "admin_count_active_commercial_items",
      { p_owner_id: getFixtures().manager.id },
    );
    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data).toBeGreaterThanOrEqual(0);
  });

  test("executive can call RPC and get commercial item count", async () => {
    const executiveClient = await signInAs(getFixtures().executive);
    const { data, error } = await executiveClient.rpc(
      "admin_count_active_commercial_items",
      { p_owner_id: getFixtures().executive.id },
    );
    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data).toBeGreaterThanOrEqual(0);
  });

  test("super_admin can call RPC and get commercial item count", async () => {
    const superAdminClient = await signInAs(getFixtures().super_admin);
    const { data, error } = await superAdminClient.rpc(
      "admin_count_active_commercial_items",
      { p_owner_id: getFixtures().super_admin.id },
    );
    expect(error).toBeNull();
    expect(typeof data).toBe("number");
    expect(data).toBeGreaterThanOrEqual(0);
  });

  test("sales role is rejected with INSUFFICIENT_PRIVILEGE", async () => {
    const salesClient = await signInAs(getFixtures().sales);
    const { error } = await salesClient.rpc(
      "admin_count_active_commercial_items",
      { p_owner_id: getFixtures().sales.id },
    );
    expect(error).toBeDefined();
    // PostgreSQL exception raised in plpgsql returns code P0001
    expect(error?.code).toBe("P0001");
    expect(error?.message).toContain("INSUFFICIENT_PRIVILEGE");
  });

  test("unauthenticated client cannot call RPC", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { API_URL } = await import("./helpers");
    const ANON_KEY =
      process.env.SUPABASE_ANON_KEY ??
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
    const unauthClient = createClient(API_URL, ANON_KEY);
    const { error } = await unauthClient.rpc(
      "admin_count_active_commercial_items",
      { p_owner_id: getFixtures().manager.id },
    );
    expect(error).toBeDefined();
    // Unauthenticated gets permission denied (42501) or active role required (P0001)
    expect(["P0001", "42501"]).toContain(error?.code ?? "");
    expect(
      error?.message?.includes("ACTIVE_PRIVILEGED_ROLE_REQUIRED") ||
        error?.message?.includes("permission denied"),
    ).toBe(true);
  });
});
