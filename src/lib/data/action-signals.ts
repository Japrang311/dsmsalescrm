import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { CRM_SIGNAL_RULES, type CrmSignalRuleId } from "@/lib/crm-signal-rules";
import type { ClientStatus } from "@/lib/domain";

const numeric = z
  .union([z.number(), z.string()])
  .transform(Number)
  .pipe(z.number().finite());
const integer = numeric.pipe(z.number().int().nonnegative());
const nullableDate = z.string().nullable();
const ruleId = z.enum([
  "won_without_so",
  "expected_close_overdue",
  "quotation_expiry_due",
  "deal_stagnant",
]);

const cursorSchema = z.object({
  priority: z.number().int().min(1),
  dueDate: nullableDate,
  valueKnown: z.boolean(),
  value: numeric.nullable(),
  entityId: z.string().uuid(),
  ruleId,
});

const itemSchema = z.object({
  entityId: z.string().uuid(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  ownerId: z.string().uuid(),
  ownerName: z.string(),
  quotationNumber: z.string().nullable(),
  stage: z.string(),
  ruleId,
  state: z.enum(["active", "data_insufficient"]),
  dataState: z.enum(["complete", "data_insufficient"]),
  priority: z.number().int().min(1),
  reason: z.string().min(1),
  baseDate: nullableDate,
  dueDate: nullableDate,
  ageDays: integer.nullable(),
  thresholdDays: integer.nullable(),
  totalValue: numeric.nullable(),
  latestFeedback: z.enum(["relevant", "not_relevant"]).nullable(),
  feedbackReason: z.string().nullable(),
  feedbackRuleVersion: z.literal("d06-v1").nullable(),
  sourceHref: z.string().startsWith("/quotations/"),
});

const actionResultSchema = z.object({
  id: z.string().uuid(),
  entityId: z.string().uuid(),
  ruleId,
  ownerId: z.string().uuid(),
  actorId: z.string().uuid(),
  actionType: z.enum(["snooze", "feedback"]),
  reason: z.string().min(1),
  snoozedUntil: nullableDate,
  feedback: z.enum(["relevant", "not_relevant"]).nullable(),
  ruleVersion: z.literal("d06-v1"),
  createdAt: z.string(),
});

const snapshotSchema = z.object({
  asOfDate: z.string(),
  fetchedAt: z.string(),
  totals: z.object({
    totalCount: integer,
    activeCount: integer,
    dataInsufficientCount: integer,
    incompleteEvidenceCount: integer,
    snoozedCount: integer,
    byRule: z.record(ruleId, integer),
  }),
  page: z.object({
    limit: z.number().int().min(1).max(100),
    returnedCount: integer,
  }),
  nextCursor: cursorSchema.nullable(),
  items: z.array(itemSchema),
});

export type ActionSignalsSnapshot = z.infer<typeof snapshotSchema>;
export type ActionSignalCursor = z.infer<typeof cursorSchema>;
export type ActionSignalItem = z.infer<typeof itemSchema>;
export type ActionSignalActionResult = z.infer<typeof actionResultSchema>;

export type ActionSignalActionInput = {
  requestId: string;
  entityId: string;
  ruleId: CrmSignalRuleId;
  reason: string;
} & (
  | { actionType: "snooze"; snoozedUntil: string }
  | { actionType: "feedback"; feedback: "relevant" | "not_relevant" }
);

export type ActionSignalScope = {
  ownerId?: string;
  clientStatus?: ClientStatus;
};

function cursorMatchesItem(
  cursor: ActionSignalCursor,
  item: ActionSignalItem,
): boolean {
  return (
    cursor.priority === item.priority &&
    cursor.dueDate === item.dueDate &&
    cursor.valueKnown === (item.totalValue !== null) &&
    cursor.value === item.totalValue &&
    cursor.entityId === item.entityId &&
    cursor.ruleId === item.ruleId
  );
}

export function normalizeActionSignalsSnapshot(
  input: unknown,
): ActionSignalsSnapshot {
  const snapshot = snapshotSchema.parse(input);
  const { totals, page, items, nextCursor } = snapshot;
  const ruleTotal = Object.values(totals.byRule).reduce(
    (sum, count) => sum + count,
    0,
  );
  const uniqueItems = new Set(
    items.map((item) => `${item.entityId}:${item.ruleId}`),
  );
  const semanticMismatch = items.some((item) => {
    const definition = CRM_SIGNAL_RULES[item.ruleId as CrmSignalRuleId];
    return (
      item.priority !== definition.priority ||
      item.thresholdDays !== definition.thresholdDays
    );
  });

  if (
    totals.totalCount !== totals.activeCount + totals.dataInsufficientCount ||
    totals.totalCount !== ruleTotal ||
    totals.incompleteEvidenceCount > totals.totalCount ||
    page.returnedCount !== items.length ||
    items.length > page.limit ||
    uniqueItems.size !== items.length ||
    semanticMismatch ||
    (nextCursor !== null &&
      (items.length === 0 ||
        !cursorMatchesItem(nextCursor, items[items.length - 1])))
  ) {
    throw new Error("ACTION_SIGNAL_SNAPSHOT_MISMATCH");
  }
  return snapshot;
}

export function normalizeActionSignalActionResult(
  input: unknown,
): ActionSignalActionResult {
  return actionResultSchema.parse(input);
}

export function actionSignalsQueryKey(scope: ActionSignalScope = {}) {
  return [
    "crm-action-signals",
    {
      ownerId: scope.ownerId ?? null,
      clientStatus: scope.clientStatus ?? null,
    },
  ] as const;
}

export async function getActionSignals(
  scope: ActionSignalScope = {},
  page: { limit?: number; after?: ActionSignalCursor | null } = {},
  asOfDate?: string,
): Promise<ActionSignalsSnapshot> {
  const { data, error } = await supabase.rpc("crm_action_signals", {
    p_as_of: asOfDate ?? null,
    p_owner_id: scope.ownerId ?? null,
    p_client_status: scope.clientStatus ?? null,
    p_limit: page.limit ?? 50,
    p_after: page.after ?? null,
  });
  if (error) throw error;
  if (!data) throw new Error("Antrean exception tidak tersedia");
  return normalizeActionSignalsSnapshot(data);
}

export async function recordActionSignalAction(
  input: ActionSignalActionInput,
): Promise<ActionSignalActionResult> {
  const { data, error } = await supabase.rpc(
    "record_crm_action_signal_action",
    {
      p_request_id: input.requestId,
      p_entity_id: input.entityId,
      p_rule_id: input.ruleId,
      p_action_type: input.actionType,
      p_reason: input.reason.trim(),
      p_snoozed_until:
        input.actionType === "snooze" ? input.snoozedUntil : null,
      p_feedback: input.actionType === "feedback" ? input.feedback : null,
    },
  );
  if (error) throw error;
  if (!data) throw new Error("Aksi sinyal tidak menghasilkan bukti simpan");
  return normalizeActionSignalActionResult(data);
}
