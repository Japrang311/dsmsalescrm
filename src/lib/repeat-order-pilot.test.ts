import { describe, expect, test } from "bun:test";

import {
  analyzeRepeatOrderPilot,
  assessRepeatOrderPilotDecision,
} from "./repeat-order-pilot";

const cohort = {
  asOfDate: "2026-10-18",
  baselineBusinessDays: 10,
  candidateCount: 8,
  overdueClientIds: [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
  ],
  ruleVersion: "d05-v1" as const,
};

describe("repeat-order pilot analysis", () => {
  test("uses the latest feedback per client and keeps explicit false-positive categories", () => {
    const summary = analyzeRepeatOrderPilot({
      cohort,
      feedback: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          clientId: "10000000-0000-4000-8000-000000000001",
          actorId: "20000000-0000-4000-8000-000000000001",
          ruleVersion: "d05-v1",
          feedback: "relevant",
          reason: "Perlu dihubungi",
          createdAt: "2026-10-17T08:00:00Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          clientId: "10000000-0000-4000-8000-000000000001",
          actorId: "20000000-0000-4000-8000-000000000001",
          ruleVersion: "d05-v1",
          feedback: "not_relevant",
          reason: "Pembelian tahunan",
          falsePositiveCategory: "seasonal",
          createdAt: "2026-10-18T08:00:00Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000003",
          clientId: "10000000-0000-4000-8000-000000000002",
          actorId: "20000000-0000-4000-8000-000000000002",
          ruleVersion: "d05-v1",
          feedback: "relevant",
          reason: "Cadence sesuai",
          createdAt: "2026-10-18T09:00:00Z",
        },
      ],
    });

    expect(summary).toEqual({
      asOfDate: "2026-10-18",
      baselineBusinessDays: 10,
      ruleVersion: "d05-v1",
      candidateCount: 8,
      overdueCount: 3,
      feedbackEventCount: 3,
      reviewedClientCount: 2,
      unreviewedOverdueCount: 1,
      relevantCount: 1,
      notRelevantCount: 1,
      relevanceRate: 0.5,
      reviewerCount: 2,
      falsePositiveCounts: {
        seasonal: 1,
        project: 0,
        other: 0,
        uncategorized: 0,
      },
    });
  });

  test("keeps uncategorized false positives visible instead of inferring from free text", () => {
    const summary = analyzeRepeatOrderPilot({
      cohort: {
        ...cohort,
        overdueClientIds: ["10000000-0000-4000-8000-000000000004"],
      },
      feedback: [
        {
          id: "00000000-0000-4000-8000-000000000004",
          clientId: "10000000-0000-4000-8000-000000000004",
          actorId: "20000000-0000-4000-8000-000000000001",
          ruleVersion: "d05-v1",
          feedback: "not_relevant",
          reason: "Ini proyek musiman",
          createdAt: "2026-10-18T10:00:00Z",
        },
      ],
    });

    expect(summary.falsePositiveCounts).toEqual({
      seasonal: 0,
      project: 0,
      other: 0,
      uncategorized: 1,
    });
  });

  test("rejects mixed rule versions so threshold changes cannot contaminate one cohort", () => {
    expect(() =>
      analyzeRepeatOrderPilot({
        cohort,
        feedback: [
          {
            id: "00000000-0000-4000-8000-000000000005",
            clientId: "10000000-0000-4000-8000-000000000005",
            actorId: "20000000-0000-4000-8000-000000000001",
            ruleVersion: "d05-v2",
            feedback: "relevant",
            reason: "Versi berbeda",
            createdAt: "2026-10-18T11:00:00Z",
          },
        ],
      }),
    ).toThrow("PILOT_RULE_VERSION_MISMATCH");
  });
});

describe("repeat-order pilot decision gate", () => {
  test("permits review only after baseline, Sales feedback, and false-positive classification are present", () => {
    const summary = analyzeRepeatOrderPilot({
      cohort: {
        ...cohort,
        overdueClientIds: ["10000000-0000-4000-8000-000000000006"],
      },
      feedback: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          clientId: "10000000-0000-4000-8000-000000000006",
          actorId: "20000000-0000-4000-8000-000000000001",
          ruleVersion: "d05-v1",
          feedback: "not_relevant",
          reason: "Pesanan proyek satu kali",
          falsePositiveCategory: "project",
          createdAt: "2026-10-18T12:00:00Z",
        },
      ],
    });

    expect(
      assessRepeatOrderPilotDecision(summary, {
        decision: "tune",
        reviewedBySales: true,
        claimsRevenueImpact: false,
      }),
    ).toEqual({
      decision: "tune",
      readyForHumanDecision: true,
      blockers: [],
    });
  });

  test("blocks revenue claims, short baselines, missing Sales review, and uncategorized false positives", () => {
    const summary = analyzeRepeatOrderPilot({
      cohort: {
        ...cohort,
        baselineBusinessDays: 5,
        overdueClientIds: ["10000000-0000-4000-8000-000000000007"],
      },
      feedback: [
        {
          id: "00000000-0000-4000-8000-000000000007",
          clientId: "10000000-0000-4000-8000-000000000007",
          actorId: "20000000-0000-4000-8000-000000000001",
          ruleVersion: "d05-v1",
          feedback: "not_relevant",
          reason: "Tidak sesuai",
          createdAt: "2026-10-18T13:00:00Z",
        },
      ],
    });

    expect(
      assessRepeatOrderPilotDecision(summary, {
        decision: "retain",
        reviewedBySales: false,
        claimsRevenueImpact: true,
      }),
    ).toEqual({
      decision: "retain",
      readyForHumanDecision: false,
      blockers: [
        "BASELINE_TOO_SHORT",
        "SALES_REVIEW_REQUIRED",
        "FALSE_POSITIVE_CLASSIFICATION_REQUIRED",
        "REVENUE_CAUSAL_CLAIM_FORBIDDEN",
      ],
    });
  });
});
