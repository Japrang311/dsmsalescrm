import { describe, expect, test } from "bun:test";
import type { CommercialDocumentWithItems } from "./commercial-documents";
import type { SalesOrderDocument } from "./sales-orders";
import {
  commercialDocumentViewModel,
  currentCommercialDocuments,
  formatCompactDate,
  productDisplayName,
  salesOrderShowsMoney,
} from "./commercial-grouping";

function document(
  overrides: Partial<CommercialDocumentWithItems> = {},
): CommercialDocumentWithItems {
  return {
    id: "doc",
    clientId: "client",
    ownerId: "owner",
    type: "Quotation",
    sourceFlow: "RFQ / New Product",
    documentDate: "2026-07-18",
    rfqNumber: null,
    quotationNumber: "DSM-26QUO-0404",
    quotationBaseNumber: "DSM-26QUO-0404",
    quotationRevision: 0,
    isCurrentRevision: true,
    supersedesDocumentId: null,
    stage: "Quotes Sent",
    clientAddress: null,
    soNumber: null,
    note: null,
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
    totalValue: 0,
    items: [
      {
        id: "i2",
        commercialDocumentId: "doc",
        productName: "Second",
        description: null,
        qty: 2,
        uom: "Pcs",
        unitPrice: 2000,
        lineTotal: 4000,
        linePosition: 2,
      },
      {
        id: "i1",
        commercialDocumentId: "doc",
        productName: null,
        description: "Historical",
        qty: 1,
        uom: "Unit",
        unitPrice: 1000,
        lineTotal: 1000,
        linePosition: 1,
      },
    ],
    ...overrides,
  };
}

describe("commercial grouped view models", () => {
  test("excludes superseded quotation revisions from current lists", () => {
    expect(
      currentCommercialDocuments([
        document({ id: "base", isCurrentRevision: false }),
        document({ id: "revision", quotationRevision: 1 }),
        document({ id: "rfq", type: "RFQ", isCurrentRevision: false }),
      ]).map((entry) => entry.id),
    ).toEqual(["revision", "rfq"]);
  });

  test("sorts items, sums totals, and calculates current forecast", () => {
    const view = commercialDocumentViewModel(document());
    expect(view.items.map((item) => item.id)).toEqual(["i1", "i2"]);
    expect(view.totalValue).toBe(5000);
    expect(view.forecastValue).toBe(1500);
    expect(view.itemCount).toBe(2);
  });

  test("uses Product placeholder only in presentation and formats compact Date", () => {
    expect(productDisplayName(null)).toBe("Nama Product belum diisi");
    expect(productDisplayName("Bracket")).toBe("Bracket");
    expect(formatCompactDate("2026-07-18")).toBe("18 Jul 2026");
  });

  test("omits money columns only for Prototype FOC", () => {
    const base = {
      type: "Prototype",
      prototypeStatus: "FOC",
    } as SalesOrderDocument;
    expect(salesOrderShowsMoney(base)).toBe(false);
    expect(salesOrderShowsMoney({ ...base, prototypeStatus: "Paid" })).toBe(
      true,
    );
  });
});
