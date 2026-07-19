import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  dashboardExportFollowUps,
  dashboardExportMetrics,
  dashboardExportMonthlyTrend,
  dashboardExportSalesPerformance,
  dashboardExportTopCustomers,
  type DashboardExportContext,
} from "@/lib/dashboard-export-data";
import {
  formatDateShort,
  formatPercent,
  formatRupiahShort,
} from "@/lib/format";
import { ROLE_LABEL } from "@/context/role-context";

const BRAND = { r: 1, g: 118, b: 211 }; // #0176D3
const NAVY = { r: 3, g: 45, b: 96 };
const MUTED = { r: 100, g: 116, b: 139 };

const MARGIN_X = 40;
const TOP_MARGIN = 60; // top margin on continued pages (no brand band)
const BOTTOM_MARGIN = 40; // reserved for footer
const SECTION_HEADER_H = 22; // title + underline + spacing before body

// Shared autoTable defaults ensuring rows never split and headers repeat.
function tableDefaults() {
  return {
    margin: {
      left: MARGIN_X,
      right: MARGIN_X,
      top: TOP_MARGIN,
      bottom: BOTTOM_MARGIN,
    },
    showHead: "everyPage" as const,
    rowPageBreak: "avoid" as const,
    pageBreak: "auto" as const,
    headStyles: {
      fillColor: [BRAND.r, BRAND.g, BRAND.b] as [number, number, number],
      textColor: 255,
      fontStyle: "bold" as const,
    },
  };
}

export function exportDashboardPdf(context: DashboardExportContext) {
  const { role, range } = context;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const periodLabel = `${formatDateShort(range.from)} – ${formatDateShort(range.to)}`;

  // Header band (first page only)
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("DSM Sales Execution", MARGIN_X, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Dashboard Report", MARGIN_X, 50);
  doc.setFontSize(9);
  const stamp = `Generated ${formatDateShort(new Date())} · Scope: ${ROLE_LABEL[role]} · Periode ${periodLabel}`;
  doc.text(stamp, pageW - MARGIN_X, 50, { align: "right" });

  let y = 96;

  // ---- KPI summary ----
  const metrics = dashboardExportMetrics(context);
  const rev = metrics.revenue;
  const tgt = metrics.target;
  const tax = metrics.revenueByTax;
  const src = metrics.revenueBySource;
  const proto = metrics.prototype;
  const tasks = metrics.tasks;
  const waitingPo = metrics.waitingPo;
  const activeCi = metrics.activeCommercial;

  y = section(doc, `Key Metrics · ${periodLabel}`, y);
  autoTable(doc, {
    ...tableDefaults(),
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 6 },
    head: [["Metric", "Value", "Reference"]],
    body: [
      [
        "Achievement (periode)",
        formatRupiahShort(rev),
        `Target ${formatRupiahShort(tgt)} · ${formatPercent(tgt ? rev / tgt : 0)}`,
      ],
      ["Revenue PPN", formatRupiahShort(tax.ppn), "Termasuk pajak"],
      ["Revenue Non-PPN", formatRupiahShort(tax.nonPpn), "Tanpa pajak"],
      [
        "Revenue from RFQ / New Product",
        formatRupiahShort(src.rfq),
        "Dalam periode",
      ],
      [
        "Revenue from Existing / Repeat",
        formatRupiahShort(src.existing),
        "Dalam periode",
      ],
      [
        "Revenue from Prototype Paid",
        formatRupiahShort(src.prototypePaid),
        "Dalam periode",
      ],
      [
        "Prototype Paid",
        `${proto.paidCount} order`,
        formatRupiahShort(proto.paidValue),
      ],
      ["Prototype FOC", `${proto.focCount} order`, "Rp0 (support activity)"],
      [
        "Waiting PO Value (snapshot)",
        formatRupiahShort(waitingPo),
        `${activeCi} commercial items aktif`,
      ],
      [
        "Open Tasks (snapshot)",
        String(tasks.open),
        `${tasks.today} today · ${tasks.upcoming} upcoming`,
      ],
      [
        "Overdue Follow-Ups (snapshot)",
        String(tasks.overdue),
        tasks.overdue > 0 ? "Perlu tindak lanjut" : "Terkendali",
      ],
    ],
  });
  y = getLastY(doc) + 20;

  // ---- Revenue trend ----
  y = section(doc, "Monthly Revenue vs Target (dalam periode)", y);
  const trend = dashboardExportMonthlyTrend(context);
  if (trend.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("Tidak ada bulan dalam periode.", MARGIN_X, y);
    y += 22;
  } else {
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "striped",
      styles: { fontSize: 9, cellPadding: 5 },
      head: [["Month", "Revenue", "Target (prorata)", "Achievement"]],
      body: trend.map((row) => [
        row.month,
        formatRupiahShort(row.revenue),
        formatRupiahShort(row.target),
        formatPercent(row.target ? row.revenue / row.target : 0),
      ]),
    });
    y = getLastY(doc) + 20;
  }

  // ---- Follow-ups snapshot ----
  const fu = dashboardExportFollowUps(context);
  y = section(
    doc,
    `Today & Overdue Follow-Ups (${fu.length}) · snapshot hari ini`,
    y,
  );
  if (fu.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      "Tidak ada follow-up yang perlu dijadwalkan hari ini.",
      MARGIN_X,
      y,
    );
    y += 22;
  } else {
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 5, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 110 },
        2: { cellWidth: 150 },
        4: { cellWidth: 70 },
      },
      head: [["Status", "Client", "Task", "Commercial Item", "Owner"]],
      body: fu.map((r) => [
        r.task.status,
        r.client.name,
        r.task.title,
        r.commercialItem?.description ?? "—",
        r.owner.name,
      ]),
    });
    y = getLastY(doc) + 20;
  }

  // ---- Role-specific ----
  if (role === "manager" || role === "executive" || role === "super_admin") {
    y = section(doc, "Sales Performance vs Target (periode)", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      head: [["Sales", "Revenue", "Target", "Achievement", "Open", "Overdue"]],
      body: dashboardExportSalesPerformance(context).map((r) => [
        r.member.name,
        formatRupiahShort(r.revenue),
        formatRupiahShort(r.target),
        formatPercent(r.pct),
        String(r.openTasks),
        String(r.overdue),
      ]),
    });
    y = getLastY(doc) + 20;
  }

  if (role === "executive" || role === "super_admin") {
    y = section(doc, "Quotation Funnel (snapshot)", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      head: [["Stage", "Count", "Estimated Value"]],
      body: metrics.quotationFunnel.map((s) => [
        s.stage,
        String(s.count),
        formatRupiahShort(s.value),
      ]),
    });
    y = getLastY(doc) + 20;

    y = section(doc, "Top Customers (periode)", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      head: [["#", "Client", "Revenue"]],
      body: dashboardExportTopCustomers(context, 10).map((r, i) => [
        String(i + 1),
        r.client.name,
        formatRupiahShort(r.revenue),
      ]),
    });
    y = getLastY(doc) + 20;
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      `DSM Sales Execution · Backend data · Periode ${periodLabel}`,
      MARGIN_X,
      pageH - 20,
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - MARGIN_X, pageH - 20, {
      align: "right",
    });
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const filename = `dsm-dashboard-${role}-${iso(range.from)}_${iso(range.to)}.pdf`;
  doc.save(filename);
}

// Draw a section title, page-breaking first if the title plus at least one
// row of body wouldn't fit on the current page (prevents orphan headers).
function section(doc: jsPDF, title: string, y: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  const MIN_BODY = 60; // reserve for header row + at least one data row
  if (y + SECTION_HEADER_H + MIN_BODY > pageH - BOTTOM_MARGIN) {
    doc.addPage();
    y = TOP_MARGIN;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text(title, MARGIN_X, y);
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setLineWidth(1);
  doc.line(MARGIN_X, y + 4, MARGIN_X + 40, y + 4);
  doc.setTextColor(0, 0, 0);
  return y + 14;
}

function getLastY(doc: jsPDF): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable;
  return last?.finalY ?? 0;
}
