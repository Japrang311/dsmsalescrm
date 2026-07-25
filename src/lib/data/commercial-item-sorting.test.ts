import { describe, expect, test } from "bun:test";
import { compareCommercialItemsByNewestQuotationNumber } from "./commercial-items";

const item = (
  documentDate: string,
  quotationNumber?: string,
  updatedAt = documentDate,
) => ({
  documentDate,
  quotationNumber,
  updatedAt,
});

describe("compareCommercialItemsByNewestQuotationNumber", () => {
  test("sorts quotations by descending natural quotation number before date", () => {
    const sorted = [
      item("2026-07-01", "DSM-26QUO-0099"),
      item("2026-08-01"),
      item("2026-07-01", "DSM-26QUO-0403"),
      item("2026-07-01", "DSM-26QUO-0404"),
      item("2026-07-01", "DSM-26QUO-0100"),
    ].sort(compareCommercialItemsByNewestQuotationNumber);

    expect(sorted.map((entry) => entry.quotationNumber ?? "-")).toEqual([
      "DSM-26QUO-0404",
      "DSM-26QUO-0403",
      "DSM-26QUO-0100",
      "DSM-26QUO-0099",
      "-",
    ]);
  });
});
