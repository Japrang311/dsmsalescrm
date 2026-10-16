import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  dashboardExportFollowUpRecords,
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
import { ROLE_LABEL } from "@/context/role-context-core";
import { toLocalIsoDate } from "@/lib/domain";

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
  exportReportPdf(context, {
    reportLabel: "Dashboard Report",
    filenamePrefix: "dsm-dashboard",
  });
}

export function exportExecutiveReportPdf(context: DashboardExportContext) {
  exportReportPdf(context, {
    reportLabel: "Executive Report",
    filenamePrefix: "dsm-executive-report",
  });
}

function exportReportPdf(
  context: DashboardExportContext,
  options: { reportLabel: string; filenamePrefix: string },
) {
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
  doc.text(options.reportLabel, MARGIN_X, 50);
  doc.setFontSize(9);
  const stamp = `Generated ${formatDateShort(new Date())} · Scope: ${ROLE_LABEL[role]} · Periode ${periodLabel}`;
  doc.text(stamp, pageW - MARGIN_X, 50, { align: "right" });

  let y = 96;
  const snapshot = context.reportSnapshot;
  const forecast = snapshot?.forecast;
  const comparable = snapshot?.context.targetComparable ?? true;
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(
    "Nilai SO: order berbayar tercatat; bukan konfirmasi pembayaran diterima.",
    MARGIN_X,
    y,
  );
  y += 14;
  if (snapshot) {
    const metadata = doc.splitTextToSize(
      `Snapshot ${snapshot.context.fetchedAt} | Filter ${JSON.stringify(snapshot.context.scope)}`,
      pageW - MARGIN_X * 2,
    );
    doc.text(metadata, MARGIN_X, y);
    y += metadata.length * 12 + 10;
  }

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
        "Pencapaian SO (periode)",
        formatRupiahShort(rev),
        comparable && tgt > 0
          ? `Target ${formatRupiahShort(tgt)} · ${formatPercent(rev / tgt)}`
          : `— · ${snapshot?.targetReason ?? "Target tidak tersedia"}`,
      ],
      ...(forecast?.snapshotMode === "current" &&
      forecast.openPipelineValue !== null &&
      forecast.forecastValue !== null
        ? [
            [
              "Pipeline terbobot (periode)",
              formatRupiahShort(forecast.openPipelineValue),
              `Snapshot saat ini · as of ${formatDateShort(forecast.asOfDate)}`,
            ],
            [
              "Forecast Nilai SO (periode)",
              formatRupiahShort(forecast.forecastValue),
              "Nilai SO + pipeline open bertanggal × bobot tahap tetap",
            ],
          ]
        : [
            [
              "Forecast Nilai SO (periode)",
              "—",
              snapshot?.forecastUnavailableReason ??
                "Forecast historis tidak tersedia; pipeline hanya snapshot saat ini",
            ],
          ]),
      ["Nilai SO PPN", formatRupiahShort(tax.ppn), "Termasuk pajak"],
      ["Nilai SO Non-PPN", formatRupiahShort(tax.nonPpn), "Tanpa pajak"],
      [
        "Nilai SO from New Product",
        formatRupiahShort(src.newProduct),
        "Dalam periode",
      ],
      [
        "Nilai SO from Existing / Repeat",
        formatRupiahShort(src.existing),
        "Dalam periode",
      ],
      [
        "Nilai SO Prototype Paid",
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
        `${tasks.today} today · ${tasks.upcoming} upcoming · ${tasks.escalated} escalated`,
      ],
      [
        "Overdue Follow-Ups (snapshot)",
        String(tasks.overdue + tasks.escalated),
        tasks.overdue + tasks.escalated > 0
          ? `${tasks.escalated} escalated · ${tasks.overdue} overdue`
          : "Terkendali",
      ],
    ],
  });
  y = getLastY(doc) + 20;

  if (forecast?.snapshotMode === "current") {
    y = section(
      doc,
      `Forecast Drilldown (${forecast.page.totalCount}) · snapshot ${formatDateShort(forecast.asOfDate)}`,
      y,
    );
    if (forecast.items.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text("Tidak ada quotation open untuk scope ini.", MARGIN_X, y);
      y += 22;
    } else {
      autoTable(doc, {
        ...tableDefaults(),
        startY: y,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 4 },
        head: [
          ["Quotation", "Client", "Stage", "Expected", "Bobot", "Kontribusi"],
        ],
        body: forecast.items.map((item) => [
          item.quotationNumber,
          item.clientName,
          item.stage,
          item.expectedCloseDate ?? "Belum dijadwalkan",
          formatPercent(item.weight),
          item.contributes ? formatRupiahShort(item.weightedValue) : "—",
        ]),
      });
      y = getLastY(doc) + 20;
    }
  }

  // ---- Nilai SO trend ----
  y = section(doc, "Monthly Nilai SO vs Target (dalam periode)", y);
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
      head: [["Month", "Nilai SO", "Target periode", "Pencapaian SO"]],
      body: trend.map((row) => [
        row.month,
        formatRupiahShort(row.revenue),
        comparable ? formatRupiahShort(row.target) : "—",
        comparable && row.target > 0
          ? formatPercent(row.revenue / row.target)
          : "—",
      ]),
    });
    y = getLastY(doc) + 20;
  }

  // ---- Follow-ups snapshot ----
  const fu = dashboardExportFollowUpRecords(context);
  y = section(
    doc,
    `Today, Overdue & Escalated Follow-Ups (${fu.length}) · snapshot hari ini`,
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
        1: { cellWidth: 55 },
        2: { cellWidth: 100 },
        3: { cellWidth: 140 },
        4: { cellWidth: 110 },
        5: { cellWidth: 60 },
      },
      head: [
        ["Workflow", "Due State", "Client", "Task", "Commercial Item", "Owner"],
      ],
      body: fu.map((r) => [
        r.workflowStatus,
        r.dueState,
        r.clientName,
        r.taskTitle,
        r.commercialItemDescription || "-",
        r.ownerName,
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
      head: [
        ["Sales", "Nilai SO", "Target", "Pencapaian SO", "Open", "Overdue"],
      ],
      body: dashboardExportSalesPerformance(context).map((r) => [
        r.member.name,
        formatRupiahShort(r.revenue),
        comparable ? formatRupiahShort(r.target) : "—",
        comparable && r.target > 0 ? formatPercent(r.pct) : "—",
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
      head: [["#", "Client", "Nilai SO"]],
      body: dashboardExportTopCustomers(context, 10).map((r, i) => [
        String(i + 1),
        r.client.name,
        formatRupiahShort(r.revenue),
      ]),
    });
    y = getLastY(doc) + 20;
  }

  // ---- Stage 4: Product intelligence (new sections only when the caller
  // supplies the RPC data; Dashboard's export never does, so this is a
  // no-op there -- existing sections above are untouched either way) ----
  if (context.stage4) {
    const s4 = context.stage4;
    y = section(doc, "Win/Loss & Lost Reasons", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5 },
      head: [["Metric", "Count", "Value / Rate"]],
      body: [
        [
          "Won",
          String(s4.winLoss.wonCount),
          formatRupiahShort(s4.winLoss.wonValue),
        ],
        [
          "Lost",
          String(s4.winLoss.lostCount),
          formatRupiahShort(s4.winLoss.lostValue),
        ],
        [
          "Win Rate",
          String(s4.winLoss.terminalCount),
          s4.winLoss.winRate === null
            ? "n/a"
            : formatPercent(s4.winLoss.winRate, 1),
        ],
      ],
    });
    y = getLastY(doc) + 12;
    if (s4.lostReasons.length > 0) {
      autoTable(doc, {
        ...tableDefaults(),
        startY: y,
        theme: "striped",
        styles: { fontSize: 8.5, cellPadding: 5 },
        head: [["Lost Reason", "Count", "Value"]],
        body: s4.lostReasons.map((r) => [
          r.lostReason,
          String(r.lostCount),
          formatRupiahShort(r.lostValue),
        ]),
      });
      y = getLastY(doc) + 20;
    }

    const legLabel: Record<string, string> = {
      quote_to_po: "Quote -> Customer PO",
      po_to_so: "Customer PO -> Sales Order",
      quote_to_so: "Quote -> Sales Order (end-to-end)",
    };
    y = section(doc, "Cycle-Time Distribution", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 5 },
      head: [["Leg", "Median", "P75", "P90", "Included", "Excluded"]],
      body: s4.cycleTime.map((c) => [
        legLabel[c.leg] ?? c.leg,
        c.medianDays === null ? "n/a" : `${c.medianDays.toFixed(1)}h`,
        c.p75Days === null ? "n/a" : `${c.p75Days.toFixed(1)}h`,
        c.p90Days === null ? "n/a" : `${c.p90Days.toFixed(1)}h`,
        String(c.includedCount),
        String(c.excludedCount),
      ]),
    });
    y = getLastY(doc) + 20;

    y = section(doc, "Stage-Entry Funnel & Dwell Time", y);
    const dwellByStage = Object.fromEntries(s4.dwell.map((d) => [d.stage, d]));
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 5 },
      head: [
        ["Stage", "Entered", "Completed Dwell (median)", "Open Dwell (median)"],
      ],
      body: s4.funnel.map((f) => {
        const d = dwellByStage[f.stage];
        return [
          f.stage,
          String(f.enteredCount),
          d?.completedMedianDays == null
            ? "n/a"
            : `${d.completedMedianDays.toFixed(1)}h (${d.completedCount})`,
          d?.openMedianDays == null
            ? "n/a"
            : `${d.openMedianDays.toFixed(1)}h (${d.openCount})`,
        ];
      }),
    });
    y = getLastY(doc) + 20;

    y = section(doc, "Data Quality / Coverage", y);
    autoTable(doc, {
      ...tableDefaults(),
      startY: y,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak" },
      columnStyles: { 4: { cellWidth: 160 } },
      head: [
        [
          "Metric",
          "Effective From",
          "Included",
          "Excluded",
          "Exclusion Reason",
        ],
      ],
      body: s4.coverage.map((c) => [
        c.metricName,
        c.effectiveFrom ?? "n/a (semua histori)",
        String(c.includedCount),
        String(c.excludedCount),
        c.exclusionReason ?? "-",
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

  const iso = (d: Date) => toLocalIsoDate(d);
  const filename = `${options.filenamePrefix}-${role}-${iso(range.from)}_${iso(range.to)}.pdf`;
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
