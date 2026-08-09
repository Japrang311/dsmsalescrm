import { describe, expect, test } from "bun:test";
import {
  formatOwnerMismatchMarkdown,
  OWNER_MISMATCH_REVIEW_SQL,
  summarizeOwnerMismatches,
  type OwnerMismatchRow,
} from "./owner-mismatch-review";

const rows: OwnerMismatchRow[] = [
  {
    document_kind: "sales_order",
    document_id: "so-1",
    document_number: "DSM-26SO001",
    document_date: "2026-01-10",
    client_name: "PT Contoh Jaya",
    client_owner_id: "sales-leli",
    client_owner_name: "Leli Al",
    document_owner_id: "sales-iman",
    document_owner_name: "Nur Iman",
    amount: "12500000",
    status: "Regular / Existing / Repeat Order",
  },
  {
    document_kind: "commercial_document",
    document_id: "quo-1",
    document_number: "DSM-26QUO-001",
    document_date: "2026-01-05",
    client_name: "PT Pipa | Berkah",
    client_owner_id: "sales-leli",
    client_owner_name: "Leli Al",
    document_owner_id: "sales-ika",
    document_owner_name: "Siti Zulaika (Ika)",
    amount: 0,
    status: "Quotation / Quotes Sent",
  },
];

describe("owner-mismatch review", () => {
  test("summarizes mismatch rows by document kind and owner", () => {
    expect(summarizeOwnerMismatches(rows)).toEqual({
      total: 2,
      commercialDocuments: 1,
      salesOrders: 1,
      byClientOwner: { "Leli Al": 2 },
      byDocumentOwner: { "Nur Iman": 1, "Siti Zulaika (Ika)": 1 },
    });
  });

  test("formats a Product Owner review markdown table without correction commands", () => {
    const markdown = formatOwnerMismatchMarkdown(rows);

    expect(markdown).toContain("# Owner-Mismatch Review Backlog");
    expect(markdown).toContain("Total kandidat mismatch: 2");
    expect(markdown).toContain("Rp12.500.000");
    expect(markdown).toContain("PT Pipa \\| Berkah");
    expect(markdown).toContain("Decision note");
    expect(markdown).not.toContain("update public");
  });

  test("read-only SQL selects mismatches and excludes deleted documents", () => {
    expect(OWNER_MISMATCH_REVIEW_SQL.toLowerCase()).toContain("select *");
    expect(OWNER_MISMATCH_REVIEW_SQL).toContain("d.owner_id <> c.owner_id");
    expect(OWNER_MISMATCH_REVIEW_SQL).toContain("so.owner_id <> c.owner_id");
    expect(OWNER_MISMATCH_REVIEW_SQL).toContain("d.deleted_at is null");
    expect(OWNER_MISMATCH_REVIEW_SQL).toContain("so.deleted_at is null");
    expect(OWNER_MISMATCH_REVIEW_SQL.toLowerCase()).not.toContain(
      "update public",
    );
    expect(OWNER_MISMATCH_REVIEW_SQL.toLowerCase()).not.toContain(
      "delete from",
    );
  });
});
