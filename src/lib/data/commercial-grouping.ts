import type {
  CommercialDocumentLineItem,
  CommercialDocumentWithItems,
} from "./commercial-documents";
import { forecastValue } from "./commercial-stages";
import type { SalesOrderDocument } from "./sales-orders";

export function currentCommercialDocuments(
  documents: CommercialDocumentWithItems[],
): CommercialDocumentWithItems[] {
  return documents.filter(
    (document) => document.type !== "Quotation" || document.isCurrentRevision,
  );
}

export function productDisplayName(productName: string | null): string {
  return productName ?? "Nama Product belum diisi";
}

export function formatCompactDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export type CommercialDocumentViewModel = CommercialDocumentWithItems & {
  items: CommercialDocumentLineItem[];
  itemCount: number;
  totalValue: number;
  forecastValue: number | null;
  displayDate: string;
};

export function commercialDocumentViewModel(
  document: CommercialDocumentWithItems,
): CommercialDocumentViewModel {
  const items = [...document.items].sort(
    (a, b) => a.linePosition - b.linePosition,
  );
  const totalValue = items.reduce(
    (sum, item) => sum + (item.lineTotal ?? 0),
    0,
  );
  return {
    ...document,
    items,
    itemCount: items.length,
    totalValue,
    forecastValue:
      document.type === "Quotation"
        ? forecastValue(totalValue, document.stage)
        : null,
    displayDate: formatCompactDate(document.documentDate),
  };
}

export function salesOrderShowsMoney(order: SalesOrderDocument): boolean {
  return !(order.type === "Prototype" && order.prototypeStatus === "FOC");
}
