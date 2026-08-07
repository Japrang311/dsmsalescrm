import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateShort, formatRupiahShort } from "@/lib/format";
import { useRole, ROLE_LABEL } from "@/context/role-context";
import { CURRENT_MONTH, CURRENT_YEAR, NOW } from "@/lib/domain";
import {
  activityCompliance,
  quotationFunnel,
  riskAlerts,
  sumTargetsThroughMonth,
  taskCounts,
  targetForMonth,
  targetsFor,
} from "@/lib/data/dashboard-selectors";
import { forecastValue } from "@/lib/data/commercial-stages";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getSalesOrdersMetrics } from "@/lib/data/sales-orders-metrics";
import {
  getSalesOrdersMonthlyTrend,
  getSalesOrdersOwnerYtd,
} from "@/lib/data/sales-orders-trend";
import {
  getSalesTaskClientMetrics,
  getTopCustomers,
} from "@/lib/data/sales-performance-metrics";
import {
  ReportFilterBar,
  defaultReportFilters,
  type ReportFilters,
} from "@/components/reports/ReportFilterBar";
import {
  agingBucket,
  filterCommercialItems,
  filterSalesOrders,
  reportSalesPerformanceFromRpc,
} from "@/lib/report-selectors";
import { exportExecutiveReportXlsx } from "@/lib/export-xlsx";
import { exportExecutiveReportPdf } from "@/lib/export-pdf";
import type { DashboardExportContext } from "@/lib/dashboard-export-data";
import { EmptyExportError } from "@/lib/export-csv";
import { ReportsKpiCards } from "@/components/reports/ReportsKpiCards";
import { ReportsTrendCharts } from "@/components/reports/ReportsTrendCharts";
import { ReportsForecastSection } from "@/components/reports/ReportsForecastSection";
import { ReportsFunnelSection } from "@/components/reports/ReportsFunnelSection";
import { ReportsPerformanceSection } from "@/components/reports/ReportsPerformanceSection";
import { ReportsComplianceSection } from "@/components/reports/ReportsComplianceSection";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Executive Reports · DSM" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { role, authReady } = useRole();
  const readOnly = role === "executive";
  const {
    orders: allOrders,
    items: allItems,
    tasks: allTasks,
    clients: clientList,
    ownersById,
    salesTeam,
    targetsByMember,
    companyTarget,
    currentUserId,
    taskMetrics,
    isLoading,
  } = useDashboardData();

  const [filters, setFilters] = useState<ReportFilters>(() =>
    defaultReportFilters({ from: new Date(CURRENT_YEAR, 0, 1), to: NOW }),
  );
  const patch = (p: Partial<ReportFilters>) =>
    setFilters((s) => ({ ...s, ...p }));

  // RLS already scopes allOrders/allItems by role — filterSalesOrders/
  // filterCommercialItems only apply the report's own filter UI now.
  const rows = useMemo(
    () => filterSalesOrders(allOrders, filters),
    [allOrders, filters],
  );
  const commercial = useMemo(
    () => filterCommercialItems(allItems, filters),
    [allItems, filters],
  );
  const clients = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);
  const owners = ownersById;

  // Aggregates --------------------------------------------------------------
  // Backed by the same aggregate RPCs the Dashboard uses (sales_orders_
  // metrics/monthly_trend/owner_ytd/top_customers, sales_task_client_
  // metrics), extended with the Reports filter bar's full client/tax/
  // source/soType filter set, instead of reducing over the unbounded
  // allOrders/allTasks/allItems arrays client-side. allOrders/allTasks stay
  // in use below only for the row-level export and the smaller pipeline/
  // task-inbox sections that have no equivalent aggregate yet.
  const metricsFilters = {
    from: filters.range.from,
    to: filters.range.to,
    ownerId: filters.ownerId,
    clientId: filters.clientId,
    taxType: filters.taxType,
    soType: filters.soType,
    source: filters.source,
  };
  const metricsQuery = useQuery({
    queryKey: ["sales-orders", "metrics", "reports", metricsFilters],
    queryFn: () => getSalesOrdersMetrics(metricsFilters),
    enabled: authReady,
  });
  const totals = useMemo(() => {
    const m = metricsQuery.data;
    return {
      revenue: (m?.ppnValue ?? 0) + (m?.nonPpnValue ?? 0),
      ppn: m?.ppnValue ?? 0,
      nonPpn: m?.nonPpnValue ?? 0,
      newProduct: m?.newProductValue ?? 0,
      existing: m?.existingValue ?? 0,
      protoPaid: m?.prototypePaidValue ?? 0,
      protoFocCount: m?.focCount ?? 0,
      protoPaidCount: m?.prototypePaidCount ?? 0,
    };
  }, [metricsQuery.data]);

  // year_code is calendar-year-scoped (matches the trend charts' existing
  // CURRENT_YEAR-only behavior below) — a custom sub-year range in the
  // filter bar still narrows KPI totals above (date-range-aware), but the
  // trend/top-customers RPCs use the range's end year as a whole.
  const trendFilters = {
    year: filters.range.to.getFullYear(),
    ownerId: filters.ownerId,
    clientId: filters.clientId,
    taxType: filters.taxType,
    soType: filters.soType,
    source: filters.source,
  };
  const monthlyTrendQuery = useQuery({
    queryKey: ["sales-orders", "monthly-trend", "reports", trendFilters],
    queryFn: () => getSalesOrdersMonthlyTrend(trendFilters),
    enabled: authReady,
  });
  const ownerYtdQuery = useQuery({
    queryKey: ["sales-orders", "owner-ytd", "reports", trendFilters],
    queryFn: () => getSalesOrdersOwnerYtd(trendFilters),
    enabled: authReady,
  });
  const topCustomersQuery = useQuery({
    queryKey: ["sales-orders", "top-customers", "reports", trendFilters],
    queryFn: () => getTopCustomers({ ...trendFilters, limit: 5 }),
    enabled: authReady,
  });
  // Task/client detail is never filtered by the Reports filter bar (matches
  // the pre-RPC behavior, which always scanned the full allTasks/clientList
  // regardless of filters) — same RPC + queryKey as the Dashboard's
  // SalesPerformanceTable/ActivityComplianceCard, so this reuses their
  // cache instead of firing a duplicate request.
  const taskClientMetricsQuery = useQuery({
    queryKey: ["sales-task-client-metrics", "dashboard"],
    queryFn: () => getSalesTaskClientMetrics(),
    enabled: authReady,
  });

  // YTD achievement vs target (respects ownerId filter for scope) ----------
  const yearTargetTotal = useMemo(() => {
    if (filters.ownerId !== "all") {
      const arr = targetsFor(targetsByMember, filters.ownerId);
      if (arr.length === 0) return 0;
      return sumTargetsThroughMonth(arr);
    }
    if (role === "sales") {
      return sumTargetsThroughMonth(
        targetsFor(targetsByMember, currentUserId ?? ""),
      );
    }
    return sumTargetsThroughMonth(companyTarget);
  }, [filters.ownerId, role, targetsByMember, companyTarget, currentUserId]);

  const ytdAchievementPct =
    yearTargetTotal > 0 ? totals.revenue / yearTargetTotal : 0;

  // Cumulative YTD trend within range, backed by monthlyTrendQuery --------
  const monthRevenueByIndex = useMemo(() => {
    const arr = new Array(12).fill(0);
    for (const point of monthlyTrendQuery.data ?? []) {
      arr[point.month - 1] = point.revenue;
    }
    return arr;
  }, [monthlyTrendQuery.data]);

  const cumulativeTrend = useMemo(() => {
    const targetsArr =
      filters.ownerId !== "all" &&
      targetsFor(targetsByMember, filters.ownerId).length > 0
        ? targetsFor(targetsByMember, filters.ownerId)
        : companyTarget;
    let cr = 0;
    let ct = 0;
    return Array.from({ length: CURRENT_MONTH }, (_, i) => {
      cr += monthRevenueByIndex[i];
      ct += targetForMonth(targetsArr, i + 1);
      return {
        month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
          month: "short",
        }),
        achievement: cr,
        target: ct,
      };
    });
  }, [monthRevenueByIndex, filters.ownerId, targetsByMember, companyTarget]);

  const monthlyTrend = useMemo(() => {
    const targetsArr =
      filters.ownerId !== "all" &&
      targetsFor(targetsByMember, filters.ownerId).length > 0
        ? targetsFor(targetsByMember, filters.ownerId)
        : companyTarget;
    return Array.from({ length: CURRENT_MONTH }, (_, i) => ({
      month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
        month: "short",
      }),
      revenue: monthRevenueByIndex[i],
      target: targetForMonth(targetsArr, i + 1),
    }));
  }, [monthRevenueByIndex, filters.ownerId, targetsByMember, companyTarget]);

  const sourceBreakdown = useMemo(
    () => [
      { name: "New Product", value: totals.newProduct },
      { name: "Existing / Repeat Order", value: totals.existing },
      { name: "Prototype Paid", value: totals.protoPaid },
    ],
    [totals],
  );

  // Forecast: achievement + weighted pipeline value per the seven weighted
  // stages (PRD §7) — Closed Won is already realized revenue counted in
  // `totals.revenue`, Closed Lost contributes nothing.
  const forecast = useMemo(() => {
    const pipeline = commercial.reduce((s, ci) => {
      if (ci.stage === "Closed Won" || ci.stage === "Closed Lost") return s;
      return s + (forecastValue(ci.estimatedValue, ci.stage) ?? 0);
    }, 0);
    return {
      achievement: totals.revenue,
      pipeline,
      total: totals.revenue + pipeline,
      target: yearTargetTotal,
    };
  }, [commercial, totals.revenue, yearTargetTotal]);

  const funnel = useMemo(() => quotationFunnel(allItems), [allItems]);
  const openQuotationValue = useMemo(
    () =>
      commercial
        .filter((c) => c.stage === "Quotes Sent")
        .reduce((s, c) => s + c.estimatedValue, 0),
    [commercial],
  );

  // "Commit" (90%) is the closest-to-closing open stage — items essentially
  // agreed, waiting on the customer's formal PO.
  const waitingPoRows = useMemo(() => {
    return commercial
      .filter((c) => c.stage === "Commit")
      .map((c) => ({ item: c, aging: agingBucket(c.updatedAt) }))
      .sort((a, b) => b.item.estimatedValue - a.item.estimatedValue);
  }, [commercial]);
  const waitingPoTotal = waitingPoRows.reduce(
    (s, r) => s + r.item.estimatedValue,
    0,
  );

  const topCustomers = useMemo(() => {
    return (topCustomersQuery.data ?? [])
      .map((r) => ({ client: clients[r.clientId], revenue: r.revenue }))
      .filter((r) => r.client);
  }, [topCustomersQuery.data, clients]);

  const includeTaskDetail = role !== "executive";
  const salesPerf = useMemo(
    () =>
      reportSalesPerformanceFromRpc(
        ownerYtdQuery.data ?? [],
        taskClientMetricsQuery.data ?? [],
        salesTeam,
        targetsByMember,
        { includeTaskDetail },
      ),
    [
      ownerYtdQuery.data,
      taskClientMetricsQuery.data,
      salesTeam,
      targetsByMember,
      includeTaskDetail,
    ],
  );

  const taskSummary = useMemo(
    () => taskCounts(allTasks, role === "sales" ? undefined : taskMetrics),
    [allTasks, role, taskMetrics],
  );

  const compliance = useMemo(
    () => activityCompliance(clientList),
    [clientList],
  );
  const alerts = useMemo(
    () => riskAlerts(allTasks, allItems, clientList),
    [allTasks, allItems, clientList],
  );

  const exportContext = useMemo<DashboardExportContext>(
    () => ({
      role,
      range: filters.range,
      salesUserId: currentUserId ?? "",
      orders: rows,
      tasks: allTasks,
      items: commercial,
      clients: clientList,
      ownersById,
      salesTeam,
      targetsByMember,
      companyTarget,
      taskMetrics,
    }),
    [
      role,
      filters.range,
      currentUserId,
      rows,
      allTasks,
      commercial,
      clientList,
      ownersById,
      salesTeam,
      targetsByMember,
      companyTarget,
      taskMetrics,
    ],
  );

  const handleExport = (format: "xlsx" | "pdf") => {
    try {
      if (format === "xlsx") {
        const rowCount = exportExecutiveReportXlsx(exportContext);
        toast.success("Executive Report Excel dibuat", {
          description: `Rentang ${formatDateShort(filters.range.from)} – ${formatDateShort(filters.range.to)} · ${rowCount} baris laporan.`,
        });
        return;
      }

      exportExecutiveReportPdf(exportContext);
      toast.success("Executive Report PDF dibuat", {
        description: `Rentang ${formatDateShort(filters.range.from)} – ${formatDateShort(filters.range.to)} · ${rows.length} SO · ${formatRupiahShort(totals.revenue)}.`,
      });
    } catch (error) {
      if (error instanceof EmptyExportError) {
        toast.error("Tidak ada data untuk export", {
          description: error.message,
        });
        return;
      }
      toast.error("Gagal membuat export", {
        description:
          error instanceof Error ? error.message : "Terjadi kesalahan.",
      });
    }
  };

  const filterContext = [
    `Rentang: ${formatDateShort(filters.range.from)} – ${formatDateShort(filters.range.to)}`,
    filters.ownerId !== "all"
      ? `Sales: ${owners[filters.ownerId]?.name ?? "-"}`
      : "Semua sales",
    filters.clientId !== "all"
      ? `Klien: ${clients[filters.clientId]?.name ?? "-"}`
      : "Semua klien",
    filters.source !== "all" ? `Source: ${filters.source}` : null,
    filters.taxType !== "all" ? `Pajak: ${filters.taxType}` : null,
    filters.soType !== "all" ? `Tipe: ${filters.soType}` : null,
  ].filter(Boolean);

  if (
    !authReady ||
    isLoading ||
    metricsQuery.isLoading ||
    monthlyTrendQuery.isLoading ||
    ownerYtdQuery.isLoading ||
    topCustomersQuery.isLoading ||
    taskClientMetricsQuery.isLoading
  ) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading reports…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <BarChart3 className="h-5 w-5 text-primary" /> Executive Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Scope: {ROLE_LABEL[role]}
            {readOnly ? " · read-only" : ""} · Semua nilai FOC dikeluarkan dari
            revenue.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              className="gap-2"
              onClick={() => handleExport("xlsx")}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              onClick={() => handleExport("pdf")}
            >
              <FileText className="h-4 w-4" /> PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ReportFilterBar
        role={role}
        value={filters}
        onChange={patch}
        clients={clientList}
        salesTeam={salesTeam}
      />

      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {filterContext.map((f) => (
          <Badge key={f as string} variant="secondary" className="font-normal">
            {f}
          </Badge>
        ))}
      </div>

      {/* KPI cards */}
      <ReportsKpiCards
        totals={totals}
        ytdAchievementPct={ytdAchievementPct}
        yearTargetTotal={yearTargetTotal}
      />

      {/* Achievement YTD vs Target */}
      <ReportsTrendCharts
        cumulativeTrend={cumulativeTrend}
        monthlyTrend={monthlyTrend}
      />

      {/* Source breakdown + Forecast */}
      <ReportsForecastSection
        totalRevenue={totals.revenue}
        sourceBreakdown={sourceBreakdown}
        forecast={forecast}
      />

      {/* Quotation funnel + Waiting PO */}
      <ReportsFunnelSection
        funnel={funnel}
        openQuotationValue={openQuotationValue}
        taskSummary={taskSummary}
        role={role}
        waitingPoRows={waitingPoRows}
        waitingPoTotal={waitingPoTotal}
        clientsById={clients}
        owners={owners}
      />

      {/* Top customers + Sales perf */}
      <ReportsPerformanceSection
        topCustomers={topCustomers}
        totalRevenue={totals.revenue}
        salesPerf={salesPerf}
      />

      {/* Compliance + Prototype + Alerts */}
      <ReportsComplianceSection
        compliance={compliance}
        totals={totals}
        alerts={alerts}
      />

      {readOnly && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          Top Executive view — read-only. Tidak ada aksi
          create/edit/archive/delete pada laporan ini.
        </p>
      )}
    </div>
  );
}
