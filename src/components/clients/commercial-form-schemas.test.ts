import { describe, expect, test } from "bun:test";
import {
  buildSalesOrderSchema,
  prototypeRequestSchema,
  quotationSchema,
  rfqSchema,
} from "./commercial-form-schemas";

const paidItem = {
  productName: "Bracket",
  description: "",
  qty: 2,
  uom: "Pcs",
  unitPrice: 5000,
};

describe("Phase 11 commercial form schemas", () => {
  test("RFQ requires Date, Product, Qty, UOM, and paid price", () => {
    expect(
      rfqSchema.safeParse({
        rfqNumber: "RFQ-001",
        documentDate: "2026-07-19",
        stage: "Client Request for Quotes",
        lineItems: [paidItem],
      }).success,
    ).toBe(true);
    expect(
      rfqSchema.safeParse({
        rfqNumber: "RFQ-001",
        documentDate: "",
        stage: "Client Request for Quotes",
        lineItems: [{ ...paidItem, productName: "", uom: "" }],
      }).success,
    ).toBe(false);
  });

  test("Quotation keeps Description optional and requires weighted stage", () => {
    const parsed = quotationSchema.safeParse({
      documentDate: "2026-07-19",
      clientAddress: "",
      stage: "Quotes Sent",
      soNumber: "",
      note: "",
      lineItems: [paidItem],
    });
    expect(parsed.success).toBe(true);
    expect(
      quotationSchema.safeParse({
        documentDate: "2026-07-19",
        stage: "Quotation Sent",
        lineItems: [paidItem],
      }).success,
    ).toBe(false);
  });

  test("paid SO requires customer PO and positive item prices", () => {
    const schema = buildSalesOrderSchema(false);
    expect(
      schema.safeParse({
        customerPoNumber: "PO-001",
        date: "2026-07-19",
        type: "Regular",
        taxType: "PPN",
        source: "Existing / Repeat Order",
        numberMode: "Auto",
        lineItems: [paidItem],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        customerPoNumber: "",
        date: "2026-07-19",
        type: "Regular",
        taxType: "PPN",
        source: "Existing / Repeat Order",
        numberMode: "Auto",
        lineItems: [{ ...paidItem, unitPrice: 0 }],
      }).success,
    ).toBe(false);
  });

  test("Prototype FOC requires item identity but rejects money", () => {
    const schema = buildSalesOrderSchema(false);
    const base = {
      customerPoNumber: "PO-FOC",
      date: "2026-07-19",
      type: "Prototype",
      prototypeStatus: "FOC",
      source: "Prototype FOC",
      numberMode: "Auto",
    };
    expect(
      schema.safeParse({
        ...base,
        lineItems: [{ ...paidItem, unitPrice: undefined }],
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ ...base, lineItems: [paidItem] }).success).toBe(
      false,
    );
  });

  test("HARIFF backdate is exact-client-only and requires number plus reason", () => {
    const hariffSchema = buildSalesOrderSchema(true);
    const backdate = {
      customerPoNumber: "PO-HARIFF",
      date: "2026-07-19",
      type: "Regular",
      taxType: "PPN",
      source: "Existing / Repeat Order",
      numberMode: "Hariff Backdate",
      manualSoNumber: "DSM-22SO147",
      backdateReason: "Historical official number",
      lineItems: [paidItem],
    };
    expect(hariffSchema.safeParse(backdate).success).toBe(true);
    expect(buildSalesOrderSchema(false).safeParse(backdate).success).toBe(
      false,
    );
    expect(
      hariffSchema.safeParse({ ...backdate, backdateReason: "" }).success,
    ).toBe(false);
  });

  test("Prototype Request requires Product, Date, Qty, UOM, and price", () => {
    expect(
      prototypeRequestSchema.safeParse({
        documentDate: "2026-07-19",
        lineItems: [paidItem],
      }).success,
    ).toBe(true);
    expect(
      prototypeRequestSchema.safeParse({
        documentDate: "",
        lineItems: [{ ...paidItem, productName: "" }],
      }).success,
    ).toBe(false);
  });
});
