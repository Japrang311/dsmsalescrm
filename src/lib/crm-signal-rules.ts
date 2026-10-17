export type CrmSignalCandidate = {
  entityId: string;
  stage: string;
  asOfDate: string;
  expectedCloseDate: string | null;
  quotationExpiredDate: string | null;
  lastMeaningfulProgressDate: string | null;
  wonEventDate: string | null;
  hasActiveSalesOrder: boolean;
};

export const CRM_SIGNAL_RULES = {
  won_without_so: { priority: 1, thresholdDays: null },
  expected_close_overdue: { priority: 1, thresholdDays: null },
  quotation_expiry_due: { priority: 2, thresholdDays: 7 },
  deal_stagnant: { priority: 4, thresholdDays: 14 },
} as const;

export type CrmSignalRuleId = keyof typeof CRM_SIGNAL_RULES;
export type CrmSignalState = "active" | "data_insufficient";
export type CrmSignalDataState = "complete" | "data_insufficient";

export type CrmSignalEvaluation = {
  ruleId: CrmSignalRuleId;
  priority: number;
  state: CrmSignalState;
  dataState: CrmSignalDataState;
  reason: string;
  baseDate: string | null;
  dueDate: string | null;
  ageDays: number | null;
  thresholdDays: number | null;
};

const OPEN_STAGES = new Set([
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
]);

function dateToDay(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`INVALID_SIGNAL_DATE:${date}`);
  const day = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (new Date(day).toISOString().slice(0, 10) !== date) {
    throw new Error(`INVALID_SIGNAL_DATE:${date}`);
  }
  return day / 86_400_000;
}

function daysBetween(later: string, earlier: string): number {
  return dateToDay(later) - dateToDay(earlier);
}

function addDays(date: string, days: number): string {
  return new Date((dateToDay(date) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function evaluateCrmSignalCandidate(
  candidate: CrmSignalCandidate,
): CrmSignalEvaluation[] {
  const signals: CrmSignalEvaluation[] = [];

  if (candidate.stage === "Closed Won") {
    if (!candidate.hasActiveSalesOrder) {
      const ageDays = candidate.wonEventDate
        ? daysBetween(candidate.asOfDate, candidate.wonEventDate)
        : null;
      signals.push({
        ruleId: "won_without_so",
        priority: CRM_SIGNAL_RULES.won_without_so.priority,
        state: "active",
        dataState: candidate.wonEventDate ? "complete" : "data_insufficient",
        reason: candidate.wonEventDate
          ? `Closed Won ${ageDays} hari tanpa Sales Order aktif.`
          : "Won tanpa Sales Order aktif; tanggal Won belum tersedia dari event valid.",
        baseDate: candidate.wonEventDate,
        dueDate: candidate.wonEventDate,
        ageDays,
        thresholdDays: null,
      });
    }
    return signals;
  }

  if (!OPEN_STAGES.has(candidate.stage)) return signals;

  if (
    candidate.expectedCloseDate &&
    daysBetween(candidate.asOfDate, candidate.expectedCloseDate) > 0
  ) {
    const ageDays = daysBetween(
      candidate.asOfDate,
      candidate.expectedCloseDate,
    );
    signals.push({
      ruleId: "expected_close_overdue",
      priority: CRM_SIGNAL_RULES.expected_close_overdue.priority,
      state: "active",
      dataState: "complete",
      reason: `Expected close lewat ${ageDays} hari.`,
      baseDate: candidate.expectedCloseDate,
      dueDate: candidate.expectedCloseDate,
      ageDays,
      thresholdDays: null,
    });
  }

  if (candidate.quotationExpiredDate) {
    const daysUntilExpiry = daysBetween(
      candidate.quotationExpiredDate,
      candidate.asOfDate,
    );
    if (
      daysUntilExpiry <= CRM_SIGNAL_RULES.quotation_expiry_due.thresholdDays
    ) {
      signals.push({
        ruleId: "quotation_expiry_due",
        priority: CRM_SIGNAL_RULES.quotation_expiry_due.priority,
        state: "active",
        dataState: "complete",
        reason:
          daysUntilExpiry < 0
            ? `Quotation kedaluwarsa ${Math.abs(daysUntilExpiry)} hari lalu.`
            : daysUntilExpiry === 0
              ? "Quotation kedaluwarsa hari ini."
              : `Quotation kedaluwarsa dalam ${daysUntilExpiry} hari.`,
        baseDate: candidate.quotationExpiredDate,
        dueDate: candidate.quotationExpiredDate,
        ageDays: Math.max(0, -daysUntilExpiry),
        thresholdDays: CRM_SIGNAL_RULES.quotation_expiry_due.thresholdDays,
      });
    }
  }

  if (!candidate.lastMeaningfulProgressDate) {
    signals.push({
      ruleId: "deal_stagnant",
      priority: CRM_SIGNAL_RULES.deal_stagnant.priority,
      state: "data_insufficient",
      dataState: "data_insufficient",
      reason: "Data belum cukup: belum ada stage event atau follow-up valid.",
      baseDate: null,
      dueDate: null,
      ageDays: null,
      thresholdDays: CRM_SIGNAL_RULES.deal_stagnant.thresholdDays,
    });
  } else {
    const ageDays = daysBetween(
      candidate.asOfDate,
      candidate.lastMeaningfulProgressDate,
    );
    if (ageDays >= CRM_SIGNAL_RULES.deal_stagnant.thresholdDays) {
      signals.push({
        ruleId: "deal_stagnant",
        priority: CRM_SIGNAL_RULES.deal_stagnant.priority,
        state: "active",
        dataState: "complete",
        reason: `Tidak ada progress bermakna selama ${ageDays} hari.`,
        baseDate: candidate.lastMeaningfulProgressDate,
        dueDate: addDays(
          candidate.lastMeaningfulProgressDate,
          CRM_SIGNAL_RULES.deal_stagnant.thresholdDays,
        ),
        ageDays,
        thresholdDays: CRM_SIGNAL_RULES.deal_stagnant.thresholdDays,
      });
    }
  }

  return signals.sort(
    (left, right) =>
      left.priority - right.priority || left.ruleId.localeCompare(right.ruleId),
  );
}
