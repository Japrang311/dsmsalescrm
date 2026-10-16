import { describe, expect, test } from "bun:test";
import {
  dashboardExportFollowUpRecords,
  dashboardExportMetrics,
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
      source: "New Product",
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
      contacts: [{}, {}, {}],
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

  test("exports follow-up workflow status and due state instead of legacy status", () => {
    const [record] = dashboardExportFollowUpRecords({
      ...context,
      tasks: [
        {
          id: "task-1",
          clientId: "client-1",
          ownerId: "sales-1",
          commercialItemId: "item-1",
          title: "Follow up proposal",
          dueDate: "2026-07-17",
          method: "WhatsApp",
          workflowStatus: "In Progress",
          dueState: "Escalated",
          calendarIncomplete: false,
          category: "Follow-Up",
          priority: "High",
        },
      ],
      items: [
        {
          id: "item-1",
          clientId: "client-1",
          ownerId: "sales-1",
          type: "Quotation",
          sourceFlow: "New Product",
          description: "DSM CRM rollout",
          estimatedValue: 125_000_000,
          stage: "Quotation Sent",
          updatedAt: "2026-07-10",
        },
      ],
    });

    expect(record).toMatchObject({
      workflowStatus: "In Progress",
      dueState: "Escalated",
      dueDate: "2026-07-17",
      clientName: "PT Data Nyata",
      taskTitle: "Follow up proposal",
      commercialItemDescription: "DSM CRM rollout",
      ownerName: "Aditya",
    });
    expect(record).not.toHaveProperty("status");
  });

  test("uses aggregate task metrics for non-sales export totals", () => {
    const metrics = dashboardExportMetrics({
      ...context,
      role: "executive",
      tasks: [],
      taskMetrics: {
        totalTasks: 13,
        activeTasks: 9,
        upcomingTasks: 2,
        todayTasks: 1,
        overdueTasks: 3,
        escalatedTasks: 4,
        doneTasks: 2,
        cancelledTasks: 1,
        archivedTasks: 1,
        calendarIncompleteTasks: 0,
      },
    });

    expect(metrics.tasks).toMatchObject({
      open: 9,
      upcoming: 2,
      today: 1,
      overdue: 3,
      escalated: 4,
      done: 2,
      cancelled: 1,
    });
  });

  test("uses the exact report snapshot for metrics, trend, and customer ranking", () => {
    const snapshotContext: DashboardExportContext = {
      ...context,
      orders: [],
      reportSnapshot: {
        context: {
          scope: {
            from: "2026-07-01",
            to: "2026-07-31",
            ownerId: "sales-1",
          },
          basis: "sales-order-value",
          fetchedAt: "2026-07-31T12:00:00.000Z",
          targetComparable: true,
        },
        metrics: {
          total: 500_000_000,
          ppn: 400_000_000,
          nonPpn: 100_000_000,
          newProduct: 300_000_000,
          existing: 150_000_000,
          protoPaid: 50_000_000,
          totalCount: 4,
          protoFocCount: 1,
          protoPaidCount: 1,
          customers: [
            {
              clientId: "client-1",
              clientName: "PT Data Nyata",
              revenue: 500_000_000,
            },
          ],
          owners: [{ ownerId: "sales-1", revenue: 500_000_000 }],
          months: [{ period: "2026-07", revenue: 500_000_000 }],
          fetchedAt: "2026-07-31T12:00:00.000Z",
        },
        target: 200_000_000,
        targetReason: null,
        trend: [{ month: "Jul", revenue: 500_000_000, target: 200_000_000 }],
        performance: [],
      },
    };

    expect(dashboardExportMetrics(snapshotContext)).toMatchObject({
      revenue: 500_000_000,
      target: 200_000_000,
      revenueByTax: { ppn: 400_000_000, nonPpn: 100_000_000 },
    });
    expect(dashboardExportMonthlyTrend(snapshotContext)).toEqual([
      { month: "Jul", revenue: 500_000_000, target: 200_000_000 },
    ]);
    expect(dashboardExportTopCustomers(snapshotContext, 5)).toEqual([
      { client: context.clients[0], revenue: 500_000_000 },
    ]);
  });
});
