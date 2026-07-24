import type { Role } from "@/lib/domain";

export function canShowDeletedMode(role: Role): boolean {
  return role !== "executive";
}

export function commercialItemsQueryKey(deleted: boolean) {
  return ["commercial-items", deleted ? "deleted" : "all"] as const;
}

export function salesOrdersQueryKey(deleted: boolean) {
  return ["sales-orders", deleted ? "deleted" : "all"] as const;
}
