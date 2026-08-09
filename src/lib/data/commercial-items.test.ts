import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import {
  listCommercialItems,
  updateCommercialItem,
  type CommercialItemPatch,
} from "./commercial-items";

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
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-19",
      stage: "Quotes Sent",
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

    const { error: deleteError } = await adminClient
      .from("commercial_documents")
      .update({
        deleted_at: "2026-07-24T06:00:00.000Z",
        deleted_by: fixtures.sales.id,
      })
      .eq("id", documentId);
    if (deleteError) throw deleteError;

    expect(
      (await listCommercialItems()).some((item) => item.id === documentId),
    ).toBe(false);
    expect(
      (await listCommercialItems({ deleted: true })).some(
        (item) => item.id === documentId,
      ),
    ).toBe(true);

    const { error: restoreError } = await adminClient
      .from("commercial_documents")
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", documentId);
    if (restoreError) throw restoreError;
    await supabase.auth.signOut();
  });

  test("updates supported header fields", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    expect(
      (await updateCommercialItem(documentId, { stage: "Negotiation" })).stage,
    ).toBe("Negotiation");
    await supabase.auth.signOut();
  });

  test("public patch input excludes Sales Order and Task owned fields", () => {
    const supportedPatch: CommercialItemPatch = {
      stage: "Hot Prospect",
      quotationNumber: "DSM-26QUO-9999",
      quotationExpiredDate: "2026-09-09",
      note: "Header correction",
    };
    expect(supportedPatch).toMatchObject({ stage: "Hot Prospect" });

    // @ts-expect-error customerPoNumber is owned by the Sales Order API.
    const customerPoPatch: CommercialItemPatch = { customerPoNumber: "PO-1" };
    // @ts-expect-error taxType is owned by the Sales Order API.
    const taxPatch: CommercialItemPatch = { taxType: "PPN" };
    const nextActionPatch: CommercialItemPatch = {
      // @ts-expect-error nextActionDate is owned by Task/follow-up APIs.
      nextActionDate: "2026-09-09",
    };
    void customerPoPatch;
    void taxPatch;
    void nextActionPatch;
  });
});
