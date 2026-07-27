import { describe, test, expect } from "bun:test";
import type { CommercialItem, SalesOrder, Task } from "@/lib/domain";
import {
  clientCommercialMetrics,
  companyMonthlyTarget,
  monthlyRevenue,
  monthlyTargetValue,
  sumTargetsThroughMonth,
  ytdRevenue,
  ytdTargetValue,
  revenueByTax,
  revenueBySource,
  prototypeSummary,
  taskCounts,
  todaysFollowUps,
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
  source: "New Product",
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

const commercialItem = (
  id: string,
  type: CommercialItem["type"],
  estimatedValue: number,
  clientId = "client-1",
): CommercialItem => ({
  id,
  clientId,
  ownerId: "owner-1",
  type,
  sourceFlow: "New Product",
  stage: "Quotation Sent",
  description: id,
  estimatedValue,
  updatedAt: dateInCurrentMonth,
});

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
    const {
      newProduct,
      existing,
      prototypePaid: proto,
    } = revenueBySource(orders);
    expect(newProduct).toBe(1_000_000);
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

describe("clientCommercialMetrics", () => {
  test("uses Quotation value for client quotation pipeline", () => {
    const metrics = clientCommercialMetrics(
      [
        commercialItem("direct", "Direct Order", 1_000_000),
        commercialItem("quotation", "Quotation", 2_500_000),
        commercialItem("other-client", "Quotation", 9_000_000, "client-2"),
      ],
      "client-1",
    );

    expect(metrics.quotationPipeline).toBe(2_500_000);
  });
});

describe("dashboard-selectors dynamic monthly targets", () => {
  test("reads target by month number instead of array position", () => {
    const targetsByMember = {
      "sales-1": [
        { month: 3, target: 3_000 },
        { month: 1, target: 1_000 },
      ],
      "sales-2": [{ month: 3, target: 30_000 }],
    };
    const companyTarget = companyMonthlyTarget(targetsByMember);

    expect(
      monthlyTargetValue("sales", "sales-1", targetsByMember, companyTarget, 1),
    ).toBe(1_000);
    expect(
      monthlyTargetValue("sales", "sales-1", targetsByMember, companyTarget, 2),
    ).toBe(0);
    expect(
      monthlyTargetValue("manager", "", targetsByMember, companyTarget, 3),
    ).toBe(33_000);
    expect(
      ytdTargetValue("sales", "sales-1", targetsByMember, companyTarget, 3),
    ).toBe(4_000);
    expect(sumTargetsThroughMonth(targetsByMember["sales-2"], 3)).toBe(30_000);
  });
});

// Characterization tests (Sales Task Control Loop Task 2 / project-tracker
// Task 47) — lock in that these operational selectors trust the stored
// Task.status string literally and never look at dueDate to decide
// Today/Overdue/Upcoming. This is the pre-Task-4 baseline: once Task 4 adds
// a database-derived due state, these selectors are expected to consume the
// derived value and these fixtures (past due date, status still "Upcoming")
// should then report the task as overdue instead. Update, don't delete,
// these tests when that migration lands.
describe("dashboard-selectors task status is read as-is, not derived from dueDate", () => {
  const overdueByDateButUpcomingStatus: Task = {
    id: "task-stale-status",
    clientId: "client-1",
    ownerId: "owner-1",
    title: "Due last year, status never recomputed",
    dueDate: "2020-01-01",
    method: "Phone",
    status: "Upcoming",
    workflowStatus: "Open",
    dueState: "Overdue",
    calendarIncomplete: false,
    category: "Other",
    priority: "Normal",
  };

  const genuinelyOverdue: Task = {
    ...overdueByDateButUpcomingStatus,
    id: "task-real-overdue",
    status: "Overdue",
  };

  test("taskCounts() buckets purely by the stored status field", () => {
    const counts = taskCounts([overdueByDateButUpcomingStatus, genuinelyOverdue]);
    // The 2020-01-01 task is years overdue by the calendar, but taskCounts()
    // has no date logic at all — it counts it as "upcoming" because that's
    // what status literally says.
    expect(counts.upcoming).toBe(1);
    expect(counts.overdue).toBe(1);
    expect(counts.today).toBe(0);
  });

  test("todaysFollowUps() excludes a calendar-overdue task whose stored status is still Upcoming", () => {
    const result = todaysFollowUps(
      [overdueByDateButUpcomingStatus, genuinelyOverdue],
      [],
      [],
      {},
    );
    const ids = result.map((r) => r.task.id);
    expect(ids).not.toContain(overdueByDateButUpcomingStatus.id);
    expect(ids).toContain(genuinelyOverdue.id);
  });
});
