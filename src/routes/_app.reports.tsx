import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Users,
  AlertTriangle,
  Activity as ActivityIcon,
  FlaskConical,
  Trophy,
  Target,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDateShort,
  formatPercent,
  formatRupiahShort,
} from "@/lib/format";
import { useRole, ROLE_LABEL } from "@/context/role-context";
import { CURRENT_MONTH, CURRENT_YEAR, NOW } from "@/lib/domain";
import {
  activityCompliance,
  dashboardSalesTeam,
  quotationFunnel,
  riskAlerts,
  sumTargetsThroughMonth,
  targetForMonth,
  targetsFor,
} from "@/lib/data/dashboard-selectors";
import { forecastValue } from "@/lib/data/commercial-stages";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  ReportFilterBar,
  defaultReportFilters,
  type ReportFilters,
} from "@/components/reports/ReportFilterBar";
import {
  agingBucket,
  filterCommercialItems,
  filterSalesOrders,
} from "@/lib/report-selectors";
import { exportExecutiveReportXlsx } from "@/lib/export-xlsx";
import { exportExecutiveReportPdf } from "@/lib/export-pdf";
import type { DashboardExportContext } from "@/lib/dashboard-export-data";
import { EmptyExportError } from "@/lib/export-csv";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Executive Reports · DSM" }] }),
  component: ReportsPage,
});

const CHART_COLORS = ["#0176D3", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444"];

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
    isLoading,
  } = useDashboardData();
  const displayTeam = dashboardSalesTeam(salesTeam);

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

  // Aggregates ------------------------------------------------------------
  const totals = useMemo(() => {
    let ppn = 0;
    let nonPpn = 0;
    let rfq = 0;
    let existing = 0;
    let protoPaid = 0;
    let protoFocCount = 0;
    let protoPaidCount = 0;
    for (const s of rows) {
      const v = s.value ?? 0;
      if (s.taxType === "PPN") ppn += v;
      else if (s.taxType === "Non-PPN") nonPpn += v;
      if (s.source === "RFQ / New Product") rfq += v;
      else if (s.source === "Existing / Repeat Order") existing += v;
      else if (s.source === "Prototype Paid") protoPaid += v;
      if (s.type === "Prototype" && s.prototypeStatus === "FOC")
        protoFocCount += 1;
      if (s.type === "Prototype" && s.prototypeStatus === "Paid")
        protoPaidCount += 1;
    }
    return {
      revenue: ppn + nonPpn,
      ppn,
      nonPpn,
      rfq,
      existing,
      protoPaid,
      protoFocCount,
      protoPaidCount,
    };
  }, [rows]);

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

  // Cumulative YTD trend within range -------------------------------------
  const cumulativeTrend = useMemo(() => {
    const monthsInYear = 12;
    const targetsArr =
      filters.ownerId !== "all" &&
      targetsFor(targetsByMember, filters.ownerId).length > 0
        ? targetsFor(targetsByMember, filters.ownerId)
        : companyTarget;
    const monthRev = new Array(monthsInYear).fill(0);
    for (const s of rows) {
      const d = new Date(s.date);
      if (d.getFullYear() !== CURRENT_YEAR) continue;
      monthRev[d.getMonth()] += s.value ?? 0;
    }
    let cr = 0;
    let ct = 0;
    return Array.from({ length: CURRENT_MONTH }, (_, i) => {
      cr += monthRev[i];
      ct += targetForMonth(targetsArr, i + 1);
      return {
        month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
          month: "short",
        }),
        achievement: cr,
        target: ct,
      };
    });
  }, [rows, filters.ownerId, targetsByMember, companyTarget]);

  const monthlyTrend = useMemo(() => {
    const targetsArr =
      filters.ownerId !== "all" &&
      targetsFor(targetsByMember, filters.ownerId).length > 0
        ? targetsFor(targetsByMember, filters.ownerId)
        : companyTarget;
    const monthRev = new Array(12).fill(0);
    for (const s of rows) {
      const d = new Date(s.date);
      if (d.getFullYear() !== CURRENT_YEAR) continue;
      monthRev[d.getMonth()] += s.value ?? 0;
    }
    return Array.from({ length: CURRENT_MONTH }, (_, i) => ({
      month: new Date(CURRENT_YEAR, i, 1).toLocaleDateString("id-ID", {
        month: "short",
      }),
      revenue: monthRev[i],
      target: targetForMonth(targetsArr, i + 1),
    }));
  }, [rows, filters.ownerId, targetsByMember, companyTarget]);

  const sourceBreakdown = useMemo(
    () => [
      { name: "RFQ / New Product", value: totals.rfq },
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
    const totalsByClient = new Map<string, number>();
    for (const s of rows)
      totalsByClient.set(
        s.clientId,
        (totalsByClient.get(s.clientId) ?? 0) + (s.value ?? 0),
      );
    return Array.from(totalsByClient.entries())
      .map(([cid, revenue]) => ({ client: clients[cid], revenue }))
      .filter((r) => r.client)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [rows, clients]);

  const salesPerf = useMemo(() => {
    return displayTeam
      .map((member) => {
        const orders = rows.filter((s) => s.ownerId === member.id);
        const revenue = orders.reduce((s, o) => s + (o.value ?? 0), 0);
        const target = sumTargetsThroughMonth(
          targetsFor(targetsByMember, member.id),
        );
        const openTasks = allTasks.filter(
          (t) => t.ownerId === member.id && t.status !== "Done",
        ).length;
        const overdue = allTasks.filter(
          (t) => t.ownerId === member.id && t.status === "Overdue",
        ).length;
        const activeClients = clientList.filter(
          (c) => c.ownerId === member.id && c.status !== "Lost",
        ).length;
        return {
          member,
          revenue,
          target,
          pct: target > 0 ? revenue / target : 0,
          openTasks,
          overdue,
          activeClients,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, displayTeam, allTasks, clientList, targetsByMember]);

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
      salesTeam: displayTeam,
      targetsByMember,
      companyTarget,
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
      displayTeam,
      targetsByMember,
      companyTarget,
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

  if (!authReady || isLoading) {
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
        salesTeam={displayTeam}
      />

      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {filterContext.map((f) => (
          <Badge key={f as string} variant="secondary" className="font-normal">
            {f}
          </Badge>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={<Target className="h-4 w-4" />}
          label="Achievement YTD"
          value={formatRupiahShort(totals.revenue)}
          sub={`${formatPercent(ytdAchievementPct)} dari target ${formatRupiahShort(yearTargetTotal)}`}
          accent
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="PPN Revenue"
          value={formatRupiahShort(totals.ppn)}
          sub={`${formatPercent(totals.revenue ? totals.ppn / totals.revenue : 0)} dari revenue`}
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Non-PPN Revenue"
          value={formatRupiahShort(totals.nonPpn)}
          sub={`${formatPercent(totals.revenue ? totals.nonPpn / totals.revenue : 0)} dari revenue`}
        />
        <KpiTile
          icon={<FlaskConical className="h-4 w-4" />}
          label="Prototype"
          value={`${formatRupiahShort(totals.protoPaid)} · ${totals.protoFocCount} FOC`}
          sub={`${totals.protoPaidCount} Paid berkontribusi revenue`}
        />
      </div>

      {/* Achievement YTD vs Target */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Achievement YTD vs Target YTD
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Akumulasi bulanan (kumulatif) untuk tahun {CURRENT_YEAR}.
            </p>
          </CardHeader>
          <CardContent className="h-[280px] px-2 pb-3">
            {cumulativeTrend.length === 0 ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cumulativeTrend}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    opacity={0.5}
                  />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => formatRupiahShort(v)}
                    tick={{ fontSize: 10 }}
                    width={70}
                  />
                  <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="achievement"
                    name="Achievement"
                    fill="#0176D3"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Target"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Monthly Achievement vs Monthly Target
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Perbandingan revenue per bulan terhadap target bulanan.
            </p>
          </CardHeader>
          <CardContent className="h-[280px] px-2 pb-3">
            {monthlyTrend.length === 0 ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthlyTrend}
                  margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    opacity={0.5}
                  />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={(v) => formatRupiahShort(v)}
                    tick={{ fontSize: 10 }}
                    width={70}
                  />
                  <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey="target"
                    name="Target"
                    fill="#CBD5E1"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="revenue"
                    name="Revenue"
                    fill="#0176D3"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Source breakdown + Forecast */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Revenue Source Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[240px] px-2 pb-3">
            {totals.revenue === 0 ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {sourceBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatRupiahShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Forecast vs Achievement vs Target YTD
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Forecast = Achievement + nilai pipeline terbobot per stage (Client
              Request for Quotes 15% s/d Commit 90%).
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <ForecastTile
              label="Achievement"
              value={forecast.achievement}
              tone="primary"
              pct={forecast.target ? forecast.achievement / forecast.target : 0}
            />
            <ForecastTile
              label="Forecast (Achv + Pipeline)"
              value={forecast.total}
              tone="emerald"
              pct={forecast.target ? forecast.total / forecast.target : 0}
            />
            <ForecastTile
              label="Target YTD"
              value={forecast.target}
              tone="amber"
              pct={1}
            />
          </CardContent>
        </Card>
      </div>

      {/* Quotation funnel + Waiting PO */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Quotation Funnel & Open Pipeline
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Open Quotation Sent:{" "}
              <span className="font-semibold text-foreground">
                {formatRupiahShort(openQuotationValue)}
              </span>
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pb-4">
            {funnel.map((s, i) => {
              const max = Math.max(...funnel.map((x) => x.value), 1);
              const pct = (s.value / max) * 100;
              return (
                <div key={s.stage} className="flex items-center gap-2 text-xs">
                  <div className="w-40 truncate text-muted-foreground">
                    {s.stage}
                  </div>
                  <div className="flex-1">
                    <div className="h-6 overflow-hidden rounded-md bg-muted/60">
                      <div
                        className="flex h-full items-center justify-end pr-2 text-[10px] font-medium text-white"
                        style={{
                          width: `${Math.max(6, pct)}%`,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      >
                        {s.count} · {formatRupiahShort(s.value)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Waiting PO — Nilai & Aging
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Total nilai menunggu PO:{" "}
              <span className="font-semibold text-foreground">
                {formatRupiahShort(waitingPoTotal)}
              </span>
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {waitingPoRows.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Tidak ada item menunggu PO pada scope filter.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Klien / Project</TableHead>
                    <TableHead className="text-xs">Owner</TableHead>
                    <TableHead className="text-xs">Aging</TableHead>
                    <TableHead className="text-right text-xs">Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitingPoRows.slice(0, 6).map(({ item, aging }) => (
                    <TableRow key={item.id} className="text-xs">
                      <TableCell className="max-w-[220px] truncate">
                        <div className="font-medium">
                          {clients[item.clientId]?.name ?? "-"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {item.projectName ?? item.description}
                        </div>
                      </TableCell>
                      <TableCell>{owners[item.ownerId]?.name ?? "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            aging.startsWith(">") ? "destructive" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {aging}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiahShort(item.estimatedValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top customers + Sales perf */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-primary" /> Top 5 Customers YTD
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topCustomers.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Belum ada revenue pada scope ini.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Klien</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">
                      Revenue
                    </TableHead>
                    <TableHead className="text-xs">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map(({ client, revenue }) => {
                    const share = totals.revenue ? revenue / totals.revenue : 0;
                    return (
                      <TableRow key={client.id} className="text-xs">
                        <TableCell className="max-w-[220px] truncate">
                          <Link
                            to="/clients/$clientId"
                            params={{ clientId: client.id }}
                            className="font-medium hover:text-primary"
                          >
                            {client.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {client.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatRupiahShort(revenue)}
                        </TableCell>
                        <TableCell className="w-24">
                          <div className="flex items-center gap-1">
                            <Progress value={share * 100} className="h-1.5" />
                            <span className="w-8 text-[10px] tabular-nums text-muted-foreground">
                              {formatPercent(share)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" /> Sales Performance
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              1 Manager · {salesPerf.length} Sales
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Sales</TableHead>
                  <TableHead className="text-right text-xs">Revenue</TableHead>
                  <TableHead className="text-right text-xs">Target</TableHead>
                  <TableHead className="text-xs">Achv</TableHead>
                  <TableHead className="text-xs">Task</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesPerf.map(
                  ({ member, revenue, target, pct, openTasks, overdue }) => (
                    <TableRow key={member.id} className="text-xs">
                      <TableCell>
                        <div className="font-medium">{member.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          sales
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRupiahShort(revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatRupiahShort(target)}
                      </TableCell>
                      <TableCell className="w-24">
                        <div className="flex items-center gap-1">
                          <Progress
                            value={Math.min(100, pct * 100)}
                            className="h-1.5"
                          />
                          <span
                            className={`w-9 text-[10px] tabular-nums ${pct >= 1 ? "text-emerald-600" : pct >= 0.7 ? "text-amber-600" : "text-red-600"}`}
                          >
                            {formatPercent(pct)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">
                        <span className="font-medium">{openTasks}</span> open
                        {overdue > 0 && (
                          <span className="ml-1 text-red-600">
                            · {overdue} overdue
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Compliance + Prototype + Alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ActivityIcon className="h-4 w-4 text-primary" /> Activity
              Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold tabular-nums">
              {formatPercent(compliance)}
            </p>
            <Progress value={compliance * 100} />
            <p className="text-[11px] text-muted-foreground">
              Persentase akun aktif dengan next follow-up terjadwal. Threshold
              sehat ≥ 80%.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FlaskConical className="h-4 w-4 text-primary" /> Prototype Report
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-xs">
            <StatBlock
              label="Paid value"
              value={formatRupiahShort(totals.protoPaid)}
              tone="primary"
            />
            <StatBlock
              label="Paid count"
              value={`${totals.protoPaidCount} SO`}
              tone="emerald"
            />
            <StatBlock
              label="FOC count"
              value={`${totals.protoFocCount} SO`}
              tone="amber"
            />
            <StatBlock
              label="Support activity"
              value={`${totals.protoPaidCount + totals.protoFocCount} total`}
              tone="muted"
            />
            <p className="col-span-2 text-[11px] text-muted-foreground">
              <Info className="mr-1 inline h-3 w-3" /> Prototype FOC tidak
              pernah masuk ke chart revenue.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Risk Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tidak ada risiko teridentifikasi.
              </p>
            ) : (
              alerts.map((a) => (
                <Alert
                  key={a.id}
                  variant={a.severity === "high" ? "destructive" : "default"}
                  className="py-2"
                >
                  <AlertTitle className="text-xs">{a.title}</AlertTitle>
                  <AlertDescription className="text-[11px]">
                    {a.detail}
                  </AlertDescription>
                </Alert>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {readOnly && (
        <p className="pt-1 text-center text-[11px] text-muted-foreground">
          Top Executive view — read-only. Tidak ada aksi
          create/edit/archive/delete pada laporan ini.
        </p>
      )}
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/[0.03]" : ""}>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        {sub && (
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastTile({
  label,
  value,
  tone,
  pct,
}: {
  label: string;
  value: number;
  tone: "primary" | "emerald" | "amber";
  pct: number;
}) {
  const bar =
    tone === "primary"
      ? "bg-primary"
      : tone === "emerald"
        ? "bg-emerald-500"
        : "bg-amber-500";
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold tabular-nums">
        {formatRupiahShort(value)}
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={`${bar} h-full`}
          style={{
            width: `${Math.min(100, Math.max(0, pct * 100)).toFixed(1)}%`,
          }}
        />
      </div>
      <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
        {formatPercent(pct)} vs target YTD
      </p>
    </div>
  );
}

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "emerald" | "amber" | "muted";
}) {
  const cls =
    tone === "primary"
      ? "border-primary/30 bg-primary/[0.04]"
      : tone === "emerald"
        ? "border-emerald-300/50 bg-emerald-50/60"
        : tone === "amber"
          ? "border-amber-300/50 bg-amber-50/60"
          : "border-border bg-muted/30";
  return (
    <div className={`rounded-md border p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
      <Skeleton className="h-24 w-full max-w-xs" />
      <span>Belum ada data pada rentang & filter ini.</span>
    </div>
  );
}
