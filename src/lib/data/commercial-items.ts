import type { CommercialItem } from "@/lib/domain";
import {
  createQuotationFromRfq,
  listCommercialDocuments,
  updateCommercialDocument,
  type CommercialDocumentQuery,
  type CommercialDocumentWithItems,
} from "./commercial-documents";
import { forecastValue } from "./commercial-stages";

export function toCommercialItem(
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
    sourceRfqDocumentId: document.sourceRfqDocumentId ?? undefined,
    quotationExpiredDate: document.quotationExpiredDate ?? undefined,
    clientAddress: document.clientAddress ?? undefined,
    note: document.note ?? undefined,
    lostReason: document.lostReason ?? undefined,
    lostReasonDetail: document.lostReasonDetail ?? undefined,
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

const quotationNumberCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareCommercialItemsByNewestQuotationNumber(
  a: Pick<CommercialItem, "documentDate" | "quotationNumber" | "updatedAt">,
  b: Pick<CommercialItem, "documentDate" | "quotationNumber" | "updatedAt">,
): number {
  const aNumber = a.quotationNumber ?? "";
  const bNumber = b.quotationNumber ?? "";
  if (aNumber || bNumber) {
    if (!aNumber) return 1;
    if (!bNumber) return -1;
    const numberOrder = quotationNumberCollator.compare(bNumber, aNumber);
    if (numberOrder !== 0) return numberOrder;
  }

  const dateOrder = (b.documentDate ?? "").localeCompare(a.documentDate ?? "");
  if (dateOrder !== 0) return dateOrder;

  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Transitional read facade for routes that still consume CommercialItem.
 * Each result is now one normalized document header, never one line row.
 */
type CommercialItemsQueryInput =
  | CommercialDocumentQuery
  | { queryKey: readonly unknown[] };

export async function listCommercialItems(
  input: CommercialItemsQueryInput = {},
): Promise<CommercialItem[]> {
  const options = "queryKey" in input ? {} : input;
  return (await listCommercialDocuments(options))
    .map(toCommercialItem)
    .sort(compareCommercialItemsByNewestQuotationNumber);
}

export type CommercialItemPatch = Partial<{
  rfqNumber: string | null;
  stage: string;
  ownerId: string;
  documentDate: string;
  nextActionDate: string | null;
  quotationNumber: string | null;
  quotationBaseNumber: string | null;
  quotationExpiredDate: string | null;
  customerPoNumber: string | null;
  soNumber: string | null;
  note: string | null;
  taxType: CommercialItem["taxType"] | null;
  lostReason: CommercialItem["lostReason"] | null;
  lostReasonDetail: string | null;
}>;

export async function updateCommercialItem(
  id: string,
  patch: CommercialItemPatch,
): Promise<CommercialItem> {
  if (
    patch.nextActionDate !== undefined ||
    patch.customerPoNumber !== undefined ||
    patch.taxType !== undefined
  ) {
    throw new Error("UNSUPPORTED_NORMALIZED_DOCUMENT_PATCH");
  }
  return toCommercialItem(
    await updateCommercialDocument(id, {
      rfqNumber: patch.rfqNumber,
      quotationNumber: patch.quotationNumber,
      quotationBaseNumber: patch.quotationBaseNumber,
      documentDate: patch.documentDate,
      quotationExpiredDate: patch.quotationExpiredDate,
      stage: patch.stage,
      ownerId: patch.ownerId,
      soNumber: patch.soNumber,
      note: patch.note,
      lostReason: patch.lostReason,
      lostReasonDetail: patch.lostReasonDetail,
    }),
  );
}

export async function convertRfqToQuotation(
  id: string,
): Promise<CommercialItem> {
  return toCommercialItem(await createQuotationFromRfq(id));
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
