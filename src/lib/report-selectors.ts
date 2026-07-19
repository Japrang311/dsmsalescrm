import type { ReportFilters } from "@/components/reports/ReportFilterBar";
import { NOW } from "@/lib/app-time";
import type { CommercialItem, SalesOrder } from "@/lib/domain";

function inRange(dateStr: string, from: Date, to: Date) {
  const date = new Date(dateStr).getTime();
  return date >= from.getTime() && date <= to.getTime();
}

export function filterSalesOrders<T extends SalesOrder>(
  orders: T[],
  filters: ReportFilters,
): T[] {
  return orders.filter((order) => {
    if (!inRange(order.date, filters.range.from, filters.range.to))
      return false;
    if (filters.ownerId !== "all" && order.ownerId !== filters.ownerId)
      return false;
    if (filters.clientId !== "all" && order.clientId !== filters.clientId)
      return false;
    if (filters.soType !== "all" && order.type !== filters.soType) return false;
    if (filters.taxType === "PPN" && order.taxType !== "PPN") return false;
    if (filters.taxType === "Non-PPN" && order.taxType !== "Non-PPN")
      return false;
    if (filters.source !== "all" && order.source !== filters.source)
      return false;
    return true;
  });
}

export function filterCommercialItems(
  items: CommercialItem[],
  filters: ReportFilters,
) {
  return items.filter((item) => {
    if (filters.ownerId !== "all" && item.ownerId !== filters.ownerId)
      return false;
    if (filters.clientId !== "all" && item.clientId !== filters.clientId)
      return false;
    return true;
  });
}

export function agingBucket(dateStr: string): string {
  const days = Math.floor(
    (NOW.getTime() - new Date(dateStr).getTime()) / 86_400_000,
  );
  if (days < 0) return "Belum jatuh tempo";
  if (days <= 7) return "0-7 hari";
  if (days <= 14) return "8-14 hari";
  if (days <= 30) return "15-30 hari";
  return "> 30 hari";
}
