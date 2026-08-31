import type { Client, DateRange, Role, SalesOrder, Task } from "@/lib/domain";
import type { PipelineMetrics } from "@/lib/data/pipeline-metrics";
import type { RiskAlertCounts } from "@/lib/data/sales-performance-metrics";
// SalesTeamMember lives in dashboard-selectors; TargetsByMember lives in
// targets. They are not in the same module — importing both from
// dashboard-selectors will not typecheck.
import type { SalesTeamMember } from "@/lib/data/dashboard-selectors";
import type { TargetsByMember } from "@/lib/data/targets";
import {
  revenueByTaxInRange,
  revenueInRange,
  salesPerformanceInRange,
  topCustomersInRange,
} from "@/lib/data/dashboard-selectors";
import { filterManagerTeamExceptions } from "@/lib/data/task-exceptions";
import {
  formatDateShort,
  formatPercent,
  formatRupiahShort,
} from "@/lib/format";

export type SummaryAudience = "manager" | "executive";

/**
 * Everything the model is ever allowed to see. Every leaf is a string that is
 * already formatted for display, because the model must never do arithmetic —
 * it reuses these strings verbatim. `summary-facts.test.ts` asserts the
 * all-strings rule, so adding a numeric field here will fail the suite.
 */
export type SummaryFacts = {
  audience: SummaryAudience;
  periodLabel: string;
  generatedAtLabel: string;
  revenue: {
    actualLabel: string;
    targetLabel: string;
    attainmentLabel: string;
    ppnLabel: string;
    nonPpnLabel: string;
  };
  topCustomers: { name: string; revenueLabel: string }[];
  risk: {
    overdueTaskCountLabel: string;
    bigPendingCommitCountLabel: string;
    bigPendingCommitValueLabel: string;
    dormantHighValueClientCountLabel: string;
  };
  funnel: {
    winRateLabel: string;
    openValueLabel: string;
    stages: { stage: string; countLabel: string; openValueLabel: string }[];
  };
  /** Manager only. Absent for executive — aggregate-only reporting. */
  salesPerformance?: {
    name: string;
    revenueLabel: string;
    targetLabel: string;
    attainmentLabel: string;
  }[];
  /** Manager only. Absent for executive — Reports withholds task detail. */
  escalatedTasks?: { ownerName: string; title: string }[];
};

export type SummaryFactsInput = {
  audience: SummaryAudience;
  now: Date;
  range: DateRange;
  orders: SalesOrder[];
  tasks: Task[];
  clients: Client[];
  salesTeam: SalesTeamMember[];
  ownersById: Record<string, { role?: Role }>;
  targetsByMember: TargetsByMember;
  companyTarget: number;
  riskCounts: RiskAlertCounts;
  pipeline: PipelineMetrics;
};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function attainment(actual: number, target: number): string {
  if (target <= 0) return "tidak ada target";
  return formatPercent(actual / target);
}

export function buildSummaryFacts(input: SummaryFactsInput): SummaryFacts {
  const {
    audience,
    now,
    range,
    orders,
    tasks,
    clients,
    salesTeam,
    ownersById,
    targetsByMember,
    companyTarget,
    riskCounts,
    pipeline,
  } = input;

  const actual = revenueInRange(orders, range);
  const tax = revenueByTaxInRange(orders, range);

  const facts: SummaryFacts = {
    audience,
    periodLabel: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    generatedAtLabel: `${formatDateShort(now)}, ${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
    revenue: {
      actualLabel: formatRupiahShort(actual),
      targetLabel: formatRupiahShort(companyTarget),
      attainmentLabel: attainment(actual, companyTarget),
      ppnLabel: formatRupiahShort(tax.ppn),
      nonPpnLabel: formatRupiahShort(tax.nonPpn),
    },
    topCustomers: topCustomersInRange(orders, clients, range).map((row) => ({
      name: row.client.name,
      revenueLabel: formatRupiahShort(row.revenue),
    })),
    risk: {
      overdueTaskCountLabel: `${riskCounts.overdueTaskCount} task`,
      bigPendingCommitCountLabel: `${riskCounts.bigPendingCommitCount} dokumen`,
      bigPendingCommitValueLabel: formatRupiahShort(
        riskCounts.bigPendingCommitValue,
      ),
      dormantHighValueClientCountLabel: `${riskCounts.dormantHighValueClientCount} client`,
    },
    funnel: {
      winRateLabel: formatPercent(pipeline.totals.winRate),
      openValueLabel: formatRupiahShort(pipeline.totals.openValue),
      stages: pipeline.stages.map((stage) => ({
        stage: stage.stage,
        countLabel: `${stage.itemCount} item`,
        openValueLabel: formatRupiahShort(stage.openValue),
      })),
    },
  };

  // Executive receives aggregates only. Returning early — rather than
  // building these and deleting them — means a sales name can never
  // transiently exist in the executive object.
  if (audience === "executive") return facts;

  const nameById = new Map(salesTeam.map((m) => [m.id, m.name]));

  facts.salesPerformance = salesPerformanceInRange(
    orders,
    tasks,
    salesTeam,
    range,
    targetsByMember,
  ).map((row) => ({
    name: row.member.name,
    revenueLabel: formatRupiahShort(row.revenue),
    targetLabel: formatRupiahShort(row.target),
    attainmentLabel: attainment(row.revenue, row.target),
  }));

  facts.escalatedTasks = filterManagerTeamExceptions(tasks, ownersById).map(
    (t) => ({
      ownerName: nameById.get(t.ownerId) ?? "Sales",
      title: t.title,
    }),
  );

  return facts;
}
