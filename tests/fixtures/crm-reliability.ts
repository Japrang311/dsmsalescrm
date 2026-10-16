import type { SalesOrder } from "../../src/lib/domain";

// Synthetic AC01/02/05 fixture. No customer or production identifiers.
export const CRM_ORDERS: SalesOrder[] = [
  ["a-jan", "client-a", "2026-01-15", 480_000_000],
  ["a-feb", "client-a", "2026-02-28", 20_000_000],
  ["b-feb", "client-b", "2026-02-01", 80_000_000],
  ["a-dec", "client-a", "2025-12-31", 10_000_000],
].map(([id, clientId, date, value]) => ({
  id: String(id),
  soNumber: String(id),
  clientId: String(clientId),
  date: String(date),
  value: Number(value),
  ownerId: "owner-a",
  type: "Regular",
  taxType: "PPN",
  source: "Existing / Repeat Order",
}));

export const CRM_TARGETS = [
  { ownerId: "owner-a", year: 2025, month: 12, target: 40_000_000 },
  { ownerId: "owner-a", year: 2026, month: 1, target: 50_000_000 },
  { ownerId: "owner-a", year: 2026, month: 2, target: 60_000_000 },
];
