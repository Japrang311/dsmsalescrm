import { describe, expect, test } from "bun:test";
import { toLocalIsoDate } from "./app-time";

// Proves toLocalIsoDate() reads local calendar parts (getFullYear/getMonth/
// getDate) rather than converting through .toISOString() (UTC). The bug it
// replaces: a Date built as local midnight (new Date(y, m, d), same shape
// as NOW / date pickers) rolls back to the previous calendar day once
// converted to UTC in any timezone ahead of UTC (GMT+7 included) -- this is
// why "today" silently dropped out of date-range filters (Sales Orders
// list, Dashboard KPI RPCs) and why "today" write-defaults recorded
// yesterday's date in GMT+7 production use.
//
// Deliberately does not assert a hardcoded UTC-shifted string: CI runs in
// UTC (no shift, offset 0) while local dev typically runs in Asia/Jakarta
// (GMT+7, reproduces the shift) -- and does not mutate process.env.TZ
// either, since bun:test shares one process across files and a leaked
// mutation would corrupt unrelated tests. Comparing against the local
// calendar parts directly keeps this correct and meaningful in both.

describe("toLocalIsoDate", () => {
  test("matches the date's own local calendar parts, not a UTC-converted one", () => {
    const d = new Date(2026, 7, 6, 0, 0, 0); // 6 Aug 2026, local midnight
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(toLocalIsoDate(d)).toBe(expected);
    expect(toLocalIsoDate(d)).toBe("2026-08-06");
  });

  test("pads single-digit months and days", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  test("in a timezone ahead of UTC, differs from the buggy .toISOString() approach it replaces", () => {
    const d = new Date(2026, 7, 6, 0, 0, 0);
    const isAheadOfUtc = d.getTimezoneOffset() < 0; // negative = ahead of UTC (e.g. GMT+7 is -420)
    if (!isAheadOfUtc) return; // CI runs in UTC; this comparison only applies locally
    expect(toLocalIsoDate(d)).not.toBe(d.toISOString().slice(0, 10));
  });
});
