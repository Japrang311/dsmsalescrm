import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import { listCommercialDocumentsPage } from "./commercial-documents";

let fixtures: RoleFixtureUsers;
let clientId: string;
const documentIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Pipeline pagination fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  // Seed 3 current-revision Quotations in "Quotes Sent" to exercise bounded
  // pageSize + cursor, plus 1 superseded (non-current) revision that must
  // never appear on the Pipeline board.
  for (let i = 0; i < 3; i++) {
    const { data: document, error: documentError } = await adminClient
      .from("commercial_documents")
      .insert({
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "Quotation",
        source_flow: "RFQ / New Product",
        document_date: "2026-08-05",
        quotation_number: `QUO-PAGE-${crypto.randomUUID()}`,
        quotation_base_number: `QUO-PAGE-${crypto.randomUUID()}`,
        stage: "Quotes Sent",
        is_current_revision: true,
      })
      .select("id")
      .single();
    if (documentError) throw documentError;
    documentIds.push(document.id);
  }

  const { data: superseded, error: supersededError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-08-05",
      quotation_number: `QUO-PAGE-OLD-${crypto.randomUUID()}`,
      quotation_base_number: `QUO-PAGE-OLD-${crypto.randomUUID()}`,
      stage: "Quotes Sent",
      is_current_revision: false,
    })
    .select("id")
    .single();
  if (supersededError) throw supersededError;
  documentIds.push(superseded.id);

  const authClient = await signInAs(fixtures.sales);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
});

afterAll(async () => {
  await adminClient.from("commercial_documents").delete().in("id", documentIds);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("listCommercialDocumentsPage", () => {
  test("bounds page size and returns a cursor when more rows remain", async () => {
    const page = await listCommercialDocumentsPage({
      filters: { stage: "Quotes Sent", ownerId: fixtures.sales.id },
      page: { pageSize: 2 },
    });

    expect(page.rows.length).toBe(2);
    expect(page.nextCursor).not.toBeNull();
  });

  test("cursor pagination reaches all current-revision rows without duplicates or gaps", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let guard = 0;
    do {
      const page = await listCommercialDocumentsPage({
        filters: { stage: "Quotes Sent", ownerId: fixtures.sales.id },
        page: { pageSize: 2, cursor },
      });
      for (const row of page.rows) seen.add(row.id);
      cursor = page.nextCursor;
      guard++;
    } while (cursor && guard < 10);

    // Exactly the 3 current-revision Quotations, never the superseded one.
    expect(seen.size).toBe(3);
    for (const id of documentIds.slice(0, 3)) {
      expect(seen.has(id)).toBe(true);
    }
    expect(seen.has(documentIds[3])).toBe(false);
  });
});
