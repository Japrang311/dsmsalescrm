import { describe, expect, test } from "bun:test";
import {
  QUOTATION_PDF_DEFAULTS,
  quotationSignerDefaults,
} from "@/lib/export-quotation-pdf";

describe("quotationSignerDefaults", () => {
  test("fills jabatan and WA number for known accounts", () => {
    expect(
      quotationSignerDefaults("leli@dutasolusimetalindo.com", "Sales"),
    ).toEqual({
      title: "Sales Manager",
      closingLines: [
        "Should you have any enquiries concerning this quotes,",
        "Please contact leli@dutasolusimetalindo.com",
        "wa/mob +62 857-0308-1691",
      ],
    });

    expect(
      quotationSignerDefaults("iman@dutasolusimetalindo.com", "Sales"),
    ).toEqual({
      title: "Sales Supervisor",
      closingLines: [
        "Should you have any enquiries concerning this quotes,",
        "Please contact iman@dutasolusimetalindo.com",
        "wa/mob +62 857-7000-2408",
      ],
    });

    expect(
      quotationSignerDefaults("feni@dutasolusimetalindo.com", "Sales"),
    ).toEqual({
      title: "Sales",
      closingLines: [
        "Should you have any enquiries concerning this quotes,",
        "Please contact feni@dutasolusimetalindo.com",
        "wa/mob +62 857-2270-0755",
      ],
    });

    expect(
      quotationSignerDefaults("ika@dutasolusimetalindo.com", "Sales"),
    ).toEqual({
      title: "Sales",
      closingLines: [
        "Should you have any enquiries concerning this quotes,",
        "Please contact ika@dutasolusimetalindo.com",
        "wa/mob +62 813-2078-6025",
      ],
    });
  });

  test("is case-insensitive on email lookup", () => {
    const result = quotationSignerDefaults(
      "LELI@dutasolusimetalindo.com",
      "Sales",
    );
    expect(result.title).toBe("Sales Manager");
  });

  test("falls back to the given role title and generic closing lines for unknown accounts", () => {
    expect(quotationSignerDefaults("someone-else@example.com", "Manager")).toEqual({
      title: "Manager",
      closingLines: [...QUOTATION_PDF_DEFAULTS.closingLines],
    });
  });
});

describe("QUOTATION_PDF_DEFAULTS.terms", () => {
  test("is a single line combining FOB, delivery, and payment terms", () => {
    expect(QUOTATION_PDF_DEFAULTS.terms).toEqual([
      "FOB Jakarta Delivery in 30 days (After Drawing Approved) Payment: 30 days, after invoice",
    ]);
  });
});
