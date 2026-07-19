// Exercises the real src/lib/data/follow-ups.ts module end-to-end against
// the local Supabase stack — proves the module itself works, not just the
// raw RLS mechanics (already covered by supabase/tests/follow-up-logs.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { logFollowUp, listFollowUpsForClient } from "./follow-ups";
import { supabase } from "@/lib/supabase";

let fixtures: RoleFixtureUsers;
let clientId: string;
let createdId: string;
let commercialDocumentId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: anyClient, error: clientError } = await adminClient
    .from("clients")
    .select("id")
    .limit(1)
    .single();
  if (clientError) throw clientError;
  clientId = anyClient.id;

  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-18",
      rfq_number: `RFQ-FOLLOW-UP-${crypto.randomUUID().slice(0, 8)}`,
      stage: "Client Request for Quotes",
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  commercialDocumentId = document.id;
});

afterAll(async () => {
  if (createdId) {
    await adminClient.from("follow_up_logs").delete().eq("id", createdId);
  }
  if (commercialDocumentId) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("id", commercialDocumentId);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("src/lib/data/follow-ups.ts", () => {
  test("logFollowUp() persists a real follow-up and listFollowUpsForClient() returns it", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const created = await logFollowUp({
      clientId,
      commercialDocumentId,
      ownerId: session.user.id,
      fuDate: "2026-07-18",
      method: "Phone",
      result: "Interested",
      notes: "Data-layer fixture follow-up",
    });
    createdId = created.id;
    expect(created.clientId).toBe(clientId);
    expect(created.commercialDocumentId).toBe(commercialDocumentId);
    expect(created.result).toBe("Interested");

    const logs = await listFollowUpsForClient(clientId);
    expect(logs.some((l) => l.id === created.id)).toBe(true);

    await supabase.auth.signOut();
  });
});
