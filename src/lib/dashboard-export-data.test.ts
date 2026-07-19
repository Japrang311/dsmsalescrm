import { describe, expect, test } from "bun:test";
import {
  dashboardExportMonthlyTrend,
  dashboardExportTopCustomers,
  type DashboardExportContext,
} from "@/lib/dashboard-export-data";

const context: DashboardExportContext = {
  role: "manager",
  range: {
    from: new Date("2026-07-01T00:00:00.000Z"),
    to: new Date("2026-07-31T23:59:59.999Z"),
  },
  salesUserId: "sales-1",
  orders: [
    {
      id: "so-1",
      soNumber: "DSM-001",
      clientId: "client-1",
      ownerId: "sales-1",
      type: "Regular",
      taxType: "PPN",
      source: "RFQ / New Product",
      value: 125_000_000,
      date: "2026-07-10",
    },
  ],
  tasks: [],
  items: [],
  clients: [
    {
      id: "client-1",
      name: "PT Data Nyata",
      status: "Active Customer",
      source: "Referral",
      ownerId: "sales-1",
      spendingYtd: 125_000_000,
    },
  ],
  ownersById: {
    "sales-1": { name: "Aditya", initials: "AW" },
  },
  salesTeam: [{ id: "sales-1", name: "Aditya", initials: "AW" }],
  targetsByMember: {
    "sales-1": Array.from({ length: 12 }, (_, month) => ({
      month: month + 1,
      target: 200_000_000,
    })),
  },
  companyTarget: Array.from({ length: 12 }, (_, month) => ({
    month: month + 1,
    target: 200_000_000,
  })),
};

describe("dashboard export data", () => {
  test("derives monthly revenue from the supplied backend snapshot", () => {
    expect(dashboardExportMonthlyTrend(context)).toEqual([
      {
        month: "Jul",
        revenue: 125_000_000,
        target: 200_000_000,
      },
    ]);
  });

  test("derives customer ranking from the supplied backend snapshot", () => {
    expect(dashboardExportTopCustomers(context, 5)).toEqual([
      {
        client: context.clients[0],
        revenue: 125_000_000,
      },
    ]);
  });
});
