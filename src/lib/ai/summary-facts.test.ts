import { describe, expect, test } from "bun:test";
import type { Client, SalesOrder, Task } from "@/lib/domain";
import type { RiskAlertCounts } from "@/lib/data/sales-performance-metrics";
import type { PipelineMetrics } from "@/lib/data/pipeline-metrics";
import { buildSummaryFacts, type SummaryFactsInput } from "./summary-facts";

// DateRange is { from: Date; to: Date } — Date objects, not ISO strings.
const RANGE = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) };

function order(
  id: string,
  ownerId: string,
  clientId: string,
  value: number,
): SalesOrder {
  return {
    id,
    ownerId,
    clientId,
    number: id,
    date: "2026-08-10",
    value,
    paymentStatus: "Paid",
    taxType: "PPN",
    source: "New Product",
  } as unknown as SalesOrder;
}

function task(id: string, ownerId: string): Task {
  return {
    id,
    ownerId,
    title: `Follow up ${id}`,
    dueDate: "2026-08-01",
    method: "Phone",
    workflowStatus: "Open",
    dueState: "Escalated",
    calendarIncomplete: false,
    category: "Follow-Up",
    priority: "Normal",
    archived: false,
  } as unknown as Task;
}

const RISK: RiskAlertCounts = {
  overdueTaskCount: 7,
  bigPendingCommitCount: 3,
  bigPendingCommitValue: 480_000_000,
  dormantHighValueClientCount: 2,
};

const PIPELINE: PipelineMetrics = {
  stages: [
    {
      stage: "Negosiasi",
      itemCount: 12,
      totalValue: 3_100_000_000,
      openValue: 3_100_000_000,
      wonValue: 0,
      lostValue: 0,
      wonCount: 0,
      lostCount: 0,
    },
  ],
  totals: {
    itemCount: 12,
    totalValue: 3_100_000_000,
    openValue: 3_100_000_000,
    wonValue: 0,
    lostValue: 0,
    wonCount: 0,
    lostCount: 0,
    winRate: 0.42,
  },
};

function input(overrides: Partial<SummaryFactsInput> = {}): SummaryFactsInput {
  return {
    audience: "manager",
    now: new Date("2026-08-31T14:30:00+07:00"),
    range: RANGE,
    orders: [order("SO-1", "sales-budi", "client-1", 1_200_000_000)],
    tasks: [task("T-1", "sales-budi")],
    clients: [{ id: "client-1", name: "PT Karya Utama" } as unknown as Client],
    salesTeam: [{ id: "sales-budi", name: "Budi Santoso", initials: "BS" }],
    ownersById: { "sales-budi": { role: "sales" } },
    targetsByMember: {},
    companyTarget: 2_800_000_000,
    riskCounts: RISK,
    pipeline: PIPELINE,
    ...overrides,
  };
}

describe("buildSummaryFacts", () => {
  test("manager facts include per-sales performance and escalated tasks", () => {
    const facts = buildSummaryFacts(input({ audience: "manager" }));
    expect(facts.salesPerformance).toBeDefined();
    expect(facts.salesPerformance?.[0]?.name).toBe("Budi Santoso");
    expect(facts.escalatedTasks).toBeDefined();
    expect(facts.escalatedTasks?.[0]?.ownerName).toBe("Budi Santoso");
  });

  test("executive facts omit per-sales performance and escalated tasks entirely", () => {
    const facts = buildSummaryFacts(input({ audience: "executive" }));
    expect(facts.salesPerformance).toBeUndefined();
    expect(facts.escalatedTasks).toBeUndefined();
  });

  test("no sales person's name or id survives anywhere in executive facts", () => {
    const facts = buildSummaryFacts(input({ audience: "executive" }));
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain("Budi Santoso");
    expect(serialized).not.toContain("sales-budi");
    expect(serialized).not.toContain("Follow up");
  });

  test("both audiences keep client names and shared topics", () => {
    for (const audience of ["manager", "executive"] as const) {
      const facts = buildSummaryFacts(input({ audience }));
      expect(JSON.stringify(facts.topCustomers)).toContain("PT Karya Utama");
      expect(facts.funnel.stages.length).toBeGreaterThan(0);
      expect(facts.risk.overdueTaskCountLabel).toBeTruthy();
    }
  });

  test("every leaf value is a string, so the model never receives a raw number", () => {
    const facts = buildSummaryFacts(input({ audience: "manager" }));
    const leaves: unknown[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        return Object.values(value).forEach(walk);
      }
      leaves.push(value);
    };
    walk(facts);
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) expect(typeof leaf).toBe("string");
  });
});
