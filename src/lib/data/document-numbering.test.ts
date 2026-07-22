import { describe, expect, test } from "bun:test";

import {
  documentNumberExample,
  parseDocumentNumber,
  yearCode,
} from "./document-numbering";

describe("document numbering guides", () => {
  const date = new Date("2026-07-22T00:00:00.000Z");

  test("builds year-aware format examples", () => {
    expect(yearCode(date)).toBe("26");
    expect(documentNumberExample("QUO", date)).toBe("DSM-26QUO-0000");
    expect(documentNumberExample("SO", date)).toBe("DSM-26SO000");
    expect(documentNumberExample("NP", date)).toBe("DSM-26NP001");
    expect(documentNumberExample("PROTY", date)).toBe("DSM-26PROTY000");
  });

  test("examples remain compatible with document number parser", () => {
    expect(
      parseDocumentNumber(documentNumberExample("QUO", date))?.series,
    ).toBe("QUO");
    expect(parseDocumentNumber(documentNumberExample("SO", date))?.series).toBe(
      "SO",
    );
    expect(parseDocumentNumber(documentNumberExample("NP", date))?.series).toBe(
      "NP",
    );
    expect(
      parseDocumentNumber(documentNumberExample("PROTY", date))?.series,
    ).toBe("PROTY");
  });
});
