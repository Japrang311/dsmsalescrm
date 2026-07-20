// Revenue and operational selectors parameterized on fetched backend data.
// This codebase's revenue calculations
// correctly exclude Prototype FOC via `so.value ?? 0`, since FOC rows are
// guaranteed null-value by a DB check constraint), just parameterized on
// real fetched arrays instead of reading mock module-level arrays.
import type { SalesOrder, Task, CommercialItem, Client } from "@/lib/domain";
import {
  CURRENT_MONTH,
  CURRENT_YEAR,
  type Role,
  type DateRange,
} from "@/lib/domain";
import type { MonthlyTarget, TargetsByMember } from "@/lib/data/targets";
import {
  forecastValue,
  type CommercialStage,
} from "@/lib/data/commercial-stages";

function paidRevenue(so: SalesOrder): number {
  return so.value ?? 0;
}

export function targetsFor(
  byMember: TargetsByMember,
  memberId: string,
): MonthlyTarget[] {
  return byMember[memberId] ?? [];
}

// Company-wide monthly target = sum of every sales rep's target for that
// month. Not stored as its own row — computed here so there's one source
// of truth in the `targets` table.
export function companyMonthlyTarget(
  byMember: TargetsByMember,
): MonthlyTarget[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    target: Object.values(byMember).reduce(
      (s, arr) => s + (arr[i]?.target ?? 0),
      0,
    ),
  }));
}

function targetArrFor(
  role: Role,
  salesUserId: string,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
): MonthlyTarget[] {
  return role === "sales" ? targetsFor(byMember, salesUserId) : companyTarget;
}

export function monthlyTargetValue(
  role: Role,
  salesUserId: string,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
  month = CURRENT_MONTH,
): number {
  const arr = targetArrFor(role, salesUserId, byMember, companyTarget);
  return arr[month - 1]?.target ?? 0;
}

export function ytdTargetValue(
  role: Role,
  salesUserId: string,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
  throughMonth = CURRENT_MONTH,
): number {
  const arr = targetArrFor(role, salesUserId, byMember, companyTarget);
  return arr.slice(0, throughMonth).reduce((s, m) => s + m.target, 0);
}

export type SalesTeamMember = { id: string; name: string; initials: string };

// Executive dashboard "Sales Performance" composition. Adhitya Wirambara
// and Leli Al personally run a sales book despite their profiles.role
// being 'manager', so they're included here; Andri Sutomo (profiles.role
// 'sales') has no personal book of business and is excluded. Display-only
// for this dashboard/export — does not change anyone's actual RLS
// role/permissions. Per owner decision 2026-07-20.
const DASHBOARD_SALES_INCLUDE_MANAGERS = new Set([
  "Adhitya Wirambara",
  "Leli Al",
]);
const DASHBOARD_SALES_EXCLUDE = new Set(["Andri Sutomo"]);

export function dashboardSalesTeam(
  salesTeam: SalesTeamMember[],
  ownersById: Record<string, { name: string; initials: string; role: string }>,
): SalesTeamMember[] {
  const managers = Object.entries(ownersById)
    .filter(
      ([, owner]) =>
        owner.role === "manager" &&
        DASHBOARD_SALES_INCLUDE_MANAGERS.has(owner.name),
    )
    .map(([id, owner]) => ({
      id,
      name: owner.name,
      initials: owner.initials,
    }));
  const sales = salesTeam.filter(
    (member) => !DASHBOARD_SALES_EXCLUDE.has(member.name),
  );
  return [...sales, ...managers];
}

function inRange(dateStr: string, range: DateRange): boolean {
  const d = new Date(dateStr).getTime();
  return d >= range.from.getTime() && d <= range.to.getTime();
}

// ---------------------------------------------------------------------------
// Revenue (single point in time, current year)
// ---------------------------------------------------------------------------

export function monthlyRevenue(
  orders: SalesOrder[],
  month = CURRENT_MONTH,
  year = CURRENT_YEAR,
): number {
  return orders
    .filter((s) => {
      const d = new Date(s.date);
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    })
    .reduce((sum, s) => sum + paidRevenue(s), 0);
}

export function ytdRevenue(
  orders: SalesOrder[],
  throughMonth = CURRENT_MONTH,
  year = CURRENT_YEAR,
): number {
  return orders
    .filter((s) => {
      const d = new Date(s.date);
      return d.getFullYear() === year && d.getMonth() + 1 <= throughMonth;
    })
    .reduce((sum, s) => sum + paidRevenue(s), 0);
}

export function revenueByTax(orders: SalesOrder[]) {
  const yearOrders = orders.filter(
    (s) => new Date(s.date).getFullYear() === CURRENT_YEAR,
  );
  let ppn = 0;
  let nonPpn = 0;
  for (const o of yearOrders) {
    const v = paidRevenue(o);
    if (o.taxType === "PPN") ppn += v;
    else if (o.taxType === "Non-PPN") nonPpn += v;
  }
  return { ppn, nonPpn, total: ppn + nonPpn };
}

export function revenueBySource(orders: SalesOrder[]) {
  const yearOrders = orders.filter(
    (s) => new Date(s.date).getFullYear() === CURRENT_YEAR,
  );
  const buckets = { rfq: 0, existing: 0, prototypePaid: 0 };
  for (const o of yearOrders) {
    const v = paidRevenue(o);
    if (o.source === "RFQ / New Product") buckets.rfq += v;
    else if (o.source === "Existing / Repeat Order") buckets.existing += v;
    else if (o.source === "Prototype Paid") buckets.prototypePaid += v;
  }
  return buckets;
}

export function prototypeSummary(orders: SalesOrder[]) {
  const yearOrders = orders.filter(
    (s) =>
      s.type === "Prototype" && new Date(s.date).getFullYear() === CURRENT_YEAR,
  );
  const paidValue = yearOrders
    .filter((o) => o.prototypeStatus === "Paid")
    .reduce((s, o) => s + paidRevenue(o), 0);
  const focCount = yearOrders.filter((o) => o.prototypeStatus === "FOC").length;
  const paidCount = yearOrders.filter(
    (o) => o.prototypeStatus === "Paid",
  ).length;
  return {
    paidValue,
    focCount,
    paidCount,
    supportActivity: paidCount + focCount,
  };
}

export function monthlyRevenueTrend(
  orders: SalesOrder[],
  role: Role,
  salesUserId: string,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
) {
  const targetArr = targetArrFor(role, salesUserId, byMember, companyTarget);
  return Array.from({ length: CURRENT_MONTH }, (_, i) => {
    const m = i + 1;
    return {
      month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
        month: "short",
      }),
      revenue: monthlyRevenue(orders, m),
      target: targetArr[i]?.target ?? 0,
    };
  });
}

export function ytdCumulativeTrend(
  orders: SalesOrder[],
  role: Role,
  salesUserId: string,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
) {
  const targetArr = targetArrFor(role, salesUserId, byMember, companyTarget);
  let cumRev = 0;
  let cumTgt = 0;
  return Array.from({ length: CURRENT_MONTH }, (_, i) => {
    const m = i + 1;
    cumRev += monthlyRevenue(orders, m);
    cumTgt += targetArr[i]?.target ?? 0;
    return {
      month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
        month: "short",
      }),
      achievement: cumRev,
      target: cumTgt,
    };
  });
}

// ---------------------------------------------------------------------------
// Revenue (arbitrary date range — used by Reports)
// ---------------------------------------------------------------------------

export function revenueInRange(orders: SalesOrder[], range: DateRange): number {
  return orders
    .filter((s) => inRange(s.date, range))
    .reduce((sum, s) => sum + paidRevenue(s), 0);
}

export function revenueByTaxInRange(orders: SalesOrder[], range: DateRange) {
  const inR = orders.filter((s) => inRange(s.date, range));
  let ppn = 0;
  let nonPpn = 0;
  for (const o of inR) {
    const v = paidRevenue(o);
    if (o.taxType === "PPN") ppn += v;
    else if (o.taxType === "Non-PPN") nonPpn += v;
  }
  return { ppn, nonPpn, total: ppn + nonPpn };
}

export function revenueBySourceInRange(orders: SalesOrder[], range: DateRange) {
  const inR = orders.filter((s) => inRange(s.date, range));
  const buckets = { rfq: 0, existing: 0, prototypePaid: 0 };
  for (const o of inR) {
    const v = paidRevenue(o);
    if (o.source === "RFQ / New Product") buckets.rfq += v;
    else if (o.source === "Existing / Repeat Order") buckets.existing += v;
    else if (o.source === "Prototype Paid") buckets.prototypePaid += v;
  }
  return buckets;
}

export function prototypeSummaryInRange(
  orders: SalesOrder[],
  range: DateRange,
) {
  const inR = orders.filter(
    (s) => s.type === "Prototype" && inRange(s.date, range),
  );
  const paidValue = inR
    .filter((o) => o.prototypeStatus === "Paid")
    .reduce((s, o) => s + paidRevenue(o), 0);
  const focCount = inR.filter((o) => o.prototypeStatus === "FOC").length;
  const paidCount = inR.filter((o) => o.prototypeStatus === "Paid").length;
  return {
    paidValue,
    focCount,
    paidCount,
    supportActivity: paidCount + focCount,
  };
}

export function monthlyRevenueTrendInRange(
  orders: SalesOrder[],
  role: Role,
  salesUserId: string,
  range: DateRange,
  byMember: TargetsByMember,
  companyTarget: MonthlyTarget[],
) {
  const targetArr = targetArrFor(role, salesUserId, byMember, companyTarget);
  const rows: Array<{ month: string; revenue: number; target: number }> = [];
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  const cursor = new Date(start);
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    if (y === CURRENT_YEAR) {
      const monthLabel = new Date(y, m, 1).toLocaleDateString("id-ID", {
        month: "short",
      });
      const monthStart = new Date(y, m, 1);
      const monthEnd = new Date(y, m + 1, 0);
      const covStart = range.from > monthStart ? range.from : monthStart;
      const covEnd = range.to < monthEnd ? range.to : monthEnd;
      const rev = orders
        .filter((s) => {
          const d = new Date(s.date);
          return d >= covStart && d <= covEnd;
        })
        .reduce((sum, s) => sum + paidRevenue(s), 0);
      const daysInMonth = monthEnd.getDate();
      const covDays =
        Math.round((covEnd.getTime() - covStart.getTime()) / 86_400_000) + 1;
      rows.push({
        month: monthLabel,
        revenue: rev,
        target: ((targetArr[m]?.target ?? 0) * covDays) / daysInMonth,
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return rows;
}

export function topCustomersInRange(
  orders: SalesOrder[],
  clients: Client[],
  range: DateRange,
  limit = 5,
) {
  const totals = new Map<string, number>();
  for (const so of orders) {
    if (!inRange(so.date, range)) continue;
    totals.set(so.clientId, (totals.get(so.clientId) ?? 0) + paidRevenue(so));
  }
  return Array.from(totals.entries())
    .map(([clientId, revenue]) => ({
      client: clients.find((c) => c.id === clientId),
      revenue,
    }))
    .filter((row): row is { client: Client; revenue: number } =>
      Boolean(row.client),
    )
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// Per-sales achievement (real revenue) vs target YTD, all sales team
// members.
export function targetPerSales(
  orders: SalesOrder[],
  salesTeam: SalesTeamMember[],
  byMember: TargetsByMember,
) {
  return salesTeam.map((member) => {
    const memberOrders = orders.filter(
      (s) =>
        s.ownerId === member.id &&
        new Date(s.date).getFullYear() === CURRENT_YEAR,
    );
    const achievement = memberOrders.reduce((s, o) => s + paidRevenue(o), 0);
    const target = targetsFor(byMember, member.id)
      .slice(0, CURRENT_MONTH)
      .reduce((s, mm) => s + mm.target, 0);
    return {
      name: member.name.split(" ")[0],
      fullName: member.name,
      target,
      achievement,
    };
  });
}

export function salesPerformanceInRange(
  orders: SalesOrder[],
  tasks: Task[],
  salesTeam: SalesTeamMember[],
  range: DateRange,
  byMember: TargetsByMember,
) {
  return salesTeam
    .map((member) => {
      const memberOrders = orders.filter(
        (s) => s.ownerId === member.id && inRange(s.date, range),
      );
      const revenue = memberOrders.reduce((s, o) => s + paidRevenue(o), 0);
      const target = sumMonthlyProrated(targetsFor(byMember, member.id), range);
      const overdue = tasks.filter(
        (t) => t.ownerId === member.id && t.status === "Overdue",
      ).length;
      const openTasks = tasks.filter(
        (t) => t.ownerId === member.id && t.status !== "Done",
      ).length;
      return {
        member,
        revenue,
        target,
        pct: target > 0 ? revenue / target : 0,
        overdue,
        openTasks,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function sumMonthlyProrated(
  arr: { month: number; target: number }[],
  range: DateRange,
): number {
  if (arr.length === 0) return 0;
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), 1);
  const cursor = new Date(start);
  let total = 0;
  while (cursor <= end) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    if (y === CURRENT_YEAR) {
      const monthEnd = new Date(y, m + 1, 0);
      const monthStart = new Date(y, m, 1);
      const covStart = range.from > monthStart ? range.from : monthStart;
      const covEnd = range.to < monthEnd ? range.to : monthEnd;
      const covDays = Math.max(
        0,
        Math.round((covEnd.getTime() - covStart.getTime()) / 86_400_000) + 1,
      );
      total += ((arr[m]?.target ?? 0) * covDays) / monthEnd.getDate();
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Operational counters
// ---------------------------------------------------------------------------

export function taskCounts(tasks: Task[]) {
  return {
    today: tasks.filter((x) => x.status === "Today").length,
    overdue: tasks.filter((x) => x.status === "Overdue").length,
    upcoming: tasks.filter((x) => x.status === "Upcoming").length,
    open: tasks.filter((x) => x.status !== "Done").length,
  };
}

export function activeCommercialCount(items: CommercialItem[]) {
  return items.length;
}

// "Commit" (90%) is the closest-to-closing open stage — items essentially
// agreed, waiting on the customer's formal PO. Same equivalence used by
// Reports' "Waiting PO — Nilai & Aging" card.
export function waitingPoValue(items: CommercialItem[]) {
  return items
    .filter((c) => c.stage === "Commit")
    .reduce((s, c) => s + c.estimatedValue, 0);
}

export function todaysFollowUps(
  tasks: Task[],
  clients: Client[],
  items: CommercialItem[],
  ownersById: Record<string, { name: string; initials: string }>,
) {
  return tasks
    .filter((t) => t.status === "Today" || t.status === "Overdue")
    .map((t) => {
      const client = clients.find((c) => c.id === t.clientId);
      const ci = t.commercialItemId
        ? items.find((c) => c.id === t.commercialItemId)
        : undefined;
      const owner = ownersById[t.ownerId];
      return { task: t, client, commercialItem: ci, owner };
    })
    .sort(
      (a, b) =>
        (a.task.status === "Overdue" ? -1 : 1) -
        (b.task.status === "Overdue" ? -1 : 1),
    );
}

// ---------------------------------------------------------------------------
// Manager-specific
// ---------------------------------------------------------------------------

export function salesPerformance(
  orders: SalesOrder[],
  tasks: Task[],
  clients: Client[],
  salesTeam: SalesTeamMember[],
  byMember: TargetsByMember,
) {
  return salesTeam
    .map((member) => {
      const memberOrders = orders.filter(
        (s) =>
          s.ownerId === member.id &&
          new Date(s.date).getFullYear() === CURRENT_YEAR,
      );
      const revenue = memberOrders.reduce((s, o) => s + paidRevenue(o), 0);
      const target = targetsFor(byMember, member.id)
        .slice(0, CURRENT_MONTH)
        .reduce((s, mm) => s + mm.target, 0);
      const overdue = tasks.filter(
        (t) => t.ownerId === member.id && t.status === "Overdue",
      ).length;
      const openTasks = tasks.filter(
        (t) => t.ownerId === member.id && t.status !== "Done",
      ).length;
      const activeClients = clients.filter(
        (c) => c.ownerId === member.id && c.status !== "Lost",
      ).length;
      return {
        member,
        revenue,
        target,
        pct: target > 0 ? revenue / target : 0,
        overdue,
        openTasks,
        activeClients,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function activityCompliance(clients: Client[]) {
  const active = clients.filter((c) => c.status !== "Lost");
  const withNext = active.filter((c) => Boolean(c.nextFu)).length;
  return active.length > 0 ? withNext / active.length : 0;
}

// ---------------------------------------------------------------------------
// Executive-specific
// ---------------------------------------------------------------------------

export function topCustomersYtd(
  orders: SalesOrder[],
  clients: Client[],
  limit = 5,
) {
  const totals = new Map<string, number>();
  for (const so of orders) {
    if (new Date(so.date).getFullYear() !== CURRENT_YEAR) continue;
    totals.set(so.clientId, (totals.get(so.clientId) ?? 0) + paidRevenue(so));
  }
  return Array.from(totals.entries())
    .map(([clientId, revenue]) => ({
      client: clients.find((c) => c.id === clientId),
      revenue,
    }))
    .filter((row): row is { client: Client; revenue: number } =>
      Boolean(row.client),
    )
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

// Funnel progression through the seven weighted stages (PRD §7), ending at
// Closed Won — Closed Lost is the "we lost" branch, not a funnel step.
const FUNNEL_STAGES: CommercialStage[] = [
  "Client Request for Quotes",
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
  "Closed Won",
];

export function quotationFunnel(items: CommercialItem[]) {
  const stages: Array<{ stage: string; count: number; value: number }> =
    FUNNEL_STAGES.map((stage) => ({ stage, count: 0, value: 0 }));
  for (const ci of items) {
    const s = stages.find((x) => x.stage === ci.stage);
    if (s) {
      s.count += 1;
      s.value += ci.estimatedValue;
    }
  }
  return stages;
}

export function forecastVsAchievement(
  orders: SalesOrder[],
  items: CommercialItem[],
  ytdTargetExecutive: number,
) {
  const achievement = ytdRevenue(orders);
  // Closed Won is already realized revenue (counted in `achievement` via
  // orders) and Closed Lost contributes nothing — only still-open stages
  // count toward the pipeline forecast, weighted per PRD §7.
  const pipeline = items.reduce((s, ci) => {
    if (ci.stage === "Closed Won" || ci.stage === "Closed Lost") return s;
    return s + (forecastValue(ci.estimatedValue, ci.stage) ?? 0);
  }, 0);
  const forecast = achievement + pipeline;
  return { achievement, forecast, target: ytdTargetExecutive };
}

export function riskAlerts(
  tasks: Task[],
  items: CommercialItem[],
  clients: Client[],
) {
  const alerts: Array<{
    id: string;
    severity: "high" | "medium";
    title: string;
    detail: string;
  }> = [];
  const overdue = tasks.filter((t) => t.status === "Overdue");
  if (overdue.length > 0) {
    alerts.push({
      id: "r1",
      severity: "high",
      title: `${overdue.length} follow-up overdue`,
      detail: "Tersebar di beberapa sales; segera dijadwalkan ulang.",
    });
  }
  const bigPending = items.filter(
    (c) => c.stage === "Commit" && c.estimatedValue > 400_000_000,
  );
  if (bigPending.length > 0) {
    alerts.push({
      id: "r2",
      severity: "medium",
      title: `${bigPending.length} PO besar tertahan`,
      detail: `Total nilai menunggu konfirmasi: ${bigPending.reduce((s, c) => s + c.estimatedValue, 0).toLocaleString("id-ID")} rupiah.`,
    });
  }
  const dormantHigh = clients.filter(
    (c) => c.status === "Dormant" && c.spendingYtd > 100_000_000,
  );
  if (dormantHigh.length > 0) {
    alerts.push({
      id: "r3",
      severity: "medium",
      title: `${dormantHigh.length} client high-value dormant`,
      detail: "Prioritaskan re-engagement bulan ini.",
    });
  }
  return alerts;
}
