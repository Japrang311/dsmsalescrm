import {
  dashboardExportFollowUps,
  dashboardExportMonthlyTrend,
  dashboardExportSalesPerformance,
  dashboardExportTopCustomers,
  type DashboardExportContext,
} from "@/lib/dashboard-export-data";
import type { DateRange } from "@/lib/domain";

// CSV cell escaping per RFC 4180. Prefix formula-like values with a single
// quote to prevent CSV injection when opened in spreadsheet apps.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function download(filename: string, csv: string) {
  // UTF-8 BOM so Excel picks up Rupiah / Indonesian characters correctly.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const stamp = (range: DateRange) => `${iso(range.from)}_${iso(range.to)}`;

// Thrown when a report has zero rows for the selected period. Callers show
// this message directly to the user — do not include internal jargon.
export class EmptyExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyExportError";
  }
}

function assertRows<T>(rows: T[], label: string): T[] {
  if (!rows || rows.length === 0) {
    throw new EmptyExportError(
      `Tidak ada data ${label} untuk periode yang dipilih.`,
    );
  }
  return rows;
}

// ---- Follow-ups (snapshot, role-scoped) ----
export function exportFollowUpsCsv(context: DashboardExportContext): number {
  const rows = assertRows(dashboardExportFollowUps(context), "follow-up");
  const csv = toCsv([
    ["Status", "Due Date", "Client", "Task", "Commercial Item", "Owner"],
    ...rows.map((r) => [
      r.task.status,
      r.task.dueDate ? iso(new Date(r.task.dueDate)) : "",
      r.client.name,
      r.task.title,
      r.commercialItem?.description ?? "",
      r.owner.name,
    ]),
  ]);
  download(`dsm-followups-${context.role}-${stamp(context.range)}.csv`, csv);
  return rows.length;
}

// ---- Sales performance vs target (period-scoped) ----
export function exportSalesPerformanceCsv(
  context: DashboardExportContext,
): number {
  const rows = assertRows(
    dashboardExportSalesPerformance(context),
    "performa sales",
  );
  const csv = toCsv([
    [
      "Sales",
      "Revenue (IDR)",
      "Target (IDR)",
      "Achievement %",
      "Open Tasks",
      "Overdue",
    ],
    ...rows.map((r) => [
      r.member.name,
      r.revenue,
      r.target,
      (r.pct * 100).toFixed(2),
      r.openTasks,
      r.overdue,
    ]),
  ]);
  download(`dsm-sales-performance-${stamp(context.range)}.csv`, csv);
  return rows.length;
}

// ---- Monthly revenue trend (period-scoped) ----
export function exportMonthlyRevenueCsv(
  context: DashboardExportContext,
): number {
  const rows = assertRows(
    dashboardExportMonthlyTrend(context),
    "revenue bulanan",
  );
  const csv = toCsv([
    ["Month", "Revenue (IDR)", "Target Prorated (IDR)", "Achievement %"],
    ...rows.map((r) => [
      r.month,
      r.revenue,
      r.target,
      r.target ? ((r.revenue / r.target) * 100).toFixed(2) : "0.00",
    ]),
  ]);
  download(
    `dsm-monthly-revenue-${context.role}-${stamp(context.range)}.csv`,
    csv,
  );
  return rows.length;
}

// ---- Top customers (executive, period-scoped) ----
export function exportTopCustomersCsv(
  context: DashboardExportContext,
  limit = 20,
): number {
  const rows = assertRows(
    dashboardExportTopCustomers(context, limit),
    "top customer",
  );
  const csv = toCsv([
    ["Rank", "Client", "Revenue (IDR)"],
    ...rows.map((r, i) => [i + 1, r.client.name, r.revenue]),
  ]);
  download(`dsm-top-customers-${stamp(context.range)}.csv`, csv);
  return rows.length;
}
