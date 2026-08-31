import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportDashboardPdf } from "@/lib/export-pdf";
import {
  exportFollowUpsCsv,
  exportMonthlyRevenueCsv,
  exportSalesPerformanceCsv,
  exportTopCustomersCsv,
  EmptyExportError,
} from "@/lib/export-csv";
import {
  exportFollowUpsXlsx,
  exportMonthlyRevenueXlsx,
  exportSalesPerformanceXlsx,
  exportTopCustomersXlsx,
} from "@/lib/export-xlsx";

import { useRole, ROLE_LABEL } from "@/context/role-context-core";
import { CURRENT_MONTH } from "@/lib/domain";
import {
  monthlyTargetValue,
  taskCounts,
  ytdTargetValue,
} from "@/lib/data/dashboard-selectors";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { getSalesOrdersMetrics } from "@/lib/data/sales-orders-metrics";
import { getPipelineMetrics } from "@/lib/data/pipeline-metrics";
import { formatPercent, formatRupiahShort } from "@/lib/format";

import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard";
import { KpiCard, KpiProgress } from "@/components/dashboard/KpiCard";
import { TodaysFollowUpList } from "@/components/dashboard/TodaysFollowUpList";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { SalesPerformanceTable } from "@/components/dashboard/SalesPerformanceTable";
import { ActivityComplianceCard } from "@/components/dashboard/ActivityComplianceCard";
import {
  ForecastVsAchievementCard,
  QuotationFunnelCard,
  RiskAlertsCard,
  TopCustomersCard,
} from "@/components/dashboard/ExecutiveCards";
import {
  MonthlyAchievementVsTargetChart,
  SingleSalesTargetChart,
  TargetAllSalesChart,
  YtdAchievementVsTargetChart,
} from "@/components/dashboard/TargetCharts";
import { Badge } from "@/components/ui/badge";
import {
  DateRangePicker,
  type PeriodRange,
} from "@/components/dashboard/DateRangePicker";
import { CalendarIncompleteWarning } from "@/components/tasks/CalendarIncompleteWarning";
import { useState } from "react";
import { NOW, CURRENT_YEAR } from "@/lib/domain";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · DSM Sales Execution" },
      {
        name: "description",
        content:
          "Achievement, revenue, pipeline, and follow-up priorities for the DSM sales team.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { role, authReady } = useRole();
  const {
    orders,
    tasks: allTasks,
    items,
    clients,
    ownersById,
    salesTeam,
    targetsByMember,
    companyTarget,
    currentUserId,
    taskMetrics,
    isLoading,
  } = useDashboardData();
  const monthName = new Date(2026, CURRENT_MONTH - 1, 1).toLocaleDateString(
    "id-ID",
    { month: "long" },
  );

  // Server-aggregated KPI totals, replacing client-side reduce() over the
  // unbounded orders/items arrays from useDashboardData (still fetched
  // above for the other Dashboard widgets — charts, tables, executive
  // cards — that need row-level data).
  const ytdMetricsQuery = useQuery({
    queryKey: ["sales-orders", "metrics", "dashboard-ytd"],
    queryFn: () =>
      getSalesOrdersMetrics({ from: new Date(CURRENT_YEAR, 0, 1), to: NOW }),
    enabled: authReady,
  });
  const monthMetricsQuery = useQuery({
    queryKey: ["sales-orders", "metrics", "dashboard-month"],
    queryFn: () =>
      getSalesOrdersMetrics({
        from: new Date(CURRENT_YEAR, CURRENT_MONTH - 1, 1),
        to: NOW,
      }),
    enabled: authReady,
  });
  const pipelineMetricsQuery = useQuery({
    queryKey: ["pipeline", "metrics", "dashboard"],
    queryFn: () => getPipelineMetrics(),
    enabled: authReady,
  });
  const ytdMetrics = ytdMetricsQuery.data;
  const monthMetrics = monthMetricsQuery.data;
  const pipelineMetrics = pipelineMetricsQuery.data;

  // Reporting period (drives the PDF export). Default: Year to date.
  const [period, setPeriod] = useState<PeriodRange>({
    from: new Date(CURRENT_YEAR, 0, 1),
    to: NOW,
  });
  const exportContext = {
    role,
    range: period,
    salesUserId: currentUserId ?? "",
    orders,
    tasks: allTasks,
    items,
    clients,
    ownersById,
    salesTeam,
    targetsByMember,
    companyTarget,
    taskMetrics,
  };

  // Wraps export handlers: validates the range, shows a loading toast, and
  // surfaces empty-data / unexpected errors to the user with actionable copy.
  function runExport(
    format: "PDF" | "CSV" | "Excel",
    label: string,
    fn: () => number,
  ) {
    if (
      !period?.from ||
      !period?.to ||
      Number.isNaN(period.from.getTime()) ||
      Number.isNaN(period.to.getTime())
    ) {
      toast.error("Periode tidak valid", {
        description: "Pilih tanggal mulai dan selesai terlebih dahulu.",
      });
      return;
    }
    if (period.from > period.to) {
      toast.error("Periode tidak valid", {
        description: "Tanggal mulai harus sebelum tanggal selesai.",
      });
      return;
    }
    const toastId = toast.loading(`Menyiapkan ${label} (${format})…`);
    try {
      const count = fn();
      toast.success(`${label} berhasil di-export`, {
        id: toastId,
        description: `${format} · ${count.toLocaleString("id-ID")} baris data.`,
      });
    } catch (err) {
      if (err instanceof EmptyExportError) {
        toast.error("Tidak ada data untuk di-export", {
          id: toastId,
          description: err.message + " Ubah periode dan coba lagi.",
        });
        return;
      }
      console.error("[export] failed", err);
      toast.error(`Gagal export ${label}`, {
        id: toastId,
        description:
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan tak terduga. Coba lagi.",
        action: {
          label: "Coba lagi",
          onClick: () => runExport(format, label, fn),
        },
      });
    }
  }

  const ytd = (ytdMetrics?.ppnValue ?? 0) + (ytdMetrics?.nonPpnValue ?? 0);
  const yearlyTgt = ytdTargetValue(
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
    12,
  );
  const ytdPct = yearlyTgt > 0 ? ytd / yearlyTgt : 0;

  const monthRev =
    (monthMetrics?.ppnValue ?? 0) + (monthMetrics?.nonPpnValue ?? 0);
  const monthTgt = monthlyTargetValue(
    role,
    currentUserId ?? "",
    targetsByMember,
    companyTarget,
  );
  const monthPct = monthTgt > 0 ? monthRev / monthTgt : 0;

  const tax = {
    ppn: ytdMetrics?.ppnValue ?? 0,
    nonPpn: ytdMetrics?.nonPpnValue ?? 0,
    total: ytd,
  };
  const src = {
    newProduct: ytdMetrics?.newProductValue ?? 0,
    existing: ytdMetrics?.existingValue ?? 0,
    prototypePaid: ytdMetrics?.prototypePaidValue ?? 0,
  };
  const proto = {
    paidValue: ytdMetrics?.prototypePaidValue ?? 0,
    focCount: ytdMetrics?.focCount ?? 0,
    paidCount: ytdMetrics?.prototypePaidCount ?? 0,
  };
  const tasks = taskCounts(
    allTasks,
    role === "sales" ? undefined : taskMetrics,
  );
  const overdueAttention = tasks.overdue + tasks.escalated;
  const waitingPo =
    pipelineMetrics?.stages.find((s) => s.stage === "Commit")?.totalValue ?? 0;
  const activeCi = pipelineMetrics?.totals.itemCount ?? 0;

  if (
    isLoading ||
    ytdMetricsQuery.isLoading ||
    monthMetricsQuery.isLoading ||
    pipelineMetricsQuery.isLoading
  ) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-16 text-sm text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Scope:{" "}
            <span className="font-medium text-foreground">
              {ROLE_LABEL[role]}
            </span>
            {" · "}
            Periode {monthName} 2026
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={period} onChange={setPeriod} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>
                Download laporan (periode dipilih)
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  runExport("PDF", "Laporan dashboard", () => {
                    exportDashboardPdf(exportContext);
                    return 1;
                  })
                }
              >
                <FileText className="h-4 w-4" />
                Dashboard PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                CSV
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  runExport("CSV", "Monthly revenue vs target", () =>
                    exportMonthlyRevenueCsv(exportContext),
                  )
                }
              >
                <FileText className="h-4 w-4" />
                Monthly revenue vs target
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  runExport("CSV", "Today & overdue follow-ups", () =>
                    exportFollowUpsCsv(exportContext),
                  )
                }
              >
                <FileText className="h-4 w-4" />
                Today &amp; overdue follow-ups
              </DropdownMenuItem>
              {(role === "manager" ||
                role === "executive" ||
                role === "super_admin") && (
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() =>
                    runExport("CSV", "Sales performance vs target", () =>
                      exportSalesPerformanceCsv(exportContext),
                    )
                  }
                >
                  <FileText className="h-4 w-4" />
                  Sales performance vs target
                </DropdownMenuItem>
              )}
              {(role === "executive" || role === "super_admin") && (
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() =>
                    runExport("CSV", "Top customers", () =>
                      exportTopCustomersCsv(exportContext),
                    )
                  }
                >
                  <FileText className="h-4 w-4" />
                  Top customers
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Excel
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  runExport("Excel", "Monthly revenue vs target", () =>
                    exportMonthlyRevenueXlsx(exportContext),
                  )
                }
              >
                <FileSpreadsheet className="h-4 w-4" />
                Monthly revenue vs target
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2"
                onSelect={() =>
                  runExport("Excel", "Today & overdue follow-ups", () =>
                    exportFollowUpsXlsx(exportContext),
                  )
                }
              >
                <FileSpreadsheet className="h-4 w-4" />
                Today &amp; overdue follow-ups
              </DropdownMenuItem>
              {(role === "manager" ||
                role === "executive" ||
                role === "super_admin") && (
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() =>
                    runExport("Excel", "Sales performance vs target", () =>
                      exportSalesPerformanceXlsx(exportContext),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Sales performance vs target
                </DropdownMenuItem>
              )}
              {(role === "executive" || role === "super_admin") && (
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() =>
                    runExport("Excel", "Top customers", () =>
                      exportTopCustomersXlsx(exportContext),
                    )
                  }
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Top customers
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AiSummaryCard />

      <CalendarIncompleteWarning tasks={allTasks} metrics={taskMetrics} />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Achievement YTD vs Yearly Target"
          value={formatRupiahShort(ytd)}
          right={<Target className="h-4 w-4 text-primary" />}
          sub={
            <>
              Target <span className="num">{formatRupiahShort(yearlyTgt)}</span>{" "}
              · Variance{" "}
              <span
                className={
                  ytd - yearlyTgt >= 0 ? "text-success" : "text-destructive"
                }
              >
                {formatRupiahShort(ytd - yearlyTgt)}
              </span>
            </>
          }
        >
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="num font-medium text-foreground">
              {formatPercent(ytdPct)}
            </span>
          </div>
          <KpiProgress
            pct={ytdPct}
            tone={
              ytdPct >= 1 ? "success" : ytdPct >= 0.8 ? "primary" : "warning"
            }
          />
        </KpiCard>

        <KpiCard
          label={`Monthly Achievement · ${monthName}`}
          value={formatRupiahShort(monthRev)}
          right={<Wallet className="h-4 w-4 text-primary" />}
          sub={
            <>
              Target <span className="num">{formatRupiahShort(monthTgt)}</span>
            </>
          }
        >
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="num font-medium text-foreground">
              {formatPercent(monthPct)}
            </span>
          </div>
          <KpiProgress
            pct={monthPct}
            tone={
              monthPct >= 1
                ? "success"
                : monthPct >= 0.8
                  ? "primary"
                  : "warning"
            }
          />
        </KpiCard>

        <KpiCard
          label="Total Revenue YTD"
          value={formatRupiahShort(tax.total)}
          right={<FileText className="h-4 w-4 text-primary" />}
          sub="PPN & Non-PPN gabungan"
        >
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-surface-muted px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                PPN
              </div>
              <div className="num text-sm font-semibold text-foreground">
                {formatRupiahShort(tax.ppn)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-muted px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Non-PPN
              </div>
              <div className="num text-sm font-semibold text-foreground">
                {formatRupiahShort(tax.nonPpn)}
              </div>
            </div>
          </div>
        </KpiCard>

        <KpiCard
          label="Waiting PO Value"
          value={formatRupiahShort(waitingPo)}
          right={<Clock className="h-4 w-4 text-warning" />}
          sub={
            <>
              <span className="num font-medium text-foreground">
                {activeCi}
              </span>{" "}
              commercial items aktif
            </>
          }
        />
      </div>

      {/* Second row: revenue source + prototype + task counters */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue Source YTD"
          value={formatRupiahShort(
            src.newProduct + src.existing + src.prototypePaid,
          )}
          right={<Boxes className="h-4 w-4 text-primary" />}
        >
          <div className="mt-2 space-y-1.5 text-xs">
            <SourceRow
              label="New Product"
              value={src.newProduct}
              color="bg-primary"
            />
            <SourceRow
              label="Existing / Repeat Order"
              value={src.existing}
              color="bg-success"
            />
            <SourceRow
              label="Prototype Paid"
              value={src.prototypePaid}
              color="bg-warning"
            />
          </div>
        </KpiCard>

        <KpiCard
          label="Prototype Summary"
          value={formatRupiahShort(proto.paidValue)}
          right={<CheckCircle2 className="h-4 w-4 text-primary" />}
          sub="Prototype Paid contribution"
        >
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-border bg-surface-muted px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Paid
              </div>
              <div className="num text-sm font-semibold text-foreground">
                {proto.paidCount}
              </div>
            </div>
            <div className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wide text-warning">
                  FOC
                </div>
                <Badge
                  variant="outline"
                  className="border-warning/40 bg-warning/10 text-[9px] text-warning"
                >
                  Rp0
                </Badge>
              </div>
              <div className="num text-sm font-semibold text-foreground">
                {proto.focCount}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            FOC prototype tercatat sebagai support activity; nilai Rp0 dan tidak
            menambah achievement.
          </p>
        </KpiCard>

        <KpiCard
          label="Open Tasks"
          value={tasks.open}
          right={<ListChecks className="h-4 w-4 text-primary" />}
          sub={
            <>
              <span className="num font-medium text-foreground">
                {tasks.today}
              </span>{" "}
              hari ini ·{" "}
              <span className="num font-medium text-foreground">
                {tasks.upcoming}
              </span>{" "}
              upcoming
            </>
          }
        />

        <KpiCard
          label="Overdue Follow-Ups"
          value={overdueAttention}
          tone={overdueAttention > 0 ? "destructive" : "default"}
          right={
            <AlertTriangle
              className={
                overdueAttention > 0
                  ? "h-4 w-4 text-destructive"
                  : "h-4 w-4 text-muted-foreground"
              }
            />
          }
          sub={
            overdueAttention > 0
              ? `${tasks.escalated} escalated · ${tasks.overdue} overdue`
              : "Semua terkendali"
          }
        />
      </div>

      {/* Sales-only: single-sales target chart */}
      {role === "sales" ? <SingleSalesTargetChart /> : null}

      {/* Manager & Executive: YTD cumulative + Monthly bar chart */}
      {role !== "sales" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <YtdAchievementVsTargetChart role={role} />
          <MonthlyAchievementVsTargetChart role={role} />
        </div>
      ) : null}

      {/* Manager & Executive: Target ALL Sales */}
      {role !== "sales" ? <TargetAllSalesChart /> : null}

      {/* Main grid: trend + follow-ups (all roles) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RevenueTrendChart role={role} />
        </div>
        <div>
          <TodaysFollowUpList />
        </div>
      </div>

      {/* Manager-specific */}
      {role === "manager" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SalesPerformanceTable />
          </div>
          <div>
            <ActivityComplianceCard />
          </div>
        </div>
      ) : null}

      {/* Executive-specific (Super Admin sees the same read-only view) */}
      {role === "executive" || role === "super_admin" ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ForecastVsAchievementCard />
            <div className="md:col-span-2">
              <QuotationFunnelCard />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TopCustomersCard />
            </div>
            <div>
              <RiskAlertsCard />
            </div>
          </div>
          <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-muted-foreground">
            <Activity className="mr-1.5 inline h-3.5 w-3.5 -translate-y-0.5" />
            Read-only view · tidak ada aksi create, edit, archive, atau delete.
          </p>
        </>
      ) : null}
    </PageContainer>
  );
}

function SourceRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-sm ${color}`} />
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {label}
      </span>
      <span className="num shrink-0 font-medium text-foreground">
        {formatRupiahShort(value)}
      </span>
    </div>
  );
}
