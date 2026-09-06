import { describe, expect, test } from "bun:test";
import {
  formatPercent,
  formatPercentValue,
  formatRupiahAxis,
  formatDateTime,
} from "./format";

describe("formatPercent (fraction input)", () => {
  test("no decimals by default", () => {
    expect(formatPercent(0.357)).toBe("36%");
  });
  test("uses an id-ID comma decimal separator", () => {
    expect(formatPercent(0.357, 1)).toBe("35,7%");
    expect(formatPercent(1.234, 2)).toBe("123,40%");
  });
  test("guards non-finite input", () => {
    expect(formatPercent(NaN)).toBe("0%");
  });
});

describe("formatPercentValue (0–100 input)", () => {
  test("does not multiply by 100", () => {
    expect(formatPercentValue(35.7, 1)).toBe("35,7%");
    expect(formatPercentValue(50)).toBe("50%");
  });
});

describe("formatRupiahAxis", () => {
  test("compact single-token labels that never wrap", () => {
    expect(formatRupiahAxis(0)).toBe("0");
    expect(formatRupiahAxis(28_500_000_000)).toBe("28,5 M");
    expect(formatRupiahAxis(38_000_000_000)).toBe("38 M");
    expect(formatRupiahAxis(450_000_000)).toBe("450 jt");
    expect(formatRupiahAxis(-1_000_000_000)).toBe("-1 M");
  });
});

describe("formatDateTime", () => {
  test("renders a date and a time in id-ID", () => {
    const out = formatDateTime("2026-08-08T10:04:00Z");
    // Locale month abbreviations vary by ICU build; assert shape, not exact text.
    expect(out).toMatch(/\d{2} \w{3,4} 2026/);
    expect(out).toMatch(/\d{2}[.:]\d{2}/);
  });
});
