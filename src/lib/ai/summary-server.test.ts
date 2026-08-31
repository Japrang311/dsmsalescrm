import { describe, expect, test } from "bun:test";
import { canUseAiSummary } from "@/lib/ai/access";
import { authorize, mapGatewayError } from "./summary-server";

const ALLOWED_EMAIL = "adhitya@dutasolusimetalindo.com";

function activeAllowedProfileClient() {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: { email: ALLOWED_EMAIL, status: "active" },
            error: null,
          }),
        }),
      }),
    }),
  };
}

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

describe("authorize", () => {
  test("returns null (not a thrown error) when the auth client throws", async () => {
    const throwingClient = {
      auth: {
        getUser: async () => {
          throw new Error("simulated network blip");
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };

    const result = await authorize("token-abc", () => throwingClient);
    expect(result).toBeNull();
  });

  test("returns the authenticated user id on success", async () => {
    const result = await authorize("token-abc", activeAllowedProfileClient);
    expect(result).toBe("user-123");
  });

  test("returns null when the session is invalid", async () => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
    expect(await authorize("token-abc", () => client)).toBeNull();
  });

  test("returns null when the profile lookup errors", async () => {
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: null,
              error: { message: "not found" },
            }),
          }),
        }),
      }),
    };
    expect(await authorize("token-abc", () => client)).toBeNull();
  });

  test("returns null when the profile is inactive", async () => {
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { email: ALLOWED_EMAIL, status: "inactive" },
              error: null,
            }),
          }),
        }),
      }),
    };
    expect(await authorize("token-abc", () => client)).toBeNull();
  });

  test("returns null when the email is off the allow list", async () => {
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { email: "feni@dutasolusimetalindo.com", status: "active" },
              error: null,
            }),
          }),
        }),
      }),
    };
    expect(await authorize("token-abc", () => client)).toBeNull();
  });

  test("returns null when no client can be built (e.g. missing env vars)", async () => {
    expect(await authorize("token-abc", () => null)).toBeNull();
  });
});
