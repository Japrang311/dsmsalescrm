import { SQL } from "bun";
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
  createQuotation,
  deleteCommercialDocument,
  listCommercialDocuments,
  reviseQuotation,
  updateCommercialDocument,
} from "./commercial-documents";

let fixtures: RoleFixtureUsers;
let clientId: string;
let legacyDocumentId: string;
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Commercial document adapter ${crypto.randomUUID()}`,
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
      document_date: "2026-07-18",
      rfq_number: `RFQ-ADAPTER-${crypto.randomUUID()}`,
      stage: "Client Request for Quotes",
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  legacyDocumentId = document.id;

  const { error: itemsError } = await adminClient
    .from("commercial_document_items")
    .insert([
      {
        commercial_document_id: legacyDocumentId,
        product_name: null,
        description: "Historical second line",
        qty: 2,
        uom: "Pcs",
        unit_price: 2000,
        line_total: 4000,
        line_position: 2,
      },
      {
        commercial_document_id: legacyDocumentId,
        product_name: null,
        description: "Historical first line",
        qty: 1,
        uom: "Unit",
        unit_price: 1000,
        line_total: 1000,
        line_position: 1,
      },
    ]);
  if (itemsError) throw itemsError;
});

afterAll(async () => {
  await adminClient
    .from("activity_log")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  // create_quotation/revise_quotation now insert a linked follow-up Task
  // per call (spec: docs/superpowers/specs/2026-08-03-quotation-mandatory-followup-design.md)
  // -- clean these up before commercial_documents/clients, otherwise
  // tasks.client_id's FK blocks the clients delete below.
  await adminClient.from("tasks").delete().eq("owner_id", fixtures.sales.id);
  await adminClient
    .from("commercial_documents")
    .delete()
    .eq("owner_id", fixtures.sales.id);
  await adminClient.from("clients").delete().eq("id", clientId);
  await db`
    delete from private.document_number_counters
    where series = 'QUO' and year_code = 95
  `;
  await deleteRoleFixtureUsers(fixtures);
  await db.end();
});

describe("normalized commercial document adapter", () => {
  test("excludes historical RFQ documents from active application queries", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const documents = await listCommercialDocuments();
    const document = documents.find((entry) => entry.id === legacyDocumentId);
    expect(document).toBeUndefined();
    await supabase.auth.signOut();
  });

  test("creates and revises Quotation through transactional RPCs", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const created = await createQuotation({
      clientId,
      documentDate: "2095-01-15",
      clientAddress: "Plant A",
      stage: "Quotes Sent",
      note: "Adapter base",
      items: [
        {
          productName: "Bracket",
          description: "Laser cut",
          qty: 2,
          uom: "Pcs",
          unitPrice: 5000,
        },
      ],
      nextAction: "Telepon PIC untuk konfirmasi harga",
      nextActionDate: "2095-01-22",
    });
    expect(created.quotationNumber).toMatch(/^DSM-95QUO-\d{4}$/);
    expect(created.items[0]?.lineTotal).toBe(10000);

    const revised = await reviseQuotation(created.id, {
      documentDate: "2095-01-16",
      clientAddress: "Plant B",
      note: "Adapter rev",
      items: [
        {
          productName: "Bracket Rev",
          qty: 1,
          uom: "Set",
          unitPrice: 12000,
        },
      ],
      nextAction: "Kirim ulang penawaran revisi",
      nextActionDate: "2095-01-23",
    });
    expect(revised.quotationNumber).toBe(`${created.quotationNumber}_REV.1`);
    expect(revised.supersedesDocumentId).toBe(created.id);
    expect(revised.isCurrentRevision).toBe(true);
    await expect(deleteCommercialDocument(created.id)).rejects.toThrow(
      "Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru.",
    );
    await supabase.auth.signOut();
  });

  test("requires a structured lost reason and clears it when reopened", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const created = await createQuotation({
      clientId,
      documentDate: "2095-02-01",
      items: [
        {
          productName: "Lost reason contract",
          qty: 1,
          uom: "Unit",
          unitPrice: 50_000,
        },
      ],
      nextAction: "Follow up status keputusan client",
      nextActionDate: "2095-02-08",
    });

    await expect(
      updateCommercialDocument(created.id, { stage: "Closed Lost" }),
    ).rejects.toThrow();

    const closed = await updateCommercialDocument(created.id, {
      stage: "Closed Lost",
      lostReason: "Harga tidak kompetitif",
      lostReasonDetail: "Selisih harga 12%",
    });
    expect(closed.lostReason).toBe("Harga tidak kompetitif");
    expect(closed.lostReasonDetail).toBe("Selisih harga 12%");

    const reopened = await updateCommercialDocument(created.id, {
      stage: "Negotiation",
      lostReason: null,
      lostReasonDetail: null,
    });
    expect(reopened.lostReason).toBeNull();
    expect(reopened.lostReasonDetail).toBeNull();
    await supabase.auth.signOut();
  });

  test("allows correcting Quotation Number, Date, and Expired Date after creation", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const created = await createQuotation({
      clientId,
      documentDate: "2095-03-01",
      items: [
        {
          productName: "Correction target",
          qty: 1,
          uom: "Unit",
          unitPrice: 1000,
        },
      ],
      nextAction: "Follow up koreksi nomor Quotation",
      nextActionDate: "2095-03-08",
    });

    const corrected = await updateCommercialDocument(created.id, {
      quotationNumber: `${created.quotationNumber}-CORRECTED`,
      documentDate: "2095-03-02",
      quotationExpiredDate: "2095-04-01",
    });
    expect(corrected.quotationNumber).toBe(
      `${created.quotationNumber}-CORRECTED`,
    );
    expect(corrected.documentDate).toBe("2095-03-02");
    expect(corrected.quotationExpiredDate).toBe("2095-04-01");
    await supabase.auth.signOut();
  });
});
