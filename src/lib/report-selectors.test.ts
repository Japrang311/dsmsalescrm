import { describe, expect, test } from "bun:test";

import { defaultReportFilters } from "@/components/reports/ReportFilterBar";
import { CURRENT_MONTH, CURRENT_YEAR, NOW, PINNED_TODAY } from "@/lib/domain";
import type { Client, CommercialItem, SalesOrder, Task } from "@/lib/domain";
import {
  filterSalesOrders,
  quotationLostReasonBreakdown,
  reportSalesPerformance,
} from "./report-selectors";

function order(date: string): SalesOrder {
  return {
    id: `so-${date}`,
    soNumber: `DSM-${date}-SO`,
    clientId: "client-1",
    ownerId: "owner-1",
    type: "Regular",
    taxType: "PPN",
    source: "Existing / Repeat Order",
    value: 1_000_000,
    date,
  };
}

function client(id: string, ownerId: string, status: Client["status"]): Client {
  return {
    id,
    name: id,
    ownerId,
    status,
    source: "Referral",
    spendingYtd: 0,
    contacts: [{}, {}, {}],
  };
}

function task(id: string, ownerId: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    clientId: "client-1",
    ownerId,
    title: id,
    dueDate: "2026-07-27",
    method: "Phone",
    status: "Upcoming",
    workflowStatus: "Open",
    dueState: "Upcoming",
    calendarIncomplete: false,
    category: "Other",
    priority: "Normal",
    archived: false,
    ...patch,
  };
}

describe("report selectors", () => {
  test("includes sales orders created on the current business day", () => {
    const filters = defaultReportFilters({
      from: new Date(CURRENT_YEAR, 0, 1),
      to: NOW,
    });

    expect(filterSalesOrders([order(PINNED_TODAY)], filters)).toHaveLength(1);
  });

  test("keeps future-dated sales orders outside the default range", () => {
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const futureIso = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, "0"),
      String(tomorrow.getDate()).padStart(2, "0"),
    ].join("-");
    const filters = defaultReportFilters({
      from: new Date(CURRENT_YEAR, 0, 1),
      to: NOW,
    });

    expect(filterSalesOrders([order(futureIso)], filters)).toHaveLength(0);
  });

  test("summarizes lost quotation count and value for dashboard reporting", () => {
    const lostQuotation = (
      id: string,
      reason: CommercialItem["lostReason"],
      estimatedValue: number,
    ): CommercialItem => ({
      id,
      clientId: "client-1",
      ownerId: "owner-1",
      type: "Quotation",
      sourceFlow: "New Product",
      stage: "Closed Lost",
      description: id,
      estimatedValue,
      updatedAt: "2026-07-25T00:00:00.000Z",
      lostReason: reason,
    });

    expect(
      quotationLostReasonBreakdown([
        lostQuotation("quo-1", "Tidak ada respons", 4_000_000),
        lostQuotation("quo-2", "Harga tidak kompetitif", 8_000_000),
      ]),
    ).toEqual([
      {
        reason: "Harga tidak kompetitif",
        quotationCount: 1,
        lostValue: 8_000_000,
      },
      {
        reason: "Tidak ada respons",
        quotationCount: 1,
        lostValue: 4_000_000,
      },
    ]);
  });

  test("reports sales performance from workflowStatus and dueState, not legacy status", () => {
    const rows = reportSalesPerformance(
      [
        {
          ...order(PINNED_TODAY),
          ownerId: "manager-1",
          value: 5_000_000,
        },
      ],
      [
        task("manager-personal-open", "manager-1", {
          status: "Done",
          workflowStatus: "Open",
          dueState: "Escalated",
        }),
        task("manager-done-stale-overdue", "manager-1", {
          status: "Overdue",
          workflowStatus: "Done",
          dueState: null,
        }),
        task("sales-overdue", "sales-1", {
          status: "Upcoming",
          dueState: "Overdue",
        }),
        task("archived-escalated", "sales-1", {
          dueState: "Escalated",
          archived: true,
        }),
      ],
      [
        client("client-manager", "manager-1", "Active Customer"),
        client("client-sales", "sales-1", "Active Customer"),
      ],
      [
        { id: "manager-1", name: "Manager Seller", initials: "MS" },
        { id: "sales-1", name: "Sales One", initials: "SO" },
      ],
      {
        "manager-1": [{ month: CURRENT_MONTH, target: 10_000_000 }],
        "sales-1": [{ month: CURRENT_MONTH, target: 1_000_000 }],
      },
    );

    const manager = rows.find((row) => row.member.id === "manager-1");
    const sales = rows.find((row) => row.member.id === "sales-1");

    expect(manager?.revenue).toBe(5_000_000);
    expect(manager?.openTasks).toBe(1);
    expect(manager?.escalatedTasks).toBe(1);
    expect(manager?.completedTasks).toBe(1);
    expect(sales?.overdueTasks).toBe(1);
    expect(sales?.escalatedTasks).toBe(0);
  });

  test("reports omit per-member task detail for aggregate-only Executive views", () => {
    const [row] = reportSalesPerformance(
      [],
      [
        task("executive-visible-exception", "manager-1", {
          dueState: "Escalated",
        }),
      ],
      [client("client-manager", "manager-1", "Active Customer")],
      [{ id: "manager-1", name: "Manager Seller", initials: "MS" }],
      {},
      { includeTaskDetail: false },
    );

    expect(row.openTasks).toBeNull();
    expect(row.overdueTasks).toBeNull();
    expect(row.escalatedTasks).toBeNull();
    expect(row.completedTasks).toBeNull();
    expect(row.cancelledTasks).toBeNull();
  });
});
