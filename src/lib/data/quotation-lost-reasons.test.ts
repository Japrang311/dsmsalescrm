import { describe, expect, test } from "bun:test";
import type { CommercialItem } from "@/lib/domain";
import {
  activeLostReasonPatch,
  quotationLostReasonBreakdown,
  validateQuotationLostReason,
} from "./quotation-lost-reasons";

describe("quotation lost reason rules", () => {
  test("requires a category when a quotation moves to Closed Lost", () => {
    expect(
      validateQuotationLostReason({
        type: "Quotation",
        stage: "Closed Lost",
        lostReason: null,
        lostReasonDetail: null,
      }),
    ).toBe("Pilih alasan quotation lost.");
  });

  test("requires detail only for Lainnya", () => {
    expect(
      validateQuotationLostReason({
        type: "Quotation",
        stage: "Closed Lost",
        lostReason: "Lainnya",
        lostReasonDetail: " ",
      }),
    ).toBe("Jelaskan alasan lainnya.");
    expect(
      validateQuotationLostReason({
        type: "Quotation",
        stage: "Closed Lost",
        lostReason: "Harga tidak kompetitif",
        lostReasonDetail: "",
      }),
    ).toBeNull();
  });

  test("clears active reason fields when quotation is reopened", () => {
    expect(
      activeLostReasonPatch({
        type: "Quotation",
        stage: "Negotiation",
        lostReason: "Harga tidak kompetitif",
        lostReasonDetail: "Selisih 12%",
      }),
    ).toEqual({ lostReason: null, lostReasonDetail: null });
  });

  test("aggregates Closed Lost quotation count and value by reason", () => {
    const item = (
      id: string,
      stage: string,
      reason: CommercialItem["lostReason"],
      estimatedValue: number,
    ): CommercialItem => ({
      id,
      clientId: "client-1",
      ownerId: "owner-1",
      type: "Quotation",
      sourceFlow: "RFQ / New Product",
      stage,
      description: id,
      estimatedValue,
      updatedAt: "2026-07-25T00:00:00.000Z",
      lostReason: reason,
    });

    expect(
      quotationLostReasonBreakdown([
        item("lost-1", "Closed Lost", "Harga tidak kompetitif", 10_000),
        item("lost-2", "Closed Lost", "Harga tidak kompetitif", 20_000),
        item("open", "Negotiation", undefined, 50_000),
      ]),
    ).toEqual([
      {
        reason: "Harga tidak kompetitif",
        quotationCount: 2,
        lostValue: 30_000,
      },
    ]);
  });
});
