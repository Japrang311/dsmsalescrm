import * as XLSX from "xlsx";
import type { RawSheetRow, SheetTab } from "./classify";

type ColumnMap = {
  documentNumber: string;
  customerPoNumber?: string;
  customerName: string;
  ownerName: string;
  description: string;
  dateOrMonth: string;
  qty: string;
  uom?: string;
  unitPrice: string;
  lineTotal: string;
  address?: string;
  stage?: string;
  linkedSoNumber?: string;
  note?: string;
};

const TAB_COLUMNS: Record<SheetTab, ColumnMap> = {
  QUOTATION: {
    documentNumber: "Quotation Number",
    customerName: "Clients",
    ownerName: "Account",
    description: "Description",
    dateOrMonth: "Date",
    qty: "QTY",
    uom: "UOM",
    unitPrice: "Harga satuan",
    lineTotal: "Harga total",
    address: "Address",
    stage: "Status",
    linkedSoNumber: "SO Number",
    note: "Note",
  },
  "SO 2026": {
    documentNumber: "No SO",
    customerPoNumber: "No PO Customer",
    customerName: "Customer",
    ownerName: "Sales",
    description: "Deskripsi Project",
    dateOrMonth: "Month",
    qty: "Qty",
    uom: "UOM",
    unitPrice: "Unit Price",
    lineTotal: "Total Price",
  },
  "NP 2026": {
    documentNumber: "SO NP",
    customerPoNumber: "Nomor PO Customer",
    customerName: "Customer",
    ownerName: "Sales",
    description: "Deskripsi Project",
    dateOrMonth: "Bulan",
    qty: "QTY PO",
    uom: "UOM",
    unitPrice: "Unit Price",
    lineTotal: "Total Price",
  },
  PROTY: {
    documentNumber: "SO PROTY",
    customerPoNumber: "Nomor PO Customer",
    customerName: "Customer",
    ownerName: "Sales",
    description: "Deskripsi Project",
    dateOrMonth: "Bulan",
    qty: "QTY PO",
    uom: "UOM",
    unitPrice: "Unit Price",
    lineTotal: "Total Price",
  },
  HARIFF: {
    documentNumber: "SO NP",
    customerPoNumber: "Nomor PO Customer",
    customerName: "Customer",
    ownerName: "Sales",
    description: "Deskripsi Project",
    dateOrMonth: "Bulan",
    qty: "QTY PO",
    uom: "UOM",
    unitPrice: "Unit Price",
    lineTotal: "Total Price",
  },
};

function cell(record: Record<string, unknown>, column?: string): string {
  if (!column) return "";
  const value = record[column];
  return value === undefined || value === null ? "" : String(value).trim();
}

function dateCell(
  record: Record<string, unknown>,
  column: string,
  exactDate: boolean,
): string {
  const value = record[column];
  if (exactDate && typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(
        parsed.d,
      ).padStart(2, "0")}`;
    }
  }
  return cell(record, column);
}

export function parseSheetCsv(tab: SheetTab, csvText: string): RawSheetRow[] {
  const workbook = XLSX.read(csvText.replace(/\r(?!\n)/g, ""), {
    type: "string",
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const records: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: true,
    defval: "",
  });
  const columns = TAB_COLUMNS[tab];

  const rows = records.map((record, sourceIndex) => ({
    sourceIndex: sourceIndex + 1,
    documentNumber: cell(record, columns.documentNumber),
    customerPoNumber: cell(record, columns.customerPoNumber),
    customerName: cell(record, columns.customerName),
    ownerName: cell(record, columns.ownerName),
    description: cell(record, columns.description),
    dateOrMonth: dateCell(record, columns.dateOrMonth, tab === "QUOTATION"),
    qtyRaw: cell(record, columns.qty),
    uomRaw: cell(record, columns.uom),
    unitPriceRaw: cell(record, columns.unitPrice),
    lineTotalRaw: cell(record, columns.lineTotal),
    address: cell(record, columns.address),
    stage: cell(record, columns.stage),
    linkedSoNumber: cell(record, columns.linkedSoNumber),
    note: cell(record, columns.note),
  }));

  if (tab === "QUOTATION") return rows;

  const rowsByDocument = new Map<string, RawSheetRow[]>();
  for (const row of rows) {
    if (!row.documentNumber) continue;
    rowsByDocument.set(row.documentNumber, [
      ...(rowsByDocument.get(row.documentNumber) ?? []),
      row,
    ]);
  }
  for (const documentRows of rowsByDocument.values()) {
    const poNumbers = [
      ...new Set(
        documentRows
          .map((row) => row.customerPoNumber)
          .filter((value) => value.length > 0),
      ),
    ];
    if (poNumbers.length !== 1) continue;
    for (const row of documentRows) {
      if (!row.customerPoNumber) row.customerPoNumber = poNumbers[0];
    }
  }

  return rows;
}
