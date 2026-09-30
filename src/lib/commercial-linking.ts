import type { CommercialItem } from "@/lib/domain";
import type { SalesOrderDocument } from "@/lib/data/sales-orders";
import { getErrorMessage } from "@/lib/utils";

export function eligibleQuotationsForSalesOrder(
  items: readonly CommercialItem[],
  salesOrders: readonly SalesOrderDocument[],
  salesOrder: Pick<SalesOrderDocument, "clientId">,
): CommercialItem[] {
  const linkedQuotationIds = new Set(
    salesOrders.flatMap((order) =>
      order.sourceCommercialDocumentId
        ? [order.sourceCommercialDocumentId]
        : [],
    ),
  );

  return items.filter(
    (item) =>
      item.type === "Quotation" &&
      item.clientId === salesOrder.clientId &&
      item.stage === "Closed Won" &&
      item.isCurrentRevision === true &&
      !linkedQuotationIds.has(item.id),
  );
}

export function eligibleSalesOrdersForQuotation(
  quotation: Pick<CommercialItem, "clientId">,
  salesOrders: readonly SalesOrderDocument[],
): SalesOrderDocument[] {
  return salesOrders.filter(
    (order) =>
      order.clientId === quotation.clientId &&
      order.deletedAt === null &&
      order.sourceCommercialDocumentId === null,
  );
}

export function manualCommercialLinkErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (message.includes("QUOTATION_ALREADY_HAS_SALES_ORDER")) {
    return "Quotation ini sudah terhubung ke Sales Order lain.";
  }
  if (message.includes("SALES_ORDER_ALREADY_LINKED")) {
    return "Sales Order ini sudah terhubung ke Quotation lain.";
  }
  if (message.includes("QUOTATION_CLIENT_MISMATCH")) {
    return "Quotation dan Sales Order harus berasal dari klien yang sama.";
  }
  if (message.includes("CURRENT_CLOSED_WON_QUOTATION_REQUIRED")) {
    return "Pilih Quotation Closed Won yang aktif dan merupakan revisi terbaru.";
  }
  if (
    message.includes("SALES_ORDER_OWNERSHIP_REQUIRED") ||
    message.includes("QUOTATION_OWNERSHIP_REQUIRED") ||
    message.includes("ACTIVE_MUTATING_ROLE_REQUIRED")
  ) {
    return "Anda tidak memiliki akses untuk membuat hubungan ini.";
  }
  if (message.includes("SALES_ORDER_NOT_FOUND")) {
    return "Sales Order tidak ditemukan atau sudah dihapus.";
  }
  if (message.includes("QUOTATION_NOT_FOUND")) {
    return "Quotation tidak ditemukan.";
  }
  return message;
}
