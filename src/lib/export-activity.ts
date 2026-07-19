import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { EmptyExportError } from "@/lib/export-csv";
import { formatDateShort } from "@/lib/format";
import { ROLE_LABEL } from "@/context/role-context";
import type { Role } from "@/lib/domain";

export type ActivityExportEvent = {
  id: string;
  at: string;
  kindLabel: string;
  clientName?: string;
  ownerName?: string;
  title: string;
  detail?: string;
  linkLabel?: string;
};

export type ActivityExportMeta = {
  role: Role;
  rangeLabel: string;
  filters: {
    keyword?: string;
    kind: string;
    owner: string;
  };
  fromISO: string;
  toISO: string;
};

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

function download(filename: string, mime: string, data: BlobPart) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function exportActivityCsv(
  events: ActivityExportEvent[],
  meta: ActivityExportMeta,
): number {
  if (!events || events.length === 0) {
    throw new EmptyExportError(
      "Tidak ada aktivitas untuk filter yang dipilih.",
    );
  }
  const csv = toCsv([
    ["Waktu", "Tipe", "Client", "Owner", "Judul", "Detail", "Tautan"],
    ...events.map((e) => [
      fmtDateTime(e.at),
      e.kindLabel,
      e.clientName ?? "",
      e.ownerName ?? "",
      e.title,
      e.detail ?? "",
      e.linkLabel ?? "",
    ]),
  ]);
  download(
    `dsm-activity-${meta.role}-${meta.fromISO}_${meta.toISO}.csv`,
    "text/csv;charset=utf-8;",
    "\ufeff" + csv,
  );
  return events.length;
}

const BRAND = { r: 1, g: 118, b: 211 };
const NAVY = { r: 3, g: 45, b: 96 };
const MUTED = { r: 100, g: 116, b: 139 };
const MARGIN_X = 40;

export function exportActivityPdf(
  events: ActivityExportEvent[],
  meta: ActivityExportMeta,
): number {
  if (!events || events.length === 0) {
    throw new EmptyExportError(
      "Tidak ada aktivitas untuk filter yang dipilih.",
    );
  }
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 0, pageW, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("DSM Sales Execution", MARGIN_X, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Activity Log", MARGIN_X, 50);
  doc.setFontSize(9);
  doc.text(
    `Generated ${formatDateShort(new Date())} · Scope: ${ROLE_LABEL[meta.role]} · Periode ${meta.rangeLabel}`,
    pageW - MARGIN_X,
    50,
    { align: "right" },
  );

  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Filter Aktif", MARGIN_X, 92);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  const filterLine = [
    `Rentang: ${meta.rangeLabel}`,
    `Tipe: ${meta.filters.kind}`,
    `Owner: ${meta.filters.owner}`,
    meta.filters.keyword ? `Kata kunci: "${meta.filters.keyword}"` : null,
    `Total: ${events.length} aktivitas`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  doc.text(filterLine, MARGIN_X, 108);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 124,
    margin: { left: MARGIN_X, right: MARGIN_X, bottom: 40 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    pageBreak: "auto",
    styles: {
      fontSize: 8,
      cellPadding: 5,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [BRAND.r, BRAND.g, BRAND.b],
      textColor: 255,
      fontStyle: "bold",
    },
    head: [["Waktu", "Tipe", "Client", "Owner", "Judul", "Detail"]],
    body: events.map((e) => [
      fmtDateTime(e.at),
      e.kindLabel,
      e.clientName ?? "-",
      e.ownerName ?? "-",
      e.title,
      e.detail ?? "",
    ]),
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 80 },
      2: { cellWidth: 110 },
      3: { cellWidth: 90 },
      4: { cellWidth: 180 },
      5: { cellWidth: "auto" },
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(
      `DSM Sales Execution · Activity Log · ${meta.rangeLabel}`,
      MARGIN_X,
      pageH - 20,
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - MARGIN_X, pageH - 20, {
      align: "right",
    });
  }

  doc.save(`dsm-activity-${meta.role}-${meta.fromISO}_${meta.toISO}.pdf`);
  return events.length;
}
