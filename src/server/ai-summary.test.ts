import { describe, expect, test } from "bun:test";
import { canUseAiSummary } from "@/lib/ai/access";
import { mapGatewayError } from "./ai-summary";

describe("mapGatewayError", () => {
  test("maps budget exhaustion to a plain Indonesian message", () => {
    expect(mapGatewayError(402)).toContain("Kuota");
  });

  test("maps rate limiting", () => {
    expect(mapGatewayError(429)).toContain("Terlalu sering");
  });

  test("maps service unavailability", () => {
    expect(mapGatewayError(503)).toContain("bermasalah");
  });

  test("falls back to a generic message for anything else", () => {
    expect(mapGatewayError(undefined)).toBeTruthy();
    expect(mapGatewayError(418)).toBeTruthy();
  });
});

describe("server gate reuses the shared allow list", () => {
  test("a non-pilot account is rejected by the same predicate the UI uses", () => {
    expect(canUseAiSummary("feni@dutasolusimetalindo.com")).toBe(false);
  });
});
