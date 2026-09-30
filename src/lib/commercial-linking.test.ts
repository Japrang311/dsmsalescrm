import { describe, expect, test } from "bun:test";
import type { CommercialItem } from "@/lib/domain";
import type { SalesOrderDocument } from "@/lib/data/sales-orders";
import {
  eligibleQuotationsForSalesOrder,
  eligibleSalesOrdersForQuotation,
  manualCommercialLinkErrorMessage,
} from "./commercial-linking";

const quotation: CommercialItem = {
  id: "quotation-1",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "Quotation",
  sourceFlow: "New Product",
  stage: "Closed Won",
  description: "Panel",
  estimatedValue: 1_000_000,
  updatedAt: "2026-09-30",
  quotationNumber: "DSM-26QUO-001",
  isCurrentRevision: true,
};

const salesOrder: SalesOrderDocument = {
  id: "so-1",
  soNumber: "DSM-26SO001",
  customerPoNumber: "PO-001",
  customerPoDate: null,
  date: "2026-09-30",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "Regular",
  taxType: "PPN",
  source: "New Product",
  numberMode: "Manual",
  totalValue: 1_000_000,
  value: 1_000_000,
  sourceCommercialDocumentId: null,
  createdAt: "2026-09-30T00:00:00Z",
  updatedAt: "2026-09-30T00:00:00Z",
  deletedAt: null,
  deletedBy: null,
  items: [],
};

describe("manual commercial linking candidates", () => {
  test("SO detail only offers current same-client Closed Won unlinked quotations", () => {
    const candidates = eligibleQuotationsForSalesOrder(
      [
        quotation,
        { ...quotation, id: "wrong-client", clientId: "client-2" },
        { ...quotation, id: "wrong-stage", stage: "Commit" },
        { ...quotation, id: "superseded", isCurrentRevision: false },
        { ...quotation, id: "prototype", type: "Prototype" },
        { ...quotation, id: "linked" },
      ],
      [
        salesOrder,
        {
          ...salesOrder,
          id: "existing-so",
          soNumber: "DSM-26SO002",
          sourceCommercialDocumentId: "linked",
        },
      ],
      salesOrder,
    );

    expect(candidates.map((item) => item.id)).toEqual(["quotation-1"]);
  });

  test("Closed Won quotation only offers same-client released SOs without a source quotation", () => {
    const candidates = eligibleSalesOrdersForQuotation(quotation, [
      salesOrder,
      { ...salesOrder, id: "wrong-client", clientId: "client-2" },
      {
        ...salesOrder,
        id: "already-linked",
        sourceCommercialDocumentId: "another-quotation",
      },
      { ...salesOrder, id: "deleted", deletedAt: "2026-09-30T01:00:00Z" },
    ]);

    expect(candidates.map((item) => item.id)).toEqual(["so-1"]);
  });

  test("maps stable database errors to actionable Indonesian copy", () => {
    expect(
      manualCommercialLinkErrorMessage(
        new Error("QUOTATION_ALREADY_HAS_SALES_ORDER"),
      ),
    ).toContain("sudah terhubung");
    expect(
      manualCommercialLinkErrorMessage(new Error("QUOTATION_CLIENT_MISMATCH")),
    ).toContain("klien yang sama");
  });
});
