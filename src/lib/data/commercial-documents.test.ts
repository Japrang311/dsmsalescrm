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
  createQuotationFromRfq,
  deleteCommercialDocument,
  getCommercialDocument,
  listCommercialDocuments,
  reviseQuotation,
  restoreCommercialDocument,
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
  test("lists one header with ordered nested items and legacy null Product", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const documents = await listCommercialDocuments();
    const document = documents.find((entry) => entry.id === legacyDocumentId);
    expect(document?.documentDate).toBe("2026-07-18");
    expect(document?.items.map((item) => item.linePosition)).toEqual([1, 2]);
    expect(document?.items[0]?.productName).toBeNull();
    expect(document?.totalValue).toBe(5000);
    await supabase.auth.signOut();
  });

  test("soft-deletes and restores an RFQ with active/deleted visibility and audit", async () => {
    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    await deleteCommercialDocument(legacyDocumentId);

    expect(await getCommercialDocument(legacyDocumentId)).toBeNull();
    const deleted = await getCommercialDocument(legacyDocumentId, {
      deleted: true,
    });
    expect(deleted?.deletedBy).toBe(fixtures.sales.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect(
      (await listCommercialDocuments()).some(
        (entry) => entry.id === legacyDocumentId,
      ),
    ).toBe(false);
    expect(
      (await listCommercialDocuments({ deleted: true })).some(
        (entry) => entry.id === legacyDocumentId,
      ),
    ).toBe(true);

    await restoreCommercialDocument(legacyDocumentId);

    expect(await getCommercialDocument(legacyDocumentId)).not.toBeNull();
    expect(
      await getCommercialDocument(legacyDocumentId, { deleted: true }),
    ).toBeNull();

    const { data: activity, error } = await adminClient
      .from("activity_log")
      .select("kind, commercial_document_id")
      .eq("commercial_document_id", legacyDocumentId)
      .in("kind", [
        "commercial_document_deleted",
        "commercial_document_restored",
      ])
      .order("created_at");
    if (error) throw error;
    expect(activity).toEqual([
      {
        kind: "commercial_document_deleted",
        commercial_document_id: legacyDocumentId,
      },
      {
        kind: "commercial_document_restored",
        commercial_document_id: legacyDocumentId,
      },
    ]);
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
    });
    expect(revised.quotationNumber).toBe(`${created.quotationNumber}_REV.1`);
    expect(revised.supersedesDocumentId).toBe(created.id);
    expect(revised.isCurrentRevision).toBe(true);
    await expect(deleteCommercialDocument(created.id)).rejects.toThrow(
      "Quotation ini tidak dapat dihapus karena sudah memiliki revisi yang lebih baru.",
    );
    await supabase.auth.signOut();
  });

  test("creates a linked Quotation draft when an RFQ moves to Quotes Sent", async () => {
    const { data: rfq, error: rfqError } = await adminClient
      .from("commercial_documents")
      .insert({
        client_id: clientId,
        owner_id: fixtures.sales.id,
        type: "RFQ",
        source_flow: "RFQ / New Product",
        document_date: "2095-03-01",
        rfq_number: `RFQ-CONVERT-${crypto.randomUUID()}`,
        stage: "Client Request for Quotes",
      })
      .select("id, rfq_number")
      .single();
    if (rfqError) throw rfqError;

    const { error: itemError } = await adminClient
      .from("commercial_document_items")
      .insert({
        commercial_document_id: rfq.id,
        product_name: "Cable Tray",
        description: "HDG Finish",
        qty: 50,
        uom: "Pcs",
        unit_price: 850_000,
        line_total: 42_500_000,
        line_position: 1,
      });
    if (itemError) throw itemError;

    const authClient = await signInAs(fixtures.sales);
    const session = (await authClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const quotation = await createQuotationFromRfq(rfq.id);
    expect(quotation.type).toBe("Quotation");
    expect(quotation.stage).toBe("Quotes Sent");
    expect(quotation.sourceRfqDocumentId).toBe(rfq.id);
    expect(quotation.rfqNumber).toBeNull();
    expect(quotation.quotationNumber).toBeNull();
    expect(quotation.quotationExpiredDate).toBeNull();
    expect(quotation.items).toHaveLength(1);
    expect(quotation.items[0]?.productName).toBe("Cable Tray");

    const { data: sourceRfq, error: sourceError } = await adminClient
      .from("commercial_documents")
      .select("type, stage")
      .eq("id", rfq.id)
      .single();
    if (sourceError) throw sourceError;
    expect(sourceRfq).toEqual({ type: "RFQ", stage: "Quotes Sent" });

    const repeated = await createQuotationFromRfq(rfq.id);
    expect(repeated.id).toBe(quotation.id);

    const { data: activity, error: activityError } = await adminClient
      .from("activity_log")
      .select("title, detail, commercial_document_id")
      .in("commercial_document_id", [rfq.id, quotation.id])
      .order("created_at");
    if (activityError) throw activityError;
    expect(
      activity?.some((row) => row.title === "Quotation dibuat dari RFQ"),
    ).toBe(true);
    expect(
      activity?.some((row) => row.title === "RFQ dipindahkan ke Quotes Sent"),
    ).toBe(true);
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
});
