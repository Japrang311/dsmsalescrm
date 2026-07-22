import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { listCommercialItems, updateCommercialItem } from "./commercial-items";

let fixtures: RoleFixtureUsers;
let clientId: string;
let documentId: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Commercial facade ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;
  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "RFQ",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-19",
      rfq_number: `RFQ-FACADE-${crypto.randomUUID()}`,
      stage: "Client Request for Quotes",
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  documentId = document.id;
  const { error: itemError } = await adminClient
    .from("commercial_document_items")
    .insert({
      commercial_document_id: documentId,
      product_name: null,
      description: "Historical facade item",
      qty: 2,
      uom: "Pcs",
      unit_price: 5000,
      line_total: 10000,
      line_position: 1,
    });
  if (itemError) throw itemError;
});

afterAll(async () => {
  await adminClient.from("commercial_documents").delete().eq("id", documentId);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("commercial-items compatibility facade", () => {
  test("returns one compatibility row per normalized header", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const items = await listCommercialItems();
    expect(items.find((item) => item.id === documentId)).toMatchObject({
      description: "Historical facade item",
      estimatedValue: 10000,
      qty: 2,
      unitPrice: 5000,
    });
    await supabase.auth.signOut();
  });

  test("updates supported header fields and rejects legacy-only patches", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    expect(
      (await updateCommercialItem(documentId, { stage: "Negotiation" })).stage,
    ).toBe("Negotiation");
    await expect(
      updateCommercialItem(documentId, { customerPoNumber: "MANUAL" }),
    ).rejects.toThrow("UNSUPPORTED_NORMALIZED_DOCUMENT_PATCH");
    await supabase.auth.signOut();
  });
});
