import { describe, expect, test } from "bun:test";

import type { CommercialItem } from "@/lib/domain";
import {
  isRfqReplacedByQuotation,
  transitionCommercialItemStage,
} from "./commercial-stage-transition";

const rfq: CommercialItem = {
  id: "rfq-1",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "RFQ",
  sourceFlow: "RFQ / New Product",
  stage: "Negotiation",
  description: "Panel test",
  estimatedValue: 100_000,
  updatedAt: "2026-07-25T12:00:00.000Z",
};

const quotation: CommercialItem = {
  ...rfq,
  id: "quotation-1",
  type: "Quotation",
  stage: "Quotes Sent",
  sourceRfqDocumentId: rfq.id,
};

describe("transitionCommercialItemStage", () => {
  test("converts an RFQ to a linked Quotation when the target is Quotes Sent", async () => {
    const result = await transitionCommercialItemStage(
      rfq,
      "Quotes Sent",
      {},
      {
        convertRfqToQuotation: async (id) =>
          id === rfq.id ? quotation : Promise.reject(new Error("wrong RFQ")),
        updateCommercialItem: async () => {
          throw new Error("RFQ conversion must not use a normal stage update");
        },
      },
    );

    expect(result).toEqual({
      item: quotation,
      transitionedToQuotation: true,
    });
  });

  test("also repairs an RFQ already marked Quotes Sent without a Quotation", async () => {
    const result = await transitionCommercialItemStage(
      { ...rfq, stage: "Quotes Sent" },
      "Quotes Sent",
      {},
      {
        convertRfqToQuotation: async () => quotation,
        updateCommercialItem: async () => {
          throw new Error("RFQ repair must use quotation conversion");
        },
      },
    );

    expect(result.transitionedToQuotation).toBe(true);
    expect(result.item.id).toBe(quotation.id);
  });

  test("uses a normal update for other stage changes", async () => {
    const updated = { ...rfq, stage: "Negotiation" };
    const result = await transitionCommercialItemStage(
      rfq,
      "Negotiation",
      { lostReason: null },
      {
        convertRfqToQuotation: async () => {
          throw new Error("Non-quotation stage must not create a Quotation");
        },
        updateCommercialItem: async (id, patch) =>
          id === rfq.id && patch.stage === "Negotiation"
            ? updated
            : Promise.reject(new Error("wrong update payload")),
      },
    );

    expect(result).toEqual({
      item: updated,
      transitionedToQuotation: false,
    });
  });
});

describe("isRfqReplacedByQuotation", () => {
  test("hides only an RFQ with a Quotation linked to that RFQ", () => {
    const unrelatedQuotation = {
      ...quotation,
      id: "quotation-2",
      sourceRfqDocumentId: "rfq-2",
    };

    expect(isRfqReplacedByQuotation(rfq, [rfq, quotation])).toBe(true);
    expect(isRfqReplacedByQuotation(rfq, [rfq, unrelatedQuotation])).toBe(
      false,
    );
    expect(isRfqReplacedByQuotation(quotation, [rfq, quotation])).toBe(false);
  });
});
