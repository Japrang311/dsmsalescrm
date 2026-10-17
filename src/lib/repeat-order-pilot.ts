import { REPEAT_ORDER_RULE_VERSION } from "./repeat-order-cadence";

export type RepeatOrderFalsePositiveCategory = "seasonal" | "project" | "other";

export type RepeatOrderPilotFeedback = {
  id: string;
  clientId: string;
  actorId: string;
  ruleVersion: string;
  feedback: "relevant" | "not_relevant";
  reason: string;
  falsePositiveCategory?: RepeatOrderFalsePositiveCategory;
  createdAt: string;
};

export type RepeatOrderPilotCohort = {
  asOfDate: string;
  baselineBusinessDays: number;
  candidateCount: number;
  overdueClientIds: readonly string[];
  ruleVersion: typeof REPEAT_ORDER_RULE_VERSION;
};

export type RepeatOrderPilotSummary = {
  asOfDate: string;
  baselineBusinessDays: number;
  ruleVersion: typeof REPEAT_ORDER_RULE_VERSION;
  candidateCount: number;
  overdueCount: number;
  feedbackEventCount: number;
  reviewedClientCount: number;
  unreviewedOverdueCount: number;
  relevantCount: number;
  notRelevantCount: number;
  relevanceRate: number | null;
  reviewerCount: number;
  falsePositiveCounts: Record<
    RepeatOrderFalsePositiveCategory | "uncategorized",
    number
  >;
};

export type RepeatOrderPilotDecision = "retain" | "tune" | "stop";

export type RepeatOrderPilotDecisionBlocker =
  | "BASELINE_TOO_SHORT"
  | "SALES_REVIEW_REQUIRED"
  | "FEEDBACK_SAMPLE_REQUIRED"
  | "UNREVIEWED_OVERDUE_CLIENTS"
  | "FALSE_POSITIVE_CLASSIFICATION_REQUIRED"
  | "REVENUE_CAUSAL_CLAIM_FORBIDDEN";

function latestFeedbackByClient(
  feedback: readonly RepeatOrderPilotFeedback[],
): Map<string, RepeatOrderPilotFeedback> {
  const latest = new Map<string, RepeatOrderPilotFeedback>();
  for (const event of feedback) {
    const timestamp = Date.parse(event.createdAt);
    if (!Number.isFinite(timestamp)) {
      throw new Error("INVALID_PILOT_FEEDBACK_TIMESTAMP");
    }
    const current = latest.get(event.clientId);
    if (
      !current ||
      timestamp > Date.parse(current.createdAt) ||
      (timestamp === Date.parse(current.createdAt) && event.id > current.id)
    ) {
      latest.set(event.clientId, event);
    }
  }
  return latest;
}

export function analyzeRepeatOrderPilot({
  cohort,
  feedback,
}: {
  cohort: RepeatOrderPilotCohort;
  feedback: readonly RepeatOrderPilotFeedback[];
}): RepeatOrderPilotSummary {
  const overdueClientIds = new Set(cohort.overdueClientIds);
  if (
    cohort.baselineBusinessDays < 0 ||
    cohort.candidateCount < 0 ||
    overdueClientIds.size !== cohort.overdueClientIds.length ||
    overdueClientIds.size > cohort.candidateCount
  ) {
    throw new Error("INVALID_PILOT_COHORT");
  }
  if (
    cohort.ruleVersion !== REPEAT_ORDER_RULE_VERSION ||
    feedback.some((event) => event.ruleVersion !== cohort.ruleVersion)
  ) {
    throw new Error("PILOT_RULE_VERSION_MISMATCH");
  }
  if (feedback.some((event) => !overdueClientIds.has(event.clientId))) {
    throw new Error("PILOT_FEEDBACK_OUTSIDE_COHORT");
  }

  const latestFeedback = [...latestFeedbackByClient(feedback).values()];
  const relevantCount = latestFeedback.filter(
    (event) => event.feedback === "relevant",
  ).length;
  const notRelevant = latestFeedback.filter(
    (event) => event.feedback === "not_relevant",
  );
  const falsePositiveCounts: RepeatOrderPilotSummary["falsePositiveCounts"] = {
    seasonal: 0,
    project: 0,
    other: 0,
    uncategorized: 0,
  };
  for (const event of notRelevant) {
    falsePositiveCounts[event.falsePositiveCategory ?? "uncategorized"] += 1;
  }

  const reviewedClientCount = latestFeedback.length;
  return {
    asOfDate: cohort.asOfDate,
    baselineBusinessDays: cohort.baselineBusinessDays,
    ruleVersion: cohort.ruleVersion,
    candidateCount: cohort.candidateCount,
    overdueCount: overdueClientIds.size,
    feedbackEventCount: feedback.length,
    reviewedClientCount,
    unreviewedOverdueCount: overdueClientIds.size - reviewedClientCount,
    relevantCount,
    notRelevantCount: notRelevant.length,
    relevanceRate:
      reviewedClientCount === 0 ? null : relevantCount / reviewedClientCount,
    reviewerCount: new Set(latestFeedback.map((event) => event.actorId)).size,
    falsePositiveCounts,
  };
}

export function assessRepeatOrderPilotDecision(
  summary: RepeatOrderPilotSummary,
  input: {
    decision: RepeatOrderPilotDecision;
    reviewedBySales: boolean;
    claimsRevenueImpact: boolean;
  },
): {
  decision: RepeatOrderPilotDecision;
  readyForHumanDecision: boolean;
  blockers: RepeatOrderPilotDecisionBlocker[];
} {
  const blockers: RepeatOrderPilotDecisionBlocker[] = [];
  if (summary.baselineBusinessDays < 10) blockers.push("BASELINE_TOO_SHORT");
  if (!input.reviewedBySales) blockers.push("SALES_REVIEW_REQUIRED");
  if (summary.reviewedClientCount === 0) {
    blockers.push("FEEDBACK_SAMPLE_REQUIRED");
  }
  if (summary.unreviewedOverdueCount > 0) {
    blockers.push("UNREVIEWED_OVERDUE_CLIENTS");
  }
  if (summary.falsePositiveCounts.uncategorized > 0) {
    blockers.push("FALSE_POSITIVE_CLASSIFICATION_REQUIRED");
  }
  if (input.claimsRevenueImpact) {
    blockers.push("REVENUE_CAUSAL_CLAIM_FORBIDDEN");
  }
  return {
    decision: input.decision,
    readyForHumanDecision: blockers.length === 0,
    blockers,
  };
}
