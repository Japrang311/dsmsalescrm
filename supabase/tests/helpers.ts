// Shared setup for RLS tests. These run against the local Supabase stack
// only (bunx supabase start) — never against a real/remote project. The
// keys below are Supabase's well-known local-dev defaults (same for every
// local install, not secret). The URL may only resolve to an approved exact
// loopback origin on port 54321; privileged remote targets always fail closed.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ROLE_FIXTURES, type RoleFixture } from "../../tests/fixtures/roles";
import { requireLocalSupabaseUrl } from "../local-supabase-url";

export const API_URL = requireLocalSupabaseUrl(
  process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
);
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Bypasses RLS entirely (service role) — used only to set up/tear down test
// data, never to test access control itself.
export const adminClient: SupabaseClient = createClient(
  API_URL,
  SERVICE_ROLE_KEY,
);

export type RoleFixtureUser = { id: string; email: string; password: string };
export type RoleFixtureUsers = Record<RoleFixture["role"], RoleFixtureUser>;
type RoleFixtureCreationOptions = {
  client?: SupabaseClient;
  roleFixtures?: readonly RoleFixture[];
};

async function collectAuthDeletionFailures(
  ids: readonly string[],
  client: SupabaseClient,
): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const id of ids) {
    try {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) failures.push(error);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

// Every test file calls this independently, and bun runs test files
// concurrently — using the same fixed emails across files caused them to
// collide (whichever file created the user first "won"; every other file's
// beforeAll failed with "already registered"). Appending a random suffix
// per call makes every test file's fixture users unique, so files can run
// in any order or concurrency without stepping on each other.
export async function createRoleFixtureUsers(
  options: RoleFixtureCreationOptions = {},
): Promise<RoleFixtureUsers> {
  const client = options.client ?? adminClient;
  const roleFixtures = options.roleFixtures ?? ROLE_FIXTURES;
  const suffix = crypto.randomUUID().slice(0, 8);
  const result = {} as RoleFixtureUsers;
  const createdAuthIds: string[] = [];

  try {
    for (const fixture of roleFixtures) {
      const email = fixture.email.replace("@", `+${suffix}@`);
      const { data, error } = await client.auth.admin.createUser({
        email,
        password: fixture.password,
        email_confirm: true,
      });
      if (error) throw error;
      createdAuthIds.push(data.user.id);
      result[fixture.role] = {
        id: data.user.id,
        email,
        password: fixture.password,
      };

      const { error: profileError } = await client.from("profiles").insert({
        id: data.user.id,
        role: fixture.role,
        account_status: "active",
        name: fixture.name,
        initials: fixture.initials,
        email,
      });
      if (profileError) throw profileError;
    }
  } catch (setupError) {
    const cleanupFailures = await collectAuthDeletionFailures(
      createdAuthIds.reverse(),
      client,
    );
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [setupError, ...cleanupFailures],
        "Role fixture setup failed and rollback was incomplete",
      );
    }
    throw setupError;
  }
  return result;
}

export async function deleteRoleFixtureUsers(
  users?: Partial<RoleFixtureUsers>,
  client: SupabaseClient = adminClient,
): Promise<void> {
  if (!users) return;
  const ids = Object.values(users).flatMap((user) => (user ? [user.id] : []));
  const failures = await collectAuthDeletionFailures(ids, client);
  if (failures.length > 0) {
    throw new AggregateError(failures, "Role fixture cleanup failed");
  }
}

// Returns a client authenticated as the given fixture user — this is what a
// real logged-in Sales/Manager/Executive user's browser session looks
// like, RLS and all.
export async function signInAs(user: RoleFixtureUser): Promise<SupabaseClient> {
  const client = createClient(API_URL, ANON_KEY);
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return client;
}
