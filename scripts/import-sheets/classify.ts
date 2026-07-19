import {
  parseDocumentNumber,
  type DocumentSeries,
  type Uom,
} from "../../src/lib/data/document-numbering";

export type SheetTab = "QUOTATION" | "SO 2026" | "NP 2026" | "PROTY" | "HARIFF";

export type RawSheetRow = {
  sourceIndex: number;
  documentNumber: string;
  customerPoNumber: string;
  customerName: string;
  ownerName: string;
  description: string;
  dateOrMonth: string;
  qtyRaw: string;
  uomRaw: string;
  unitPriceRaw: string;
  lineTotalRaw: string;
  address: string;
  stage: string;
  linkedSoNumber: string;
  note: string;
};

export type ImportedLineItem = {
  productName: null;
  description: string | null;
  qty: number;
  uom: Uom;
  unitPrice: number | null;
  lineTotal: number | null;
  linePosition: number;
};

export type ImportedCommercialHeader = {
  kind: "commercial";
  quotationNumber: string;
  quotationBaseNumber: string;
  quotationRevision: number;
  isCurrentRevision: boolean;
  supersedesQuotationNumber: string | null;
  documentDate: string;
  clientId: string;
  ownerId: string;
  clientAddress: string | null;
  stage: string;
  soNumber: string | null;
  note: string | null;
};

export type ImportedSalesOrderHeader = {
  kind: "sales_order";
  sourceTab: Exclude<SheetTab, "QUOTATION">;
  soNumber: string;
  customerPoNumber: string;
  date: string;
  clientId: string;
  ownerId: string;
  type: "Regular" | "Prototype";
  taxType: "PPN" | "Non-PPN" | null;
  prototypeStatus: "Paid" | "FOC" | null;
  source: "Existing / Repeat Order" | "Prototype Paid" | "Prototype FOC";
  numberMode: "Imported";
  totalValue: number | null;
};

export type ImportedDocument = {
  header: ImportedCommercialHeader | ImportedSalesOrderHeader;
  items: ImportedLineItem[];
};

export type ReviewReasonCode =
  | "unmatched_customer"
  | "unmatched_sales"
  | "missing_document_number"
  | "missing_customer_po"
  | "unparseable_date"
  | "unparseable_quotation_revision"
  | "invalid_qty"
  | "unknown_uom"
  | "invalid_paid_money"
  | "foc_money_present"
  | "price_mismatch"
  | "document_has_rejected_rows"
  | "header_conflict";

export type ImportReview = {
  status: "review";
  code: ReviewReasonCode;
  message: string;
  tab: SheetTab;
  raw: RawSheetRow;
};

export type ClassifiedSheetRow =
  | {
      status: "import";
      tab: SheetTab;
      sourceIndex: number;
      header: ImportedCommercialHeader | ImportedSalesOrderHeader;
      item: ImportedLineItem;
    }
  | ImportReview;

export type ImportResult = {
  documents: ImportedDocument[];
  reviews: ImportReview[];
};

export type CounterSeed = {
  series: DocumentSeries;
  yearCode: number;
  lastValue: number;
};

export type NameLookup = Map<string, string>;

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildNameLookup(
  rows: { id: string; name: string }[],
): NameLookup {
  return new Map(rows.map((row) => [normalizeName(row.name), row.id]));
}

export const APPROVED_CLIENT_ALIASES: Record<string, string> = {
  "CV. LEUWIANYAR TEKNIK": "CV. LEUWI ANYAR TEKNIK",
  "PT. ENGINEERING VISI ANTAR NUSA": "PT. ENGINEERING VISIT ANTAR NUSA",
  "PT. IDEA EDVOLUTION TECHNOLOGY": "PT. IDEAS EDVOLUTION TECHNOLOGGY",
  "PT. RIZQALLAH BOEM MAKMUR": "PT. Rizqallah Boer Makmur",
  "PT. ZAITECH ENGINEERING INDONESIA": "PT ZAITECH ENJINIRING INDONESIA",
  "PT. CIKARANG LISTRINDO": "PT. Cikarang listrindo Indonesia",
  "PT. MEKANIKA ELEKRIKA INDOCIPTA": "PT. MEKANIKA ELEKTRIKA INDOCIPTA",
  "PT. CONTROL SYSTEM ARENA PARA NUSA": "PT. CONTROL SYSTEMS ARENA PARA NUSA",
  "PT SURYA ANUGRAH ENJINEERING": "PT. SURYA ANUGRAH ENJINEERING",
};

export const APPROVED_SALES_ALIASES: Record<string, string> = {
  Sales: "Siti Zulaika (Ika)",
};

export function buildClientNameLookup(
  rows: { id: string; name: string }[],
): NameLookup {
  const lookup = buildNameLookup(rows);
  for (const [alias, canonicalName] of Object.entries(
    APPROVED_CLIENT_ALIASES,
  )) {
    const clientId = lookup.get(normalizeName(canonicalName));
    if (clientId) lookup.set(normalizeName(alias), clientId);
  }
  return lookup;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  januari: 1,
  feb: 2,
  february: 2,
  februari: 2,
  mar: 3,
  march: 3,
  maret: 3,
  apr: 4,
  april: 4,
  may: 5,
  mei: 5,
  jun: 6,
  june: 6,
  juni: 6,
  jul: 7,
  july: 7,
  juli: 7,
  aug: 8,
  august: 8,
  agustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
  desember: 12,
};

export function parseMonthToDate(raw: string, year: number): string | null {
  const normalized = raw.trim().toLowerCase();
  const numeric = Number(normalized);
  const month =
    Number.isInteger(numeric) && numeric >= 1 && numeric <= 12
      ? numeric
      : MONTH_NAMES[normalized];
  return month ? `${year}-${String(month).padStart(2, "0")}-01` : null;
}

function validIsoDate(year: number, month: number, day: number): string | null {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function parseDate(
  raw: string,
  year: number,
  quotation: boolean,
): string | null {
  if (!quotation) return parseMonthToDate(raw, year);
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return validIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const parsedYear = Number(dayFirst[3]);
    return validIsoDate(parsedYear, month, day);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? null
    : parsed.toISOString().slice(0, 10);
}

function parseMoney(raw: string): number | null {
  const compact = raw.replace(/[^\d,.-]/g, "");
  if (compact === "") return null;
  let normalized: string;
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(compact)) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(compact)) {
    normalized = compact.replace(/,/g, "");
  } else if (/^-?\d+(?:[.,]\d+)?$/.test(compact)) {
    normalized = compact.replace(",", ".");
  } else {
    return null;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseQtyAndUom(
  qtyRaw: string,
  uomRaw: string,
  defaultUom?: Uom,
): { qty: number; uom: Uom } | null {
  const match = qtyRaw.trim().match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-z-]+)?$/);
  if (!match) return null;
  const qty = Number(match[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const rawUom = (uomRaw || match[2] || defaultUom || "").trim().toLowerCase();
  const aliases: Record<string, Uom> = {
    unit: "Unit",
    units: "Unit",
    pcs: "Pcs",
    pc: "Pcs",
    set: "Set",
    sets: "Set",
    lot: "Lot",
    lots: "Lot",
  };
  const uom = aliases[rawUom];
  return uom ? { qty, uom } : null;
}

function review(
  tab: SheetTab,
  raw: RawSheetRow,
  code: ReviewReasonCode,
  message: string,
): ImportReview {
  return { status: "review", tab, raw, code, message };
}

function parseQuotationNumber(number: string): {
  base: string;
  revision: number;
} | null {
  const value = number.trim();
  const match = /^(.*?)(?:_REV\.(\d+))?$/i.exec(value);
  if (!match || !match[1] || /_REV\./i.test(match[1])) return null;
  return { base: match[1], revision: Number(match[2] ?? 0) };
}

export function classifyRow(
  tab: SheetTab,
  raw: RawSheetRow,
  year: number,
  clientsByName: NameLookup,
  salesByName: NameLookup,
  clientOwnersByName: NameLookup = new Map(),
): ClassifiedSheetRow {
  const clientId = clientsByName.get(normalizeName(raw.customerName));
  if (!clientId)
    return review(
      tab,
      raw,
      "unmatched_customer",
      `No client match for "${raw.customerName}"`,
    );
  const ownerId =
    salesByName.get(normalizeName(raw.ownerName)) ??
    (tab === "PROTY" && raw.ownerName.trim() === ""
      ? clientOwnersByName.get(normalizeName(raw.customerName))
      : undefined);
  if (!ownerId)
    return review(
      tab,
      raw,
      "unmatched_sales",
      `No sales match for "${raw.ownerName}"`,
    );
  if (!raw.documentNumber)
    return review(
      tab,
      raw,
      "missing_document_number",
      "Document number is blank",
    );

  const date = parseDate(raw.dateOrMonth, year, tab === "QUOTATION");
  if (!date)
    return review(
      tab,
      raw,
      "unparseable_date",
      `Invalid date "${raw.dateOrMonth}"`,
    );

  const qtyAndUom = parseQtyAndUom(
    raw.qtyRaw,
    raw.uomRaw,
    tab === "SO 2026" ||
      tab === "NP 2026" ||
      tab === "PROTY" ||
      tab === "HARIFF"
      ? "Unit"
      : undefined,
  );
  if (!qtyAndUom) {
    const qtyLooksValid = /^\d+(?:[.,]\d+)?/.test(raw.qtyRaw.trim());
    return review(
      tab,
      raw,
      qtyLooksValid ? "unknown_uom" : "invalid_qty",
      `Invalid Qty/UOM "${raw.qtyRaw}" / "${raw.uomRaw}"`,
    );
  }

  const unitPrice = parseMoney(raw.unitPriceRaw);
  const lineTotal = parseMoney(raw.lineTotalRaw);
  const noChargeTotal = lineTotal === null || lineTotal === 0;
  const foc = tab === "PROTY" && unitPrice === null && noChargeTotal;
  if (tab === "PROTY" && noChargeTotal && unitPrice !== null && unitPrice !== 0)
    return review(tab, raw, "foc_money_present", "FOC row carries money");
  if (!foc && (unitPrice === null || unitPrice <= 0 || lineTotal === null))
    return review(tab, raw, "invalid_paid_money", "Paid row has invalid money");
  if (
    !foc &&
    Math.abs(qtyAndUom.qty * (unitPrice ?? 0) - (lineTotal ?? 0)) > 0.01
  )
    return review(
      tab,
      raw,
      "price_mismatch",
      "Line total differs from Qty x Unit Price",
    );

  const item: ImportedLineItem = {
    productName: null,
    description: raw.description || null,
    qty: qtyAndUom.qty,
    uom: qtyAndUom.uom,
    unitPrice: foc ? null : unitPrice,
    lineTotal: foc ? null : lineTotal,
    linePosition: 0,
  };

  if (tab === "QUOTATION") {
    const parsedNumber = parseQuotationNumber(raw.documentNumber);
    if (!parsedNumber)
      return review(
        tab,
        raw,
        "unparseable_quotation_revision",
        `Invalid quotation number "${raw.documentNumber}"`,
      );
    return {
      status: "import",
      tab,
      sourceIndex: raw.sourceIndex,
      header: {
        kind: "commercial",
        quotationNumber: raw.documentNumber,
        quotationBaseNumber: parsedNumber.base,
        quotationRevision: parsedNumber.revision,
        isCurrentRevision: true,
        supersedesQuotationNumber: null,
        documentDate: date,
        clientId,
        ownerId,
        clientAddress: raw.address || null,
        stage: raw.stage,
        soNumber: raw.linkedSoNumber || null,
        note: raw.note || null,
      },
      item,
    };
  }

  if (!raw.customerPoNumber)
    return review(tab, raw, "missing_customer_po", "Customer PO is blank");
  const prototype = tab === "PROTY";
  return {
    status: "import",
    tab,
    sourceIndex: raw.sourceIndex,
    header: {
      kind: "sales_order",
      sourceTab: tab,
      soNumber: raw.documentNumber,
      customerPoNumber: raw.customerPoNumber,
      date,
      clientId,
      ownerId,
      type: prototype ? "Prototype" : "Regular",
      taxType: prototype ? null : tab === "NP 2026" ? "Non-PPN" : "PPN",
      prototypeStatus: prototype ? (foc ? "FOC" : "Paid") : null,
      source: prototype
        ? foc
          ? "Prototype FOC"
          : "Prototype Paid"
        : "Existing / Repeat Order",
      numberMode: "Imported",
      totalValue: foc ? null : 0,
    },
    item,
  };
}

function headerFingerprint(
  header: ImportedCommercialHeader | ImportedSalesOrderHeader,
): string {
  const copy = { ...header };
  if (copy.kind === "commercial") {
    copy.isCurrentRevision = true;
    copy.supersedesQuotationNumber = null;
    copy.clientAddress = copy.clientAddress
      ? copy.clientAddress
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .replace(/\s+/g, " ")
      : null;
  } else {
    copy.totalValue = copy.prototypeStatus === "FOC" ? null : 0;
  }
  return JSON.stringify(copy);
}

export function groupImportRows(rows: ClassifiedSheetRow[]): ImportResult {
  const reviews = rows.filter(
    (row): row is ImportReview => row.status === "review",
  );
  const rejectedDocumentKeys = new Set(
    reviews
      .filter((row) => row.raw.documentNumber.trim())
      .map(
        (row) =>
          `${row.tab === "QUOTATION" ? "commercial" : "sales_order"}:${row.raw.documentNumber.trim()}`,
      ),
  );
  const groups = new Map<
    string,
    Extract<ClassifiedSheetRow, { status: "import" }>[]
  >();
  for (const row of rows) {
    if (row.status !== "import") continue;
    const key = `${row.header.kind}:${
      row.header.kind === "commercial"
        ? row.header.quotationNumber
        : row.header.soNumber
    }`;
    if (rejectedDocumentKeys.has(key)) {
      reviews.push(
        review(
          row.tab,
          {
            sourceIndex: row.sourceIndex,
            documentNumber:
              row.header.kind === "commercial"
                ? row.header.quotationNumber
                : row.header.soNumber,
            customerPoNumber:
              row.header.kind === "sales_order"
                ? row.header.customerPoNumber
                : "",
            customerName: "",
            ownerName: "",
            description: row.item.description ?? "",
            dateOrMonth: "",
            qtyRaw: String(row.item.qty),
            uomRaw: row.item.uom,
            unitPriceRaw: String(row.item.unitPrice ?? ""),
            lineTotalRaw: String(row.item.lineTotal ?? ""),
            address: "",
            stage: "",
            linkedSoNumber: "",
            note: "",
          },
          "document_has_rejected_rows",
          "Another row for this document requires review; the entire document was quarantined",
        ),
      );
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const documents: ImportedDocument[] = [];
  for (const grouped of groups.values()) {
    const isHariffGroup = grouped.every(
      (row) =>
        row.header.kind === "sales_order" && row.header.sourceTab === "HARIFF",
    );
    const mergedHariffPoNumbers = isHariffGroup
      ? [
          ...new Set(
            grouped.map(
              (row) =>
                (row.header as ImportedSalesOrderHeader).customerPoNumber,
            ),
          ),
        ].join(" / ")
      : "";
    const groupedRows = isHariffGroup
      ? grouped.map((row) => ({
          ...row,
          header:
            row.header.kind === "sales_order"
              ? {
                  ...row.header,
                  customerPoNumber: mergedHariffPoNumbers,
                }
              : row.header,
        }))
      : grouped;
    const fingerprints = new Set(
      groupedRows.map((row) => headerFingerprint(row.header)),
    );
    if (fingerprints.size > 1) {
      reviews.push(
        ...groupedRows.map((row) =>
          review(
            row.tab,
            {
              sourceIndex: row.sourceIndex,
              documentNumber:
                row.header.kind === "commercial"
                  ? row.header.quotationNumber
                  : row.header.soNumber,
              customerPoNumber:
                row.header.kind === "sales_order"
                  ? row.header.customerPoNumber
                  : "",
              customerName: "",
              ownerName: "",
              description: row.item.description ?? "",
              dateOrMonth: "",
              qtyRaw: String(row.item.qty),
              uomRaw: row.item.uom,
              unitPriceRaw: String(row.item.unitPrice ?? ""),
              lineTotalRaw: String(row.item.lineTotal ?? ""),
              address: "",
              stage: "",
              linkedSoNumber: "",
              note: "",
            },
            "header_conflict",
            "Rows sharing a document number disagree on header fields",
          ),
        ),
      );
      continue;
    }

    const header = { ...groupedRows[0].header };
    const items = groupedRows
      .sort((a, b) => a.sourceIndex - b.sourceIndex)
      .map((row, index) => ({ ...row.item, linePosition: index + 1 }));
    if (header.kind === "sales_order") {
      header.totalValue =
        header.prototypeStatus === "FOC"
          ? null
          : items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
    }
    documents.push({ header, items });
  }

  const quotationGroups = new Map<string, ImportedDocument[]>();
  for (const document of documents) {
    if (document.header.kind !== "commercial") continue;
    const base = document.header.quotationBaseNumber;
    quotationGroups.set(base, [...(quotationGroups.get(base) ?? []), document]);
  }
  for (const chain of quotationGroups.values()) {
    chain.sort(
      (a, b) =>
        (a.header as ImportedCommercialHeader).quotationRevision -
        (b.header as ImportedCommercialHeader).quotationRevision,
    );
    chain.forEach((document, index) => {
      const header = document.header as ImportedCommercialHeader;
      header.isCurrentRevision = index === chain.length - 1;
      header.supersedesQuotationNumber =
        index === 0
          ? null
          : (chain[index - 1].header as ImportedCommercialHeader)
              .quotationNumber;
    });
  }

  return { documents, reviews };
}

export function deriveCounterSeeds(rows: ClassifiedSheetRow[]): CounterSeed[] {
  const maxima = new Map<string, CounterSeed>();
  for (const row of rows) {
    if (row.tab === "HARIFF") continue;
    const raw =
      row.status === "review"
        ? row.raw.documentNumber
        : row.header.kind === "commercial"
          ? row.header.quotationBaseNumber
          : row.header.soNumber;
    const parsed = parseDocumentNumber(raw);
    if (!parsed) continue;
    const key = `${parsed.series}:${parsed.yearCode}`;
    const existing = maxima.get(key);
    if (!existing || parsed.sequence > existing.lastValue) {
      maxima.set(key, {
        series: parsed.series,
        yearCode: parsed.yearCode,
        lastValue: parsed.sequence,
      });
    }
  }
  return [...maxima.values()].sort(
    (a, b) => a.yearCode - b.yearCode || a.series.localeCompare(b.series),
  );
}
