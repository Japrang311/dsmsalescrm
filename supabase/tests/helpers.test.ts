import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleFixture } from "../../tests/fixtures/roles";
import {
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  type RoleFixtureUsers,
} from "./helpers";

const fixtureDefinitions: readonly RoleFixture[] = [
  {
    email: "first@example.com",
    password: "test-password-123",
    role: "sales",
    name: "First",
    initials: "F",
  },
  {
    email: "second@example.com",
    password: "test-password-123",
    role: "manager",
    name: "Second",
    initials: "S",
  },
];

describe("role fixture lifecycle", () => {
  test("rolls back every created Auth user after partial setup failure", async () => {
    const deletedIds: string[] = [];
    let createCount = 0;
    let insertCount = 0;
    const setupFailure = new Error("second profile insert failed");
    const client = {
      auth: {
        admin: {
          createUser: async () => {
            createCount += 1;
            return {
              data: { user: { id: `auth-user-${createCount}` } },
              error: null,
            };
          },
          deleteUser: async (id: string) => {
            deletedIds.push(id);
            return { data: null, error: null };
          },
        },
      },
      from: () => ({
        insert: async () => {
          insertCount += 1;
          return { error: insertCount === 2 ? setupFailure : null };
        },
      }),
    } as unknown as SupabaseClient;

    await expect(
      createRoleFixtureUsers({ client, roleFixtures: fixtureDefinitions }),
    ).rejects.toBe(setupFailure);
    expect(deletedIds).toEqual(["auth-user-2", "auth-user-1"]);
  });

  test("setup failure preserves the primary error when rollback also fails", async () => {
    const setupFailure = new Error("profile insert failed");
    const cleanupFailure = new Error("Auth deletion failed");
    const client = {
      auth: {
        admin: {
          createUser: async () => ({
            data: { user: { id: "auth-user-1" } },
            error: null,
          }),
          deleteUser: async () => ({ data: null, error: cleanupFailure }),
        },
      },
      from: () => ({
        insert: async () => ({ error: setupFailure }),
      }),
    } as unknown as SupabaseClient;

    let caught: unknown;
    try {
      await createRoleFixtureUsers({
        client,
        roleFixtures: fixtureDefinitions.slice(0, 1),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      setupFailure,
      cleanupFailure,
    ]);
  });

  test("teardown accepts absent fixtures", async () => {
    await expect(
      deleteRoleFixtureUsers(undefined as unknown as RoleFixtureUsers),
    ).resolves.toBeUndefined();
  });

  test("teardown attempts every partial fixture and surfaces all cleanup failures", async () => {
    const deletedIds: string[] = [];
    const firstFailure = new Error("first cleanup failed");
    const secondFailure = new Error("second cleanup failed");
    const client = {
      auth: {
        admin: {
          deleteUser: async (id: string) => {
            deletedIds.push(id);
            if (id === "sales-id") return { data: null, error: firstFailure };
            throw secondFailure;
          },
        },
      },
    } as unknown as SupabaseClient;
    const partialFixtures = {
      sales: { id: "sales-id", email: "sales@test", password: "password" },
      manager: {
        id: "manager-id",
        email: "manager@test",
        password: "password",
      },
    } satisfies Partial<RoleFixtureUsers>;

    let caught: unknown;
    try {
      await deleteRoleFixtureUsers(partialFixtures, client);
    } catch (error) {
      caught = error;
    }

    expect(deletedIds).toEqual(["sales-id", "manager-id"]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      firstFailure,
      secondFailure,
    ]);
  });
});
