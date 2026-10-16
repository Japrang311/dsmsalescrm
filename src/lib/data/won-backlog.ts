import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { ClientStatus } from "@/lib/domain";

const numeric = z
  .union([z.number(), z.string()])
  .transform(Number)
  .pipe(z.number().finite());
const nullableString = z.string().nullable();
const status = z.enum(["missing", "linked", "deleted_link"]);

const requestedStateSchema = z.object({
  documentId: z.string(),
  status,
  salesOrderId: nullableString,
  salesOrderNumber: nullableString,
  salesOrderDeletedAt: nullableString,
});

const snapshotSchema = z.object({
  fetchedAt: z.string(),
  totals: z.object({
    exceptionCount: numeric,
    exceptionValue: numeric,
    missingCount: numeric,
    missingValue: numeric,
    deletedLinkCount: numeric,
    deletedLinkValue: numeric,
  }),
  page: z.object({
    limit: numeric,
    offset: numeric,
    totalCount: numeric,
  }),
  items: z.array(
    z.object({
      documentId: z.string(),
      quotationNumber: nullableString,
      clientId: z.string(),
      clientName: z.string(),
      ownerId: z.string(),
      ownerName: z.string(),
      documentDate: z.string(),
      updatedAt: z.string(),
      totalValue: numeric,
      status: z.enum(["missing", "deleted_link"]),
      salesOrderId: nullableString,
      salesOrderNumber: nullableString,
      salesOrderDeletedAt: nullableString,
    }),
  ),
  requestedStates: z.array(requestedStateSchema),
});

export type WonBacklogSnapshot = z.infer<typeof snapshotSchema>;
export type WonBacklogRequestedState = z.infer<typeof requestedStateSchema>;

export type WonBacklogScope = {
  ownerId?: string;
  clientStatus?: ClientStatus;
  documentIds?: readonly string[];
};

function valuesMatch(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-9;
}

export function normalizeWonBacklogSnapshot(
  input: unknown,
): WonBacklogSnapshot {
  const snapshot = snapshotSchema.parse(input);
  const { totals, page, items, requestedStates } = snapshot;
  if (
    totals.exceptionCount !== totals.missingCount + totals.deletedLinkCount ||
    !valuesMatch(
      totals.exceptionValue,
      totals.missingValue + totals.deletedLinkValue,
    ) ||
    page.totalCount !== totals.exceptionCount ||
    items.length > page.limit ||
    new Set(items.map((item) => item.documentId)).size !== items.length ||
    new Set(requestedStates.map((item) => item.documentId)).size !==
      requestedStates.length
  ) {
    throw new Error("WON_BACKLOG_SNAPSHOT_MISMATCH");
  }
  return snapshot;
}

export function wonBacklogQueryKey(scope: WonBacklogScope = {}) {
  return [
    "sales-orders",
    "won-backlog",
    {
      ownerId: scope.ownerId ?? null,
      clientStatus: scope.clientStatus ?? null,
      documentIds: [...(scope.documentIds ?? [])].sort(),
    },
  ] as const;
}

export async function getWonBacklog(
  scope: WonBacklogScope = {},
  page: { limit?: number; offset?: number } = {},
): Promise<WonBacklogSnapshot> {
  const documentIds = [...new Set(scope.documentIds ?? [])];
  const { data, error } = await supabase.rpc("crm_won_without_so_backlog", {
    p_owner_id: scope.ownerId ?? null,
    p_client_status: scope.clientStatus ?? null,
    p_document_ids: documentIds.length > 0 ? documentIds : null,
    p_limit: page.limit ?? 100,
    p_offset: page.offset ?? 0,
  });
  if (error) throw error;
  if (!data) throw new Error("Backlog Won tanpa SO tidak tersedia");
  return normalizeWonBacklogSnapshot(data);
}
