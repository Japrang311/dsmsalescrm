import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { ClientStatus } from "@/lib/domain";
import {
  REPEAT_ORDER_MINIMUM_DATES,
  REPEAT_ORDER_RULE_VERSION,
  REPEAT_ORDER_WINDOW_DAYS,
} from "@/lib/repeat-order-cadence";

const numeric = z
  .union([z.number(), z.string()])
  .transform(Number)
  .pipe(z.number().finite().nonnegative());
const integer = numeric.pipe(z.number().int());
const nullableNumeric = numeric.nullable();
const nullableDate = z.string().nullable();
const clientStatus = z.enum([
  "Prospect",
  "Active Customer",
  "Dormant",
  "Lost",
  "Repeat Order",
]);

const itemSchema = z.object({
  clientId: z.string().uuid(),
  clientName: z.string().min(1),
  ownerId: z.string().uuid(),
  ownerName: z.string().min(1),
  clientStatus,
  ruleVersion: z.literal(REPEAT_ORDER_RULE_VERSION),
  historyWindowStartDate: z.string(),
  historyWindowEndDate: z.string(),
  historyObservedFrom: z.string(),
  historyCoverage: z.enum(["full_window", "partial_window"]),
  sampleCount: integer,
  intervalCount: integer,
  lastOrderDate: nullableDate,
  medianIntervalDays: nullableNumeric,
  daysSinceLastOrder: integer.nullable(),
  overdueThresholdDays: nullableNumeric,
  overdueByDays: nullableNumeric,
  state: z.enum(["overdue", "on_cadence", "data_insufficient"]),
  reason: z.string().min(1),
  latestFeedback: z.enum(["relevant", "not_relevant"]).nullable().default(null),
  feedbackReason: z.string().nullable().default(null),
  feedbackRuleVersion: z
    .literal(REPEAT_ORDER_RULE_VERSION)
    .nullable()
    .default(null),
  sourceHref: z.string().startsWith("/clients/"),
});

const feedbackResultSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  ownerId: z.string().uuid(),
  actorId: z.string().uuid(),
  feedback: z.enum(["relevant", "not_relevant"]),
  reason: z.string().min(1),
  ruleVersion: z.literal(REPEAT_ORDER_RULE_VERSION),
  createdAt: z.string(),
});

const snapshotSchema = z.object({
  asOfDate: z.string(),
  fetchedAt: z.string(),
  ruleVersion: z.literal(REPEAT_ORDER_RULE_VERSION),
  historyWindow: z.object({
    days: z.literal(REPEAT_ORDER_WINDOW_DAYS),
    startDate: z.string(),
    endDate: z.string(),
  }),
  totals: z.object({
    candidateCount: integer,
    overdueCount: integer,
    onCadenceCount: integer,
    dataInsufficientCount: integer,
    partialHistoryCount: integer,
  }),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative(),
    returnedCount: integer,
    totalCount: integer,
  }),
  items: z.array(itemSchema),
});

export type RepeatOrderSnapshot = z.infer<typeof snapshotSchema>;
export type RepeatOrderCadenceItem = z.infer<typeof itemSchema>;
export type RepeatOrderFeedbackResult = z.infer<typeof feedbackResultSchema>;

export type RepeatOrderScope = {
  ownerId?: string;
  clientStatus?: ClientStatus;
  clientId?: string;
};

export type RepeatOrderFeedbackInput = {
  requestId: string;
  clientId: string;
  feedback: "relevant" | "not_relevant";
  reason: string;
  asOfDate?: string;
};

function closeEnough(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-9;
}

function itemIsConsistent(
  item: RepeatOrderCadenceItem,
  snapshot: RepeatOrderSnapshot,
): boolean {
  const expectedCoverage =
    item.historyObservedFrom <= item.historyWindowStartDate
      ? "full_window"
      : "partial_window";
  if (
    item.ruleVersion !== snapshot.ruleVersion ||
    item.historyWindowStartDate !== snapshot.historyWindow.startDate ||
    item.historyWindowEndDate !== snapshot.historyWindow.endDate ||
    item.historyCoverage !== expectedCoverage ||
    item.intervalCount !== Math.max(item.sampleCount - 1, 0) ||
    item.sourceHref !== `/clients/${item.clientId}`
  ) {
    return false;
  }

  if (item.state === "data_insufficient") {
    return (
      item.sampleCount < REPEAT_ORDER_MINIMUM_DATES &&
      item.medianIntervalDays === null &&
      item.overdueThresholdDays === null &&
      item.overdueByDays === null &&
      item.reason.startsWith("Data belum cukup:")
    );
  }

  if (
    item.sampleCount < REPEAT_ORDER_MINIMUM_DATES ||
    item.lastOrderDate === null ||
    item.medianIntervalDays === null ||
    item.daysSinceLastOrder === null ||
    item.overdueThresholdDays === null ||
    item.overdueByDays === null
  ) {
    return false;
  }
  const expectedThreshold = Math.max(
    item.medianIntervalDays * 1.5,
    item.medianIntervalDays + 7,
  );
  const expectedOverdue = item.daysSinceLastOrder > expectedThreshold;
  return (
    closeEnough(item.overdueThresholdDays, expectedThreshold) &&
    item.state === (expectedOverdue ? "overdue" : "on_cadence") &&
    closeEnough(
      item.overdueByDays,
      expectedOverdue ? item.daysSinceLastOrder - expectedThreshold : 0,
    )
  );
}

export function normalizeRepeatOrderSnapshot(
  input: unknown,
): RepeatOrderSnapshot {
  const snapshot = snapshotSchema.parse(input);
  const { totals, page, items } = snapshot;
  if (
    totals.candidateCount !==
      totals.overdueCount +
        totals.onCadenceCount +
        totals.dataInsufficientCount ||
    totals.partialHistoryCount > totals.candidateCount ||
    page.totalCount !== totals.candidateCount ||
    page.returnedCount !== items.length ||
    items.length > page.limit ||
    new Set(items.map((item) => item.clientId)).size !== items.length ||
    snapshot.asOfDate !== snapshot.historyWindow.endDate ||
    items.some((item) => !itemIsConsistent(item, snapshot))
  ) {
    throw new Error("REPEAT_ORDER_SNAPSHOT_MISMATCH");
  }
  return snapshot;
}

export function repeatOrderQueryKey(scope: RepeatOrderScope = {}) {
  return [
    "crm-repeat-order-cadence",
    {
      ownerId: scope.ownerId ?? null,
      clientStatus: scope.clientStatus ?? null,
      clientId: scope.clientId ?? null,
    },
  ] as const;
}

export async function getRepeatOrderCadence(
  scope: RepeatOrderScope = {},
  page: { limit?: number; offset?: number } = {},
  asOfDate?: string,
): Promise<RepeatOrderSnapshot> {
  const { data, error } = await supabase.rpc("crm_repeat_order_cadence", {
    p_as_of: asOfDate ?? null,
    p_owner_id: scope.ownerId ?? null,
    p_client_status: scope.clientStatus ?? null,
    p_client_id: scope.clientId ?? null,
    p_limit: page.limit ?? 50,
    p_offset: page.offset ?? 0,
  });
  if (error) throw error;
  if (!data) throw new Error("Cadence repeat-order tidak tersedia");
  return normalizeRepeatOrderSnapshot(data);
}

export function normalizeRepeatOrderFeedbackResult(
  input: unknown,
): RepeatOrderFeedbackResult {
  return feedbackResultSchema.parse(input);
}

export async function recordRepeatOrderFeedback(
  input: RepeatOrderFeedbackInput,
): Promise<RepeatOrderFeedbackResult> {
  const { data, error } = await supabase.rpc(
    "record_crm_repeat_order_feedback",
    {
      p_request_id: input.requestId,
      p_client_id: input.clientId,
      p_feedback: input.feedback,
      p_reason: input.reason.trim(),
      p_as_of: input.asOfDate ?? null,
    },
  );
  if (error) throw error;
  if (!data)
    throw new Error("Feedback repeat-order tidak menghasilkan bukti simpan");
  return normalizeRepeatOrderFeedbackResult(data);
}
