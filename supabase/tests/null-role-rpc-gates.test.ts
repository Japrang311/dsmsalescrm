// Regression tests for the NULL-role fail-open in SECURITY DEFINER role gates
// (20260728091500_fix_null_role_fail_open_gates.sql).
//
// public.current_user_role() returns NULL for a caller who is deactivated or
// has no public.profiles row. `null not in (...)` evaluates to NULL, and
// `if NULL then` is treated as false, so every gate written as
// `if v_role not in (...)` failed open. In the SECURITY DEFINER functions that
// meant the body ran with owner privileges and bypassed RLS entirely.
//
// These tests must FAIL against the pre-fix schema and pass after it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  API_URL,
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const items = [
  {
    productName: "Null Role Probe",
    description: "regression fixture",
    qty: 1,
    uom: "Pcs",
    unitPrice: 100_000,
  },
];

let fixtures: RoleFixtureUsers | undefined;
let clientId: string | undefined;
let quotationId: string | undefined;

// Auth users deliberately created WITHOUT (or with a deactivated) profile row,
// so current_user_role() returns NULL for them.
const nullRoleAuthIds: string[] = [];
let noProfileClient: SupabaseClient | undefined;
let deactivatedClient: SupabaseClient | undefined;

function users(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Role fixtures unavailable");
  return fixtures;
}

// Both variants a NULL role can arrive through in production: an auth user with
// no profiles row at all (e.g. self-signup, which config.toml leaves enabled),
// and a deactivated employee still holding an unexpired access token.
async function createNullRoleClient(
  withDeactivatedProfile: boolean,
): Promise<SupabaseClient> {
  const email = `null-role+${crypto.randomUUID().slice(0, 8)}@local.dsm.test`;
  const password = `probe-${crypto.randomUUID()}`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  nullRoleAuthIds.push(data.user.id);

  if (withDeactivatedProfile) {
    const { error: profileError } = await adminClient.from("profiles").insert({
      id: data.user.id,
      role: "sales",
      account_status: "inactive",
      name: "Deactivated Probe",
      initials: "DP",
      email,
    });
    if (profileError) throw profileError;
  }

  const client = createClient(API_URL, ANON_KEY);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  return client;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();

  const { data, error } = await adminClient
    .from("clients")
    .insert({
      name: `Null Role Client ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: users().sales.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  clientId = data.id;

  // A real quotation owned by the sales fixture, so revise_quotation has a
  // current revision to target.
  const salesClient = await signInAs(users().sales);
  const quotation = await salesClient.rpc("create_quotation", {
    p_client_id: clientId,
    p_document_date: "2095-07-28",
    p_client_address: null,
    p_stage: "Quotes Sent",
    p_so_number: null,
    p_note: null,
    p_items: items,
    p_next_action: "Follow up",
    p_next_action_date: "2095-08-04",
  });
  if (quotation.error) throw quotation.error;
  quotationId = quotation.data.id;

  noProfileClient = await createNullRoleClient(false);
  deactivatedClient = await createNullRoleClient(true);
});

afterAll(async () => {
  if (fixtures) {
    await adminClient
      .from("activity_log")
      .delete()
      .eq("owner_id", users().sales.id);
    // create_quotation/revise_quotation now insert a linked follow-up Task
    // per call (spec: docs/superpowers/specs/2026-08-03-quotation-mandatory-followup-design.md)
    // -- clean these up before commercial_documents/clients, otherwise
    // tasks.client_id's FK blocks the clients delete below.
    await adminClient.from("tasks").delete().eq("owner_id", users().sales.id);
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("owner_id", users().sales.id);
    await adminClient
      .from("sales_orders")
      .delete()
      .eq("owner_id", users().sales.id);
  }
  if (clientId) {
    await adminClient.from("clients").delete().eq("id", clientId);
  }
  for (const id of nullRoleAuthIds) {
    await adminClient.from("profiles").delete().eq("id", id);
    await adminClient.auth.admin.deleteUser(id);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("NULL-role callers are rejected by SECURITY DEFINER RPC gates", () => {
  for (const [label, client] of [
    ["no profiles row", () => noProfileClient!],
    ["deactivated account", () => deactivatedClient!],
  ] as Array<[string, () => SupabaseClient]>) {
    describe(label, () => {
      test("create_quotation is rejected and writes nothing", async () => {
        const before = await adminClient
          .from("commercial_documents")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId);

        const { error } = await client().rpc("create_quotation", {
          p_client_id: clientId,
          p_document_date: "2095-07-28",
          p_client_address: null,
          p_stage: "Quotes Sent",
          p_so_number: null,
          p_note: null,
          p_items: items,
          p_next_action: "Follow up",
          p_next_action_date: "2095-08-04",
        });
        expect(error).toBeDefined();
        expect(error?.message).toContain("ACTIVE_MUTATING_ROLE_REQUIRED");

        const after = await adminClient
          .from("commercial_documents")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId);
        expect(after.count).toBe(before.count);
      });

      test("revise_quotation is rejected", async () => {
        const { error } = await client().rpc("revise_quotation", {
          p_document_id: quotationId,
          p_document_date: "2095-07-29",
          p_client_address: null,
          p_so_number: null,
          p_note: null,
          p_items: items,
          p_next_action: "Follow up",
          p_next_action_date: "2095-08-04",
        });
        expect(error).toBeDefined();
        expect(error?.message).toContain("ACTIVE_MUTATING_ROLE_REQUIRED");
      });

      test("create_prototype_request is rejected", async () => {
        const { error } = await client().rpc("create_prototype_request", {
          p_client_id: clientId,
          p_document_date: "2095-07-28",
          p_items: items,
        });
        expect(error).toBeDefined();
        expect(error?.message).toContain("ACTIVE_MUTATING_ROLE_REQUIRED");
      });

      test("create_sales_order is rejected and writes nothing", async () => {
        const soNumber = `DSM-95SO-${crypto.randomUUID().slice(0, 8)}`;
        const { error } = await client().rpc("create_sales_order", {
          p_client_id: clientId,
          p_date: "2095-07-28",
          p_customer_po_number: `PO-${crypto.randomUUID()}`,
          p_type: "Regular",
          p_tax_type: "PPN",
          p_prototype_status: null,
          p_source: "RFQ / New Product",
          p_number_mode: "Manual",
          p_manual_so_number: soNumber,
          p_backdate_reason: null,
          p_items: items,
        });
        expect(error).toBeDefined();
        expect(error?.message).toContain("ACTIVE_MUTATING_ROLE_REQUIRED");

        const { count } = await adminClient
          .from("sales_orders")
          .select("id", { count: "exact", head: true })
          .eq("so_number", soNumber);
        expect(count).toBe(0);
      });

      // The highest-impact case: this bypassed RLS to reassign any client to
      // any active sales/manager, i.e. full takeover of the client book.
      test("reassign_client_owner is rejected and ownership is unchanged", async () => {
        const { error } = await client().rpc("reassign_client_owner", {
          p_client_id: clientId,
          p_new_owner_id: users().manager.id,
        });
        expect(error).toBeDefined();

        const { data } = await adminClient
          .from("clients")
          .select("owner_id")
          .eq("id", clientId)
          .single();
        expect(data?.owner_id).toBe(users().sales.id);
      });

      test("task_control_loop_metrics is rejected", async () => {
        const { error } = await client().rpc("task_control_loop_metrics");
        expect(error).toBeDefined();
      });
    });
  }
});

describe("active roles still work after the null guard", () => {
  test("sales can still create a quotation", async () => {
    const salesClient = await signInAs(users().sales);
    const { data, error } = await salesClient.rpc("create_quotation", {
      p_client_id: clientId,
      p_document_date: "2095-07-30",
      p_client_address: null,
      p_stage: "Quotes Sent",
      p_so_number: null,
      p_note: null,
      p_items: items,
      p_next_action: "Follow up",
      p_next_action_date: "2095-08-06",
    });
    expect(error).toBeNull();
    expect(data?.quotation_number).toBeTruthy();
  });

  test("manager can still reassign a client owner", async () => {
    const managerClient = await signInAs(users().manager);
    const { error } = await managerClient.rpc("reassign_client_owner", {
      p_client_id: clientId,
      p_new_owner_id: users().manager.id,
    });
    expect(error).toBeNull();

    // Restore ownership so the null-role assertions above stay independent of
    // test ordering within this file.
    await adminClient
      .from("clients")
      .update({ owner_id: users().sales.id })
      .eq("id", clientId);
  });

  test("manager can still read task control loop metrics", async () => {
    const managerClient = await signInAs(users().manager);
    const { error } = await managerClient.rpc("task_control_loop_metrics");
    expect(error).toBeNull();
  });
});
