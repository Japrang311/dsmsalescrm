import { describe, expect, test } from "bun:test";
import type { CommercialItem } from "@/lib/domain";
import {
  activeLostReasonPatch,
  isLostReasonTracked,
  quotationLostReasonBreakdown,
  validateQuotationLostReason,
} from "./quotation-lost-reasons";

describe("quotation lost reason rules", () => {
  test("requires a category when quotation moves to Closed Lost", () => {
    expect(
      validateQuotationLostReason({
        type: "Quotation",
        stage: "Closed Lost",
        lostReason: null,
        lostReasonDetail: null,
      }),
    ).toBe("Pilih alasan closed lost.");
    expect(isLostReasonTracked("Direct Order", "Closed Lost")).toBe(false);
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

  test("aggregates Closed Lost count and value by reason", () => {
    const item = (
      id: string,
      type: CommercialItem["type"],
      stage: string,
      reason: CommercialItem["lostReason"],
      estimatedValue: number,
    ): CommercialItem => ({
      id,
      clientId: "client-1",
      ownerId: "owner-1",
      type,
      sourceFlow: "New Product",
      stage,
      description: id,
      estimatedValue,
      updatedAt: "2026-07-25T00:00:00.000Z",
      lostReason: reason,
    });

    expect(
      quotationLostReasonBreakdown([
        item(
          "lost-1",
          "Quotation",
          "Closed Lost",
          "Harga tidak kompetitif",
          10_000,
        ),
        item(
          "lost-2",
          "Quotation",
          "Closed Lost",
          "Harga tidak kompetitif",
          20_000,
        ),
        item("open", "Quotation", "Negotiation", undefined, 50_000),
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
