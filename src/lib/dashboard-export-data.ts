import type {
  Client,
  CommercialItem,
  DateRange,
  MonthlyTarget,
  Role,
  SalesOrder,
  Task,
} from "@/lib/domain";
import type { TargetsByMember } from "@/lib/data/targets";
import type { MetricContext } from "@/lib/report-metric-scope";
import type { ReportMetricSnapshot } from "@/lib/data/sales-performance-metrics";
import {
  activeCommercialCount,
  monthlyRevenueTrendInRange,
  prototypeSummaryInRange,
  quotationFunnel,
  revenueBySourceInRange,
  revenueByTaxInRange,
  revenueInRange,
  salesPerformanceInRange,
  sumMonthlyProrated,
  targetsFor,
  taskCounts,
  todaysFollowUps,
  topCustomersInRange,
  waitingPoValue,
  type SalesTeamMember,
} from "@/lib/data/dashboard-selectors";
import type { TaskControlLoopMetrics } from "@/lib/data/tasks";
import type {
  AnalyticsCoverage,
  CycleTimeMetric,
  LostReasonMetric,
  StageDwellMetric,
  StageFunnelMetric,
  WinLossMetrics,
} from "@/lib/data/stage4-analytics";

// Stage 4 Task 4.6: optional so this context stays valid for Dashboard's
// export (which never fetches these RPCs) -- exportExecutiveReportXlsx/Pdf
// only add the new Stage 4 sheets/sections when this is present, so
// Dashboard's export is byte-for-byte unaffected. Reports passes the exact
// React Query results already rendered on screen, not a fresh fetch, so
// the export always matches what the viewer just saw.
export type Stage4ExportData = {
  winLoss: WinLossMetrics;
  lostReasons: LostReasonMetric[];
  cycleTime: CycleTimeMetric[];
  funnel: StageFunnelMetric[];
  dwell: StageDwellMetric[];
  coverage: AnalyticsCoverage[];
};

export type DashboardExportContext = {
  role: Role;
  range: DateRange;
  salesUserId: string;
  orders: SalesOrder[];
  tasks: Task[];
  items: CommercialItem[];
  clients: Client[];
  ownersById: Record<string, { name: string; initials: string }>;
  salesTeam: SalesTeamMember[];
  targetsByMember: TargetsByMember;
  companyTarget: MonthlyTarget[];
  taskMetrics?: TaskControlLoopMetrics;
  stage4?: Stage4ExportData;
  reportSnapshot?: {
    context: MetricContext;
    metrics: ReportMetricSnapshot;
    target: number;
    targetReason: string | null;
    trend: ReturnType<typeof monthlyRevenueTrendInRange>;
    performance: ReturnType<typeof salesPerformanceInRange>;
  };
};

export function dashboardExportMonthlyTrend(context: DashboardExportContext) {
  if (context.reportSnapshot) return context.reportSnapshot.trend;
  return monthlyRevenueTrendInRange(
    context.orders,
    context.role,
    context.salesUserId,
    context.range,
    context.targetsByMember,
    context.companyTarget,
  );
}

export function dashboardExportSalesPerformance(
  context: DashboardExportContext,
) {
  if (context.reportSnapshot) return context.reportSnapshot.performance;
  return salesPerformanceInRange(
    context.orders,
    context.tasks,
    context.salesTeam,
    context.range,
    context.targetsByMember,
  );
}

export function dashboardExportFollowUps(context: DashboardExportContext) {
  return todaysFollowUps(
    context.tasks,
    context.clients,
    context.items,
    context.ownersById,
  ).filter(
    (
      row,
    ): row is typeof row & {
      client: Client;
      owner: { name: string; initials: string };
    } => Boolean(row.client && row.owner),
  );
}

export function dashboardExportFollowUpRecords(
  context: DashboardExportContext,
) {
  return dashboardExportFollowUps(context).map((row) => ({
    workflowStatus: row.task.workflowStatus,
    dueState: row.task.dueState ?? "",
    dueDate: row.task.dueDate,
    clientName: row.client.name,
    taskTitle: row.task.title,
    commercialItemDescription: row.commercialItem?.description ?? "",
    ownerName: row.owner.name,
  }));
}

export function dashboardExportTopCustomers(
  context: DashboardExportContext,
  limit = 5,
) {
  if (context.reportSnapshot) {
    return context.reportSnapshot.metrics.customers
      .slice(0, limit)
      .map((row) => ({
        client: context.clients.find((client) => client.id === row.clientId)!,
        revenue: row.revenue,
      }))
      .filter((row) => row.client);
  }
  return topCustomersInRange(
    context.orders,
    context.clients,
    context.range,
    limit,
  );
}

export function dashboardExportMetrics(context: DashboardExportContext) {
  const targetRows =
    context.role === "sales"
      ? targetsFor(context.targetsByMember, context.salesUserId)
      : context.companyTarget;

  const snapshot = context.reportSnapshot;
  const m = snapshot?.metrics;
  return {
    revenue: m ? m.total : revenueInRange(context.orders, context.range),
    target: snapshot
      ? snapshot.target
      : sumMonthlyProrated(targetRows, context.range),
    revenueByTax: m
      ? { ppn: m.ppn, nonPpn: m.nonPpn }
      : revenueByTaxInRange(context.orders, context.range),
    revenueBySource: m
      ? {
          newProduct: m.newProduct,
          existing: m.existing,
          prototypePaid: m.protoPaid,
        }
      : revenueBySourceInRange(context.orders, context.range),
    prototype: m
      ? {
          paidCount: m.protoPaidCount,
          paidValue: m.protoPaid,
          focCount: m.protoFocCount,
          supportActivity: m.protoPaidCount + m.protoFocCount,
        }
      : prototypeSummaryInRange(context.orders, context.range),
    tasks: taskCounts(
      context.tasks,
      context.role === "sales" ? undefined : context.taskMetrics,
    ),
    waitingPo: waitingPoValue(context.items),
    activeCommercial: activeCommercialCount(context.items),
    quotationFunnel: quotationFunnel(context.items),
  };
}
