import type { ReportFilters } from "@/components/reports/report-filters";
import { NOW } from "@/lib/app-time";
import type { Client, CommercialItem, SalesOrder, Task } from "@/lib/domain";
import {
  hasTaskDueState,
  isActiveTask,
  type SalesTeamMember,
  sumTargetsThroughMonth,
  targetsFor,
} from "@/lib/data/dashboard-selectors";
import type { TargetsByMember } from "@/lib/data/targets";

export { quotationLostReasonBreakdown } from "@/lib/data/quotation-lost-reasons";

function inRange(dateStr: string, from: Date, to: Date) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day).getTime();
  const fromDay = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  ).getTime();
  const toDay = new Date(
    to.getFullYear(),
    to.getMonth(),
    to.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  return date >= fromDay && date <= toDay;
}

export function filterSalesOrders<T extends SalesOrder>(
  orders: T[],
  filters: ReportFilters,
): T[] {
  return orders.filter((order) => {
    if (!inRange(order.date, filters.range.from, filters.range.to))
      return false;
    if (filters.ownerId !== "all" && order.ownerId !== filters.ownerId)
      return false;
    if (filters.clientId !== "all" && order.clientId !== filters.clientId)
      return false;
    if (filters.soType !== "all" && order.type !== filters.soType) return false;
    if (filters.taxType === "PPN" && order.taxType !== "PPN") return false;
    if (filters.taxType === "Non-PPN" && order.taxType !== "Non-PPN")
      return false;
    if (filters.source !== "all" && order.source !== filters.source)
      return false;
    return true;
  });
}

export function filterCommercialItems(
  items: CommercialItem[],
  filters: ReportFilters,
) {
  return items.filter((item) => {
    if (filters.ownerId !== "all" && item.ownerId !== filters.ownerId)
      return false;
    if (filters.clientId !== "all" && item.clientId !== filters.clientId)
      return false;
    return true;
  });
}

export function agingBucket(dateStr: string): string {
  const days = Math.floor(
    (NOW.getTime() - new Date(dateStr).getTime()) / 86_400_000,
  );
  if (days < 0) return "Belum jatuh tempo";
  if (days <= 7) return "0-7 hari";
  if (days <= 14) return "8-14 hari";
  if (days <= 30) return "15-30 hari";
  return "> 30 hari";
}

export type ReportSalesPerformanceRow = {
  member: SalesTeamMember;
  revenue: number;
  target: number;
  pct: number;
  openTasks: number | null;
  overdueTasks: number | null;
  escalatedTasks: number | null;
  completedTasks: number | null;
  cancelledTasks: number | null;
  activeClients: number;
};

export function reportSalesPerformance(
  orders: SalesOrder[],
  tasks: Task[],
  clients: Client[],
  salesTeam: SalesTeamMember[],
  targetsByMember: TargetsByMember,
  options: { includeTaskDetail?: boolean } = {},
): ReportSalesPerformanceRow[] {
  const includeTaskDetail = options.includeTaskDetail ?? true;

  return salesTeam
    .map((member) => {
      const memberOrders = orders.filter((s) => s.ownerId === member.id);
      const revenue = memberOrders.reduce((s, o) => s + (o.value ?? 0), 0);
      const target = sumTargetsThroughMonth(
        targetsFor(targetsByMember, member.id),
      );
      const memberTasks = tasks.filter((t) => t.ownerId === member.id);
      const activeClients = clients.filter(
        (c) => c.ownerId === member.id && c.status !== "Lost",
      ).length;

      return {
        member,
        revenue,
        target,
        pct: target > 0 ? revenue / target : 0,
        openTasks: includeTaskDetail
          ? memberTasks.filter(isActiveTask).length
          : null,
        overdueTasks: includeTaskDetail
          ? memberTasks.filter((t) => hasTaskDueState(t, ["Overdue"])).length
          : null,
        escalatedTasks: includeTaskDetail
          ? memberTasks.filter((t) => hasTaskDueState(t, ["Escalated"])).length
          : null,
        completedTasks: includeTaskDetail
          ? memberTasks.filter((t) => t.workflowStatus === "Done").length
          : null,
        cancelledTasks: includeTaskDetail
          ? memberTasks.filter((t) => t.workflowStatus === "Cancelled").length
          : null,
        activeClients,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// RPC-backed variant: revenue from getSalesOrdersOwnerYtd (full filter
// parity with the Reports filter bar) and task/client detail from
// getSalesTaskClientMetrics, instead of scanning the unbounded orders/
// tasks/clients arrays directly. sales_task_client_metrics' overdue_tasks
// is Overdue+Escalated combined (matches the Dashboard's existing badge);
// Reports wants Overdue on its own, so it's recovered by subtracting the
// RPC's separate escalated_tasks count.
export function reportSalesPerformanceFromRpc(
  ownerYtd: { ownerId: string; revenue: number }[],
  taskClientMetrics: {
    ownerId: string;
    openTasks: number;
    overdueTasks: number;
    escalatedTasks: number;
    completedTasks: number;
    cancelledTasks: number;
    activeClients: number;
  }[],
  salesTeam: SalesTeamMember[],
  targetsByMember: TargetsByMember,
  options: { includeTaskDetail?: boolean } = {},
): ReportSalesPerformanceRow[] {
  const includeTaskDetail = options.includeTaskDetail ?? true;
  const revenueByOwner = new Map(ownerYtd.map((o) => [o.ownerId, o.revenue]));
  const metricsByOwner = new Map(taskClientMetrics.map((m) => [m.ownerId, m]));

  return salesTeam
    .map((member) => {
      const revenue = revenueByOwner.get(member.id) ?? 0;
      const target = sumTargetsThroughMonth(
        targetsFor(targetsByMember, member.id),
      );
      const m = metricsByOwner.get(member.id);
      return {
        member,
        revenue,
        target,
        pct: target > 0 ? revenue / target : 0,
        openTasks: includeTaskDetail ? (m?.openTasks ?? 0) : null,
        overdueTasks: includeTaskDetail
          ? (m?.overdueTasks ?? 0) - (m?.escalatedTasks ?? 0)
          : null,
        escalatedTasks: includeTaskDetail ? (m?.escalatedTasks ?? 0) : null,
        completedTasks: includeTaskDetail ? (m?.completedTasks ?? 0) : null,
        cancelledTasks: includeTaskDetail ? (m?.cancelledTasks ?? 0) : null,
        activeClients: m?.activeClients ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
