import { describe, expect, test } from "bun:test";

import { PROVINCES, REGENCIES } from "./indonesia-regions";

describe("indonesia-regions", () => {
  test("has all 38 current provinces (post-2022 Papua pemekaran)", () => {
    expect(PROVINCES).toHaveLength(38);
  });

  test("has all 514 official kabupaten/kota", () => {
    expect(REGENCIES).toHaveLength(514);
  });

  test("every regency's provinceCode points to a real province", () => {
    const provinceCodes = new Set(PROVINCES.map((p) => p.code));
    for (const regency of REGENCIES) {
      expect(provinceCodes.has(regency.provinceCode)).toBe(true);
    }
  });

  test("province and regency codes are unique", () => {
    expect(new Set(PROVINCES.map((p) => p.code)).size).toBe(PROVINCES.length);
    expect(new Set(REGENCIES.map((r) => r.code)).size).toBe(REGENCIES.length);
  });
});
