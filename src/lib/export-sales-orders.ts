import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { ROLE_LABEL } from "@/context/role-context";
import type { DateRange, Role } from "@/lib/domain";
import type { SalesOrderDocument } from "@/lib/data/sales-orders";
import { EmptyExportError } from "@/lib/export-csv";
import {
  formatDateShort,
  formatPercent,
  formatRupiahFull,
  formatRupiahShort,
} from "@/lib/format";

type OwnerLookup = Record<string, { name: string; initials: string }>;
type ClientLookup = Record<string, { name: string }>;

export type SalesOrdersExportSummary = {
  ppn: number;
  nonPpn: number;
  total: number;
  rfq: number;
  existing: number;
  protoPaid: number;
  focCount: number;
};

export type SalesOrdersExportContext = {
  role: Role;
  range: DateRange;
  rows: SalesOrderDocument[];
  clientsById: ClientLookup;
  ownersById: OwnerLookup;
  summary: SalesOrdersExportSummary;
};

const IDR_FMT = '"Rp" #,##0;[Red]-"Rp" #,##0;"-"';
const DATE_FMT = "yyyy-mm-dd";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const stamp = (range: DateRange) => `${iso(range.from)}_${iso(range.to)}`;

function assertRows(rows: SalesOrderDocument[]) {
  if (rows.length === 0) {
    throw new EmptyExportError(
      "Tidak ada data sales order untuk periode yang dipilih.",
    );
  }
}

function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function sheetFromRows(rows: Record<string, unknown>[], columns: Column[]) {
  const aoa: unknown[][] = [columns.map((column) => column.header)];
  for (const row of rows) {
    aoa.push(
      columns.map((column) => {
        const value = row[column.key];
        if (value === null || value === undefined) return "";
        if (column.type === "date" && value instanceof Date) return value;
        if (column.type === "idr" || column.type === "int") return value;
        return sanitizeText(value);
      }),
    );
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const column = columns[c];
    for (let r = 1; r <= range.e.r; r += 1) {
      const address = XLSX.utils.encode_cell({ r, c });
      const cell = ws[address];
      if (!cell) continue;
      if (column.type === "idr") {
        cell.t = "n";
        cell.z = IDR_FMT;
      } else if (column.type === "date") {
        cell.t = "d";
        cell.z = DATE_FMT;
      } else if (column.type === "int") {
        cell.t = "n";
        cell.z = "0";
      }
    }
  }
  ws["!cols"] = columns.map((column) => ({
    wch: column.width ?? Math.max(12, column.header.length + 2),
  }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
}

type Column = {
  header: string;
  key: string;
  type?: "text" | "idr" | "date" | "int";
  width?: number;
};

function rowsForExport(context: SalesOrdersExportContext) {
  return context.rows.map((so) => {
    const foc = so.type === "Prototype" && so.prototypeStatus === "FOC";
    return {
      soNumber: so.soNumber,
      date: new Date(so.date),
      customerPoNumber: so.customerPoNumber ?? "",
      client: context.clientsById[so.clientId]?.name ?? "-",
      product:
        so.items.length === 0
          ? ""
          : so.items
              .map((item) => item.productName ?? item.description ?? "")
              .filter(Boolean)
              .join("; "),
      owner: context.ownersById[so.ownerId]?.name ?? "-",
      type: so.type,
      source: so.source,
      tax: foc ? "FOC" : (so.taxType ?? ""),
      items: so.items.length,
      value: foc ? 0 : (so.value ?? 0),
    };
  });
}

function lineItemsForExport(context: SalesOrdersExportContext) {
  return context.rows.flatMap((so) =>
    so.items.map((item) => ({
      soNumber: so.soNumber,
      date: new Date(so.date),
      client: context.clientsById[so.clientId]?.name ?? "-",
      productName: item.productName ?? "",
      description: item.description ?? "",
      qty: item.qty ?? 0,
      uom: item.uom ?? "",
      unitPrice: item.unitPrice ?? 0,
      lineTotal: item.lineTotal ?? 0,
    })),
  );
}

export function exportSalesOrdersXlsx(
  context: SalesOrdersExportContext,
): number {
  assertRows(context.rows);

  const wb = XLSX.utils.book_new();
  const { summary } = context;
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(
      [
        { metric: "Total Revenue", value: formatRupiahFull(summary.total) },
        {
          metric: "PPN",
          value: formatRupiahFull(summary.ppn),
          note: formatPercent(summary.total ? summary.ppn / summary.total : 0),
        },
        {
          metric: "Non-PPN",
          value: formatRupiahFull(summary.nonPpn),
          note: formatPercent(
            summary.total ? summary.nonPpn / summary.total : 0,
          ),
        },
        { metric: "RFQ / New Product", value: formatRupiahFull(summary.rfq) },
        {
          metric: "Existing / Repeat Order",
          value: formatRupiahFull(summary.existing),
        },
        {
          metric: "Prototype Paid",
          value: formatRupiahFull(summary.protoPaid),
        },
        { metric: "Prototype FOC", value: `${summary.focCount} SO` },
      ],
      [
        { header: "Metric", key: "metric", width: 28 },
        { header: "Value", key: "value", width: 24 },
        { header: "Note", key: "note", width: 18 },
      ],
    ),
    "Summary",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(rowsForExport(context), [
      { header: "No. SO", key: "soNumber", width: 16 },
      { header: "Tanggal", key: "date", type: "date", width: 14 },
      { header: "Customer PO", key: "customerPoNumber", width: 22 },
      { header: "Klien", key: "client", width: 32 },
      { header: "Nama Product", key: "product", width: 44 },
      { header: "Owner", key: "owner", width: 22 },
      { header: "Tipe", key: "type", width: 12 },
      { header: "Source", key: "source", width: 24 },
      { header: "Pajak", key: "tax", width: 12 },
      { header: "Items", key: "items", type: "int", width: 10 },
      { header: "Nilai", key: "value", type: "idr", width: 18 },
    ]),
    "Sales Orders",
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(lineItemsForExport(context), [
      { header: "No. SO", key: "soNumber", width: 16 },
      { header: "Tanggal", key: "date", type: "date", width: 14 },
      { header: "Klien", key: "client", width: 32 },
      { header: "Product", key: "productName", width: 34 },
      { header: "Description", key: "description", width: 44 },
      { header: "Qty", key: "qty", type: "int", width: 10 },
      { header: "UOM", key: "uom", width: 10 },
      { header: "Unit Price", key: "unitPrice", type: "idr", width: 18 },
      { header: "Line Total", key: "lineTotal", type: "idr", width: 18 },
    ]),
    "Line Items",
  );

  XLSX.writeFile(
    wb,
    `dsm-sales-orders-revenue-${context.role}-${stamp(context.range)}.xlsx`,
    { bookType: "xlsx", compression: true },
  );
  return context.rows.length;
}

export function exportSalesOrdersPdf(context: SalesOrdersExportContext) {
  assertRows(context.rows);

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const period = `${formatDateShort(context.range.from)} - ${formatDateShort(context.range.to)}`;

  doc.setFillColor(3, 45, 96);
  doc.rect(0, 0, pageW, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Sales Orders & Revenue", 32, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Scope: ${ROLE_LABEL[context.role]} | Periode ${period} | ${context.rows.length} SO`,
    32,
    46,
  );

  autoTable(doc, {
    startY: 82,
    theme: "grid",
    margin: { left: 32, right: 32 },
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [1, 118, 211], textColor: 255 },
    head: [["Metric", "Value", "Reference"]],
    body: [
      ["Total Revenue", formatRupiahShort(context.summary.total), ""],
      [
        "PPN",
        formatRupiahShort(context.summary.ppn),
        formatPercent(
          context.summary.total
            ? context.summary.ppn / context.summary.total
            : 0,
        ),
      ],
      [
        "Non-PPN",
        formatRupiahShort(context.summary.nonPpn),
        formatPercent(
          context.summary.total
            ? context.summary.nonPpn / context.summary.total
            : 0,
        ),
      ],
      ["Prototype FOC", `${context.summary.focCount} SO`, "Rp0 revenue"],
    ],
  });

  autoTable(doc, {
    startY:
      ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? 82) + 18,
    theme: "striped",
    margin: { left: 32, right: 32, bottom: 34 },
    styles: { fontSize: 7.2, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [1, 118, 211], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 54 },
      2: { cellWidth: 86 },
      3: { cellWidth: 128 },
      4: { cellWidth: 132 },
      10: { halign: "right" },
    },
    head: [
      [
        "No. SO",
        "Tanggal",
        "Customer PO",
        "Klien",
        "Nama Product",
        "Owner",
        "Tipe",
        "Source",
        "Pajak",
        "Items",
        "Nilai",
      ],
    ],
    body: rowsForExport(context).map((row) => [
      row.soNumber,
      formatDateShort(row.date),
      row.customerPoNumber,
      row.client,
      row.product,
      row.owner,
      row.type,
      row.source,
      row.tax,
      String(row.items),
      formatRupiahShort(row.value),
    ]),
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`DSM Sales Execution | Periode ${period}`, 32, pageH - 18);
    doc.text(`Page ${page} of ${pageCount}`, pageW - 32, pageH - 18, {
      align: "right",
    });
  }

  doc.save(
    `dsm-sales-orders-revenue-${context.role}-${stamp(context.range)}.pdf`,
  );
}
