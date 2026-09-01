import { describe, expect, test } from "bun:test";
import { canUseAiSummary } from "@/lib/ai/access";
import { authorize, factsForRole, mapGatewayError } from "./summary-server";
import { buildSummaryPrompt } from "@/lib/ai/summary-prompt";
import type { SummaryFacts } from "@/lib/ai/summary-facts";

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
            data: { email: ALLOWED_EMAIL, status: "active", role: "manager" },
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

  test("returns the authenticated user id and the database role on success", async () => {
    const result = await authorize("token-abc", activeAllowedProfileClient);
    expect(result).toEqual({ userId: "user-123", role: "manager" });
  });

  test("returns null for a role that is not manager or executive", async () => {
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
              data: { email: ALLOWED_EMAIL, status: "active", role: "sales" },
              error: null,
            }),
          }),
        }),
      }),
    };
    expect(await authorize("token-abc", () => client)).toBeNull();
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
              data: {
                email: ALLOWED_EMAIL,
                status: "inactive",
                role: "manager",
              },
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
              data: {
                email: "feni@dutasolusimetalindo.com",
                status: "active",
                role: "manager",
              },
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

describe("client-supplied audience cannot override the database role", () => {
  const forgedManagerFacts: SummaryFacts = {
    // An executive hand-builds this body: claims manager audience and
    // populates the two manager-only sections.
    audience: "manager",
    periodLabel: "Agustus 2026",
    generatedAtLabel: "31 Agu 2026, 14:30",
    revenue: {
      actualLabel: "Rp 2,1 M",
      targetLabel: "Rp 2,8 M",
      attainmentLabel: "75%",
      ppnLabel: "Rp 1,4 M",
      nonPpnLabel: "Rp 0,7 M",
    },
    topCustomers: [{ name: "PT Karya Utama", revenueLabel: "Rp 800 jt" }],
    risk: {
      overdueTaskCountLabel: "7 task",
      bigPendingCommitCountLabel: "3 dokumen",
      bigPendingCommitValueLabel: "Rp 480 jt",
      dormantHighValueClientCountLabel: "2 client",
    },
    funnel: {
      winRateLabel: "42%",
      openValueLabel: "Rp 3,1 M",
      stages: [
        {
          stage: "Negosiasi",
          countLabel: "12 item",
          openValueLabel: "Rp 3,1 M",
        },
      ],
    },
    salesPerformance: [
      {
        name: "Budi Santoso",
        revenueLabel: "Rp 900 jt",
        targetLabel: "Rp 700 jt",
        attainmentLabel: "129%",
      },
    ],
    escalatedTasks: [
      { ownerName: "Budi Santoso", title: "Follow up PT Karya Utama" },
    ],
  };

  test("the database role replaces the posted audience", () => {
    const server = factsForRole(forgedManagerFacts, "executive");
    expect(server.audience).toBe("executive");
  });

  test("no sales name reaches the model for an executive session", () => {
    const { system, prompt } = buildSummaryPrompt(
      factsForRole(forgedManagerFacts, "executive"),
    );
    expect(prompt).not.toContain("Budi Santoso");
    expect(system).toContain("jangan menyebut nama sales");
  });

  test("a genuine manager session is unaffected", () => {
    const { prompt } = buildSummaryPrompt(
      factsForRole(forgedManagerFacts, "manager"),
    );
    expect(prompt).toContain("Budi Santoso");
  });
});
