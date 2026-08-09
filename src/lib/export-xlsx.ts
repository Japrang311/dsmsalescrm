import * as XLSX from "xlsx";
import {
  dashboardExportFollowUpRecords,
  dashboardExportMetrics,
  dashboardExportMonthlyTrend,
  dashboardExportSalesPerformance,
  dashboardExportTopCustomers,
  type DashboardExportContext,
} from "@/lib/dashboard-export-data";
import { toLocalIsoDate, type DateRange } from "@/lib/domain";
import { EmptyExportError } from "@/lib/export-csv";
import { formatPercent, formatRupiahShort } from "@/lib/format";

function assertRows<T>(rows: T[], label: string): T[] {
  if (!rows || rows.length === 0) {
    throw new EmptyExportError(
      `Tidak ada data ${label} untuk periode yang dipilih.`,
    );
  }
  return rows;
}

// Indonesian Rupiah number format for Excel cells. Displays "Rp 1.234.567".
const IDR_FMT = '"Rp" #,##0;[Red]-"Rp" #,##0;"-"';
const PCT_FMT = "0.00%";
const DATE_FMT = "yyyy-mm-dd";

const iso = (d: Date) => toLocalIsoDate(d);
const stamp = (range: DateRange) => `${iso(range.from)}_${iso(range.to)}`;

type ColType = "text" | "idr" | "pct" | "date" | "int";

interface Column {
  header: string;
  key: string;
  type?: ColType;
  width?: number;
}

// Guard cells that start with formula chars to prevent CSV/Excel formula
// injection when the sheet is opened in another spreadsheet app.
function sanitizeText(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function buildSheet(
  columns: Column[],
  rows: Record<string, unknown>[],
): XLSX.WorkSheet {
  const aoa: unknown[][] = [columns.map((c) => c.header)];
  for (const r of rows) {
    aoa.push(
      columns.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return "";
        if (c.type === "date" && v instanceof Date) return v;
        if (c.type === "idr" || c.type === "pct" || c.type === "int") return v;
        return sanitizeText(v);
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Apply cell-level number formats + bold header row.
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const col = columns[C];
    const headerAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[headerAddr]) {
      ws[headerAddr].s = { font: { bold: true } };
    }
    for (let R = 1; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      if (col.type === "idr") {
        cell.t = "n";
        cell.z = IDR_FMT;
      } else if (col.type === "pct") {
        cell.t = "n";
        cell.z = PCT_FMT;
      } else if (col.type === "date") {
        cell.t = "d";
        cell.z = DATE_FMT;
      } else if (col.type === "int") {
        cell.t = "n";
        cell.z = "0";
      }
    }
  }
  ws["!cols"] = columns.map((c) => ({
    wch: c.width ?? Math.max(12, c.header.length + 2),
  }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename, { bookType: "xlsx", compression: true });
}

// ---- Follow-ups ----
export function exportFollowUpsXlsx(context: DashboardExportContext): number {
  const source = assertRows(
    dashboardExportFollowUpRecords(context),
    "follow-up",
  );
  const rows = source.map((r) => ({
    workflowStatus: r.workflowStatus,
    dueState: r.dueState,
    due: r.dueDate ? new Date(r.dueDate) : "",
    client: r.clientName,
    task: r.taskTitle,
    item: r.commercialItemDescription,
    owner: r.ownerName,
  }));
  const ws = buildSheet(
    [
      { header: "Workflow Status", key: "workflowStatus", width: 18 },
      { header: "Due State", key: "dueState", width: 14 },
      { header: "Due Date", key: "due", type: "date", width: 14 },
      { header: "Client", key: "client", width: 28 },
      { header: "Task", key: "task", width: 36 },
      { header: "Commercial Item", key: "item", width: 32 },
      { header: "Owner", key: "owner", width: 22 },
    ],
    rows,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Follow-ups");
  downloadWorkbook(
    wb,
    `dsm-followups-${context.role}-${stamp(context.range)}.xlsx`,
  );
  return rows.length;
}

// ---- Sales performance ----
export function exportSalesPerformanceXlsx(
  context: DashboardExportContext,
): number {
  const source = assertRows(
    dashboardExportSalesPerformance(context),
    "performa sales",
  );
  const rows = source.map((r) => ({
    name: r.member.name,
    revenue: r.revenue,
    target: r.target,
    pct: r.pct,
    open: r.openTasks,
    overdue: r.overdue,
  }));
  const ws = buildSheet(
    [
      { header: "Sales", key: "name", width: 22 },
      { header: "Revenue", key: "revenue", type: "idr", width: 18 },
      { header: "Target", key: "target", type: "idr", width: 18 },
      { header: "Achievement %", key: "pct", type: "pct", width: 15 },
      { header: "Open Tasks", key: "open", type: "int", width: 12 },
      { header: "Overdue", key: "overdue", type: "int", width: 10 },
    ],
    rows,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales Performance");
  downloadWorkbook(wb, `dsm-sales-performance-${stamp(context.range)}.xlsx`);
  return rows.length;
}

// ---- Monthly revenue trend ----
export function exportMonthlyRevenueXlsx(
  context: DashboardExportContext,
): number {
  const source = assertRows(
    dashboardExportMonthlyTrend(context),
    "revenue bulanan",
  );
  const rows = source.map((r) => ({
    month: r.month,
    revenue: r.revenue,
    target: r.target,
    pct: r.target ? r.revenue / r.target : 0,
  }));
  const ws = buildSheet(
    [
      { header: "Month", key: "month", width: 14 },
      { header: "Revenue", key: "revenue", type: "idr", width: 18 },
      { header: "Target (prorated)", key: "target", type: "idr", width: 20 },
      { header: "Achievement %", key: "pct", type: "pct", width: 15 },
    ],
    rows,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Monthly Revenue");
  downloadWorkbook(
    wb,
    `dsm-monthly-revenue-${context.role}-${stamp(context.range)}.xlsx`,
  );
  return rows.length;
}

// ---- Top customers ----
export function exportTopCustomersXlsx(
  context: DashboardExportContext,
  limit = 20,
): number {
  const source = assertRows(
    dashboardExportTopCustomers(context, limit),
    "top customer",
  );
  const rows = source.map((r, i) => ({
    rank: i + 1,
    client: r.client.name,
    revenue: r.revenue,
  }));
  const ws = buildSheet(
    [
      { header: "Rank", key: "rank", type: "int", width: 6 },
      { header: "Client", key: "client", width: 32 },
      { header: "Revenue", key: "revenue", type: "idr", width: 20 },
    ],
    rows,
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Top Customers");
  downloadWorkbook(wb, `dsm-top-customers-${stamp(context.range)}.xlsx`);
  return rows.length;
}

// ---- Executive report ----
export function exportExecutiveReportXlsx(
  context: DashboardExportContext,
): number {
  const metrics = dashboardExportMetrics(context);
  const wb = XLSX.utils.book_new();

  const summaryRows = [
    {
      metric: "Achievement (periode)",
      value: formatRupiahShort(metrics.revenue),
      reference: `Target ${formatRupiahShort(metrics.target)}`,
    },
    {
      metric: "Achievement %",
      value: formatPercent(
        metrics.target ? metrics.revenue / metrics.target : 0,
      ),
      reference: "Revenue / target",
    },
    {
      metric: "Revenue PPN",
      value: formatRupiahShort(metrics.revenueByTax.ppn),
      reference: "Termasuk pajak",
    },
    {
      metric: "Revenue Non-PPN",
      value: formatRupiahShort(metrics.revenueByTax.nonPpn),
      reference: "Tanpa pajak",
    },
    {
      metric: "Revenue New Product",
      value: formatRupiahShort(metrics.revenueBySource.newProduct),
      reference: "Dalam periode",
    },
    {
      metric: "Revenue Existing / Repeat",
      value: formatRupiahShort(metrics.revenueBySource.existing),
      reference: "Dalam periode",
    },
    {
      metric: "Revenue Prototype Paid",
      value: formatRupiahShort(metrics.revenueBySource.prototypePaid),
      reference: "Dalam periode",
    },
    {
      metric: "Prototype Paid",
      value: metrics.prototype.paidCount,
      reference: formatRupiahShort(metrics.prototype.paidValue),
    },
    {
      metric: "Prototype FOC",
      value: metrics.prototype.focCount,
      reference: "Rp0 (support activity)",
    },
    {
      metric: "Waiting PO Value",
      value: formatRupiahShort(metrics.waitingPo),
      reference: `${metrics.activeCommercial} commercial items aktif`,
    },
    {
      metric: "Open Tasks",
      value: metrics.tasks.open,
      reference: `${metrics.tasks.today} today · ${metrics.tasks.upcoming} upcoming · ${metrics.tasks.escalated} escalated`,
    },
    {
      metric: "Overdue Follow-Ups",
      value: metrics.tasks.overdue + metrics.tasks.escalated,
      reference:
        metrics.tasks.overdue + metrics.tasks.escalated > 0
          ? `${metrics.tasks.escalated} escalated · ${metrics.tasks.overdue} overdue`
          : "Terkendali",
    },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Metric", key: "metric", width: 30 },
        { header: "Value", key: "value", width: 20 },
        { header: "Reference", key: "reference", width: 34 },
      ],
      summaryRows,
    ),
    "Summary",
  );

  const monthlyTrendRows = dashboardExportMonthlyTrend(context).map((r) => ({
    month: r.month,
    revenue: r.revenue,
    target: r.target,
    pct: r.target ? r.revenue / r.target : 0,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Month", key: "month", width: 14 },
        { header: "Revenue", key: "revenue", type: "idr", width: 18 },
        { header: "Target (prorated)", key: "target", type: "idr", width: 20 },
        { header: "Achievement %", key: "pct", type: "pct", width: 15 },
      ],
      monthlyTrendRows,
    ),
    "Monthly Trend",
  );

  const salesRows = dashboardExportSalesPerformance(context).map((r) => ({
    name: r.member.name,
    revenue: r.revenue,
    target: r.target,
    pct: r.pct,
    open: r.openTasks,
    overdue: r.overdue,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Sales", key: "name", width: 22 },
        { header: "Revenue", key: "revenue", type: "idr", width: 18 },
        { header: "Target", key: "target", type: "idr", width: 18 },
        { header: "Achievement %", key: "pct", type: "pct", width: 15 },
        { header: "Open Tasks", key: "open", type: "int", width: 12 },
        { header: "Overdue", key: "overdue", type: "int", width: 10 },
      ],
      salesRows,
    ),
    "Sales Performance",
  );

  const topCustomerRows = dashboardExportTopCustomers(context, 20).map(
    (r, i) => ({
      rank: i + 1,
      client: r.client.name,
      revenue: r.revenue,
    }),
  );
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Rank", key: "rank", type: "int", width: 6 },
        { header: "Client", key: "client", width: 32 },
        { header: "Revenue", key: "revenue", type: "idr", width: 20 },
      ],
      topCustomerRows,
    ),
    "Top Customers",
  );

  const followUpRows = dashboardExportFollowUpRecords(context).map((r) => ({
    workflowStatus: r.workflowStatus,
    dueState: r.dueState,
    due: r.dueDate ? new Date(r.dueDate) : "",
    client: r.clientName,
    task: r.taskTitle,
    item: r.commercialItemDescription,
    owner: r.ownerName,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Workflow Status", key: "workflowStatus", width: 18 },
        { header: "Due State", key: "dueState", width: 14 },
        { header: "Due Date", key: "due", type: "date", width: 14 },
        { header: "Client", key: "client", width: 28 },
        { header: "Task", key: "task", width: 36 },
        { header: "Commercial Item", key: "item", width: 32 },
        { header: "Owner", key: "owner", width: 22 },
      ],
      followUpRows,
    ),
    "Follow Ups",
  );

  let stage4RowCount = 0;
  if (context.stage4) {
    stage4RowCount = appendStage4Sheets(wb, context.stage4);
  }

  downloadWorkbook(
    wb,
    `dsm-executive-report-${context.role}-${stamp(context.range)}.xlsx`,
  );

  return (
    summaryRows.length +
    monthlyTrendRows.length +
    salesRows.length +
    topCustomerRows.length +
    followUpRows.length +
    stage4RowCount
  );
}

// ---- Stage 4: Product intelligence (new sheets, no existing columns touched) ----
function appendStage4Sheets(
  wb: XLSX.WorkBook,
  stage4: NonNullable<DashboardExportContext["stage4"]>,
): number {
  const winLossRows = [
    {
      metric: "Won",
      count: stage4.winLoss.wonCount,
      value: stage4.winLoss.wonValue,
    },
    {
      metric: "Lost",
      count: stage4.winLoss.lostCount,
      value: stage4.winLoss.lostValue,
    },
    {
      metric: "Win Rate",
      count: stage4.winLoss.terminalCount,
      value:
        stage4.winLoss.winRate === null
          ? "n/a"
          : formatPercent(stage4.winLoss.winRate, 1),
    },
  ];
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Metric", key: "metric", width: 16 },
        { header: "Count (terminal Quotations)", key: "count", width: 26 },
        { header: "Value / Rate", key: "value", width: 20 },
      ],
      winLossRows,
    ),
    "Win-Loss",
  );

  const lostReasonRows = stage4.lostReasons.map((r) => ({
    reason: r.lostReason,
    count: r.lostCount,
    value: r.lostValue,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Lost Reason", key: "reason", width: 28 },
        { header: "Count", key: "count", type: "int", width: 10 },
        { header: "Value", key: "value", type: "idr", width: 18 },
      ],
      lostReasonRows,
    ),
    "Lost Reasons",
  );

  const legLabel: Record<string, string> = {
    quote_to_po: "Quote -> Customer PO",
    po_to_so: "Customer PO -> Sales Order",
    quote_to_so: "Quote -> Sales Order (end-to-end)",
  };
  const cycleTimeRows = stage4.cycleTime.map((c) => ({
    leg: legLabel[c.leg] ?? c.leg,
    median: c.medianDays === null ? "n/a" : c.medianDays.toFixed(1),
    p75: c.p75Days === null ? "n/a" : c.p75Days.toFixed(1),
    p90: c.p90Days === null ? "n/a" : c.p90Days.toFixed(1),
    included: c.includedCount,
    excluded: c.excludedCount,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Leg", key: "leg", width: 30 },
        { header: "Median (days)", key: "median", width: 14 },
        { header: "P75 (days)", key: "p75", width: 12 },
        { header: "P90 (days)", key: "p90", width: 12 },
        { header: "Included", key: "included", type: "int", width: 10 },
        { header: "Excluded", key: "excluded", type: "int", width: 10 },
      ],
      cycleTimeRows,
    ),
    "Cycle Time",
  );

  const funnelRows = stage4.funnel.map((f) => ({
    stage: f.stage,
    entered: f.enteredCount,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Stage", key: "stage", width: 20 },
        {
          header: "Entered (distinct documents)",
          key: "entered",
          type: "int",
          width: 26,
        },
      ],
      funnelRows,
    ),
    "Stage Funnel",
  );

  const dwellRows = stage4.dwell.map((d) => ({
    stage: d.stage,
    completedMedian:
      d.completedMedianDays === null ? "n/a" : d.completedMedianDays.toFixed(1),
    completedCount: d.completedCount,
    openMedian: d.openMedianDays === null ? "n/a" : d.openMedianDays.toFixed(1),
    openCount: d.openCount,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Stage", key: "stage", width: 20 },
        {
          header: "Completed Median (days)",
          key: "completedMedian",
          width: 20,
        },
        {
          header: "Completed Count",
          key: "completedCount",
          type: "int",
          width: 16,
        },
        { header: "Open Median (days)", key: "openMedian", width: 18 },
        { header: "Open Count", key: "openCount", type: "int", width: 12 },
      ],
      dwellRows,
    ),
    "Stage Dwell",
  );

  const coverageRows = stage4.coverage.map((c) => ({
    metric: c.metricName,
    effectiveFrom: c.effectiveFrom ?? "n/a (semua histori)",
    included: c.includedCount,
    excluded: c.excludedCount,
    reason: c.exclusionReason ?? "",
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Metric", key: "metric", width: 16 },
        { header: "Effective From", key: "effectiveFrom", width: 20 },
        { header: "Included", key: "included", type: "int", width: 10 },
        { header: "Excluded", key: "excluded", type: "int", width: 10 },
        { header: "Exclusion Reason", key: "reason", width: 44 },
      ],
      coverageRows,
    ),
    "Data Quality",
  );

  return (
    winLossRows.length +
    lostReasonRows.length +
    cycleTimeRows.length +
    funnelRows.length +
    dwellRows.length +
    coverageRows.length
  );
}
