import type { CommercialItem } from "@/lib/domain";
import {
  listCommercialDocuments,
  updateCommercialDocument,
  type CommercialDocumentWithItems,
} from "./commercial-documents";
import { forecastValue } from "./commercial-stages";

function toCompatibilityItem(
  document: CommercialDocumentWithItems,
): CommercialItem {
  const firstItem = document.items[0];
  return {
    id: document.id,
    clientId: document.clientId,
    ownerId: document.ownerId,
    type: document.type,
    sourceFlow: document.sourceFlow,
    stage: document.stage,
    description: firstItem?.description ?? firstItem?.productName ?? "",
    projectName: firstItem?.productName ?? undefined,
    estimatedValue: document.totalValue,
    updatedAt: document.updatedAt,
    rfqNumber: document.rfqNumber ?? undefined,
    quotationNumber: document.quotationNumber ?? undefined,
    quotationBaseNumber: document.quotationBaseNumber ?? undefined,
    quotationRevision: document.quotationRevision,
    clientAddress: document.clientAddress ?? undefined,
    note: document.note ?? undefined,
    soNumber: document.soNumber ?? undefined,
    qty:
      document.items.length === 1 ? (firstItem?.qty ?? undefined) : undefined,
    unitPrice:
      document.items.length === 1
        ? (firstItem?.unitPrice ?? undefined)
        : undefined,
    documentDate: document.documentDate,
    itemCount: document.items.length,
    forecastValue:
      document.type === "Quotation"
        ? forecastValue(document.totalValue, document.stage)
        : null,
    isCurrentRevision: document.isCurrentRevision,
    supersedesDocumentId: document.supersedesDocumentId ?? undefined,
    lineItems: document.items,
  };
}

/**
 * Transitional read facade for routes that still consume CommercialItem.
 * Each result is now one normalized document header, never one line row.
 */
export async function listCommercialItems(): Promise<CommercialItem[]> {
  return (await listCommercialDocuments()).map(toCompatibilityItem);
}

export type CommercialItemPatch = Partial<{
  rfqNumber: string | null;
  stage: string;
  ownerId: string;
  nextActionDate: string | null;
  quotationNumber: string | null;
  customerPoNumber: string | null;
  soNumber: string | null;
  taxType: CommercialItem["taxType"] | null;
}>;

export async function updateCommercialItem(
  id: string,
  patch: CommercialItemPatch,
): Promise<CommercialItem> {
  if (
    patch.nextActionDate !== undefined ||
    patch.quotationNumber !== undefined ||
    patch.customerPoNumber !== undefined ||
    patch.taxType !== undefined
  ) {
    throw new Error("UNSUPPORTED_NORMALIZED_DOCUMENT_PATCH");
  }
  return toCompatibilityItem(
    await updateCommercialDocument(id, {
      rfqNumber: patch.rfqNumber,
      stage: patch.stage,
      ownerId: patch.ownerId,
      soNumber: patch.soNumber,
    }),
  );
}

export async function createCommercialItem(_input: {
  clientId: string;
  ownerId: string;
  type: CommercialItem["type"];
  sourceFlow: CommercialItem["sourceFlow"];
  stage: string;
  description: string;
  estimatedValue: number;
}): Promise<CommercialItem> {
  throw new Error("NORMALIZED_DOCUMENT_INPUT_REQUIRED");
}

export async function createCommercialItemsBatch(_input: {
  clientId: string;
  ownerId: string;
  type: CommercialItem["type"];
  sourceFlow: CommercialItem["sourceFlow"];
  stage: string;
  rfqNumber?: string;
  quotationNumber?: string;
  lineItems: { description: string; qty: number; unitPrice: number }[];
}): Promise<CommercialItem[]> {
  throw new Error("NORMALIZED_DOCUMENT_INPUT_REQUIRED");
}

export function describeCommercialItemChanges(
  changes: { field: string; from?: string; to?: string }[],
): string {
  return changes
    .map(
      (change) =>
        `${change.field}: ${change.from ?? "-"} → ${change.to ?? "-"}`,
    )
    .join(" · ");
}
