import { describe, test, expect } from "bun:test";
import type { SalesOrder } from "@/lib/domain";
import {
  monthlyRevenue,
  ytdRevenue,
  revenueByTax,
  revenueBySource,
  prototypeSummary,
} from "./dashboard-selectors";

// Proves PRD §7/§15's revenue-inclusion rule at the app/data-layer level: a
// Prototype FOC order must contribute zero to every revenue total, while a
// Regular paid order and a Prototype Paid order both count in full. The
// database-level proof already exists (supabase/tests/sales-orders.test.ts —
// the check constraint + revenue_recognized view tests); this covers the
// same rule where the app actually sums numbers for the UI.

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const dateInCurrentMonth = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, "0")}-15`;

const regularPaid: SalesOrder = {
  id: "so-regular",
  soNumber: "SO-REGULAR",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "Regular",
  taxType: "PPN",
  source: "RFQ / New Product",
  value: 1_000_000,
  date: dateInCurrentMonth,
};

const prototypePaid: SalesOrder = {
  id: "so-proto-paid",
  soNumber: "SO-PROTO-PAID",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "Prototype",
  prototypeStatus: "Paid",
  taxType: "Non-PPN",
  source: "Prototype Paid",
  value: 500_000,
  date: dateInCurrentMonth,
};

const prototypeFoc: SalesOrder = {
  id: "so-proto-foc",
  soNumber: "SO-PROTO-FOC",
  clientId: "client-1",
  ownerId: "owner-1",
  type: "Prototype",
  prototypeStatus: "FOC",
  source: "Prototype FOC",
  value: null,
  date: dateInCurrentMonth,
};

const orders = [regularPaid, prototypePaid, prototypeFoc];

describe("dashboard-selectors FOC exclusion", () => {
  test("monthlyRevenue and ytdRevenue exclude the FOC order", () => {
    expect(monthlyRevenue(orders)).toBe(1_500_000);
    expect(ytdRevenue(orders)).toBe(1_500_000);
  });

  test("revenueByTax splits only the paid orders and excludes FOC", () => {
    const { ppn, nonPpn, total } = revenueByTax(orders);
    expect(ppn).toBe(1_000_000);
    expect(nonPpn).toBe(500_000);
    expect(total).toBe(1_500_000);
  });

  test("revenueBySource excludes FOC from every bucket", () => {
    const { rfq, existing, prototypePaid: proto } = revenueBySource(orders);
    expect(rfq).toBe(1_000_000);
    expect(existing).toBe(0);
    expect(proto).toBe(500_000);
  });

  test("prototypeSummary counts FOC operationally but excludes it from paidValue", () => {
    const summary = prototypeSummary(orders);
    expect(summary.paidValue).toBe(500_000);
    expect(summary.focCount).toBe(1);
    expect(summary.paidCount).toBe(1);
    expect(summary.supportActivity).toBe(2);
  });
});
