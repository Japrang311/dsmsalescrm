import * as XLSX from "xlsx";
import {
  dashboardExportFollowUps,
  dashboardExportMetrics,
  dashboardExportMonthlyTrend,
  dashboardExportSalesPerformance,
  dashboardExportTopCustomers,
  type DashboardExportContext,
} from "@/lib/dashboard-export-data";
import type { DateRange } from "@/lib/domain";
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

const iso = (d: Date) => d.toISOString().slice(0, 10);
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
  const source = assertRows(dashboardExportFollowUps(context), "follow-up");
  const rows = source.map((r) => ({
    status: r.task.status,
    due: r.task.dueDate ? new Date(r.task.dueDate) : "",
    client: r.client.name,
    task: r.task.title,
    item: r.commercialItem?.description ?? "",
    owner: r.owner.name,
  }));
  const ws = buildSheet(
    [
      { header: "Status", key: "status", width: 14 },
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
      metric: "Revenue RFQ / New Product",
      value: formatRupiahShort(metrics.revenueBySource.rfq),
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
      reference: `${metrics.tasks.today} today · ${metrics.tasks.upcoming} upcoming`,
    },
    {
      metric: "Overdue Follow-Ups",
      value: metrics.tasks.overdue,
      reference:
        metrics.tasks.overdue > 0 ? "Perlu tindak lanjut" : "Terkendali",
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

  const followUpRows = dashboardExportFollowUps(context).map((r) => ({
    status: r.task.status,
    due: r.task.dueDate ? new Date(r.task.dueDate) : "",
    client: r.client.name,
    task: r.task.title,
    item: r.commercialItem?.description ?? "",
    owner: r.owner.name,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    buildSheet(
      [
        { header: "Status", key: "status", width: 14 },
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

  downloadWorkbook(
    wb,
    `dsm-executive-report-${context.role}-${stamp(context.range)}.xlsx`,
  );

  return (
    summaryRows.length +
    monthlyTrendRows.length +
    salesRows.length +
    topCustomerRows.length +
    followUpRows.length
  );
}
