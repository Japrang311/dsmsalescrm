// Exercises the real src/lib/data/clients.ts module end-to-end against the
// local Supabase stack — proves the module itself works, not just the raw
// RLS mechanics (already covered by supabase/tests/clients.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import {
  listClients,
  getClientById,
  listOwners,
  createClient,
  listSalesTeamProfiles,
  clientDataErrorMessage,
  listClientRowsPage,
} from "./clients";

// This module reads a module-level Supabase client, so we point it at
// whichever fixture user is currently signed in by swapping the global
// auth session — simplest way to test without restructuring the module to
// accept an injected client (not worth the extra abstraction for now).
import { supabase } from "@/lib/supabase";

let fixtures: RoleFixtureUsers;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
});

afterAll(async () => {
  await deleteRoleFixtureUsers(fixtures);
});

describe("src/lib/data/clients.ts", () => {
  test("listClients() returns only the signed-in sales user's own clients", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const clients = await listClients();
    const { data: expected } = await adminClient
      .from("clients")
      .select("id")
      .eq("owner_id", session.user.id);

    expect(clients.length).toBe(expected!.length);
    expect(clients.every((c) => c.ownerId === session.user.id)).toBe(true);

    await supabase.auth.signOut();
  });

  test("getClientById() and listOwners() return real, joinable data", async () => {
    const fixtureClient = await signInAs(fixtures.manager);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const owners = await listOwners();
    const anyClient = (await listClients())[0];
    expect(anyClient).toBeDefined();

    const fetched = await getClientById(anyClient.id);
    expect(fetched?.id).toBe(anyClient.id);
    expect(owners[anyClient.ownerId]).toBeDefined();

    await supabase.auth.signOut();
  });

  test("listClientRowsPage() pages clients with a stable cursor and no overlap", async () => {
    const fixtureClient = await signInAs(fixtures.manager);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const firstPage = await listClientRowsPage({ page: { pageSize: 2 } });
    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.totalCount).toBeGreaterThanOrEqual(2);

    if (firstPage.nextCursor) {
      const secondPage = await listClientRowsPage({
        page: { pageSize: 2, cursor: firstPage.nextCursor },
      });
      const firstIds = new Set(firstPage.rows.map((row) => row.client.id));
      expect(secondPage.rows.every((row) => !firstIds.has(row.client.id))).toBe(
        true,
      );
    }

    await supabase.auth.signOut();
  });

  test("createClient() persists a real client row", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const clientName = `Data-layer fixture client ${crypto.randomUUID()}`;
    const created = await createClient({
      name: clientName,
      source: "Referral",
      ownerId: session.user.id,
    });
    expect(created.name).toBe(clientName);
    expect(created.status).toBe("Prospect");

    const { data: fromDb } = await adminClient
      .from("clients")
      .select("name, owner_id")
      .eq("id", created.id)
      .single();
    expect(fromDb?.name).toBe(clientName);
    expect(fromDb?.owner_id).toBe(session.user.id);

    await adminClient.from("clients").delete().eq("id", created.id);
    await supabase.auth.signOut();
  });

  test("clientDataErrorMessage() explains duplicate client-name failures", () => {
    expect(
      clientDataErrorMessage({
        message: "Client name already exists: PT. Global Nine Indonesia",
        details: "CLIENT_NAME_DUPLICATE",
      }),
    ).toBe(
      "Nama client sudah ada. Gunakan record client yang sudah tersedia, jangan buat duplikat.",
    );
  });

  test("clientDataErrorMessage() explains native unique-index race failures", () => {
    expect(
      clientDataErrorMessage({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "clients_name_normalized_unique"',
        details:
          "Key (name_dedupe_key)=(ptglobalnineindonesia) already exists.",
      }),
    ).toBe(
      "Nama client sudah ada. Gunakan record client yang sudah tersedia, jangan buat duplikat.",
    );
  });

  // Regression for Phase 12 Task 6: Super Admin is not a Sales owner and
  // must never appear in the "sales team" collection that feeds owner
  // filters, target assignment, and dashboard/report performance tables.
  // `fixtures.super_admin` (created in beforeAll via ROLE_FIXTURES) proves
  // a real super_admin profile row exists and is still excluded.
  test("listSalesTeamProfiles() excludes Super Admin even though a Super Admin profile exists", async () => {
    const fixtureClient = await signInAs(fixtures.manager);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const salesTeam = await listSalesTeamProfiles();

    expect(salesTeam.some((m) => m.id === fixtures.super_admin.id)).toBe(false);
    expect(salesTeam.some((m) => m.id === fixtures.sales.id)).toBe(true);

    await supabase.auth.signOut();
  });
});
