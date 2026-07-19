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
};

export function dashboardExportMonthlyTrend(context: DashboardExportContext) {
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

export function dashboardExportTopCustomers(
  context: DashboardExportContext,
  limit = 5,
) {
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

  return {
    revenue: revenueInRange(context.orders, context.range),
    target: sumMonthlyProrated(targetRows, context.range),
    revenueByTax: revenueByTaxInRange(context.orders, context.range),
    revenueBySource: revenueBySourceInRange(context.orders, context.range),
    prototype: prototypeSummaryInRange(context.orders, context.range),
    tasks: taskCounts(context.tasks),
    waitingPo: waitingPoValue(context.items),
    activeCommercial: activeCommercialCount(context.items),
    quotationFunnel: quotationFunnel(context.items),
  };
}
