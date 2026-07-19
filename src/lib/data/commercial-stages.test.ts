import { describe, expect, test } from "bun:test";
import { COMMERCIAL_STAGE_WEIGHTS, forecastValue } from "./commercial-stages";

describe("commercial stage weights", () => {
  test("covers every accepted weighted stage", () => {
    expect(COMMERCIAL_STAGE_WEIGHTS).toEqual({
      "Client Request for Quotes": 0.15,
      "Quotes Sent": 0.3,
      Negotiation: 0.55,
      "Hot Prospect": 0.75,
      Commit: 0.9,
      "Closed Won": 1,
      "Closed Lost": 0,
    });
  });

  test("calculates weighted forecast and reports unmapped history as unavailable", () => {
    expect(forecastValue(1_000_000, "Negotiation")).toBe(550_000);
    expect(forecastValue(1_000_000, "Closed Lost")).toBe(0);
    expect(forecastValue(1_000_000, "Quotation Sent")).toBeNull();
  });
});
