import { describe, expect, test } from "bun:test";
import { compareSalesOrdersByNewestNumber } from "./sales-orders";

const order = (date: string, soNumber: string, createdAt = date) => ({
  date,
  soNumber,
  createdAt,
});

describe("compareSalesOrdersByNewestNumber", () => {
  test("sorts by descending natural SO number before date", () => {
    const sorted = [
      order("2026-07-01", "DSM-26SO99"),
      order("2026-08-01", "DSM-26SO001"),
      order("2026-07-01", "DSM-26SO100"),
      order("2026-07-01", "DSM-26SO152"),
      order("2026-07-01", "DSM-26SO151"),
    ].sort(compareSalesOrdersByNewestNumber);

    expect(sorted.map((item) => item.soNumber)).toEqual([
      "DSM-26SO152",
      "DSM-26SO151",
      "DSM-26SO100",
      "DSM-26SO99",
      "DSM-26SO001",
    ]);
  });
});
