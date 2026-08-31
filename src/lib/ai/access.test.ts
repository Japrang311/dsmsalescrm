import { describe, expect, test } from "bun:test";
import { AI_SUMMARY_ALLOWED_EMAILS, canUseAiSummary } from "./access";

describe("canUseAiSummary", () => {
  test("allows exactly the two pilot accounts", () => {
    expect(canUseAiSummary("adhitya@dutasolusimetalindo.com")).toBe(true);
    expect(canUseAiSummary("triyanto@dutasolusimetalindo.com")).toBe(true);
    expect(AI_SUMMARY_ALLOWED_EMAILS).toHaveLength(2);
  });

  test("is case-insensitive and ignores surrounding whitespace", () => {
    expect(canUseAiSummary("ADHITYA@dutasolusimetalindo.com")).toBe(true);
    expect(canUseAiSummary("  Triyanto@DutaSolusiMetalindo.com  ")).toBe(true);
  });

  test("rejects everyone else", () => {
    expect(canUseAiSummary("leli@dutasolusimetalindo.com")).toBe(false);
    expect(canUseAiSummary("iman@dutasolusimetalindo.com")).toBe(false);
    expect(canUseAiSummary("")).toBe(false);
    expect(canUseAiSummary(null)).toBe(false);
    expect(canUseAiSummary(undefined)).toBe(false);
  });

  test("rejects a lookalike address that merely contains an allowed one", () => {
    expect(canUseAiSummary("adhitya@dutasolusimetalindo.com.evil.test")).toBe(
      false,
    );
    expect(canUseAiSummary("xadhitya@dutasolusimetalindo.com")).toBe(false);
  });
});
