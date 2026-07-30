// Client-facing Quotation PDF — a faithful reproduction of the Excel template
// "DSM-QUO-000 CONTOH TEMPLATE QUOTATION.xlsx" that Sales sends today.
//
// Geometry is taken straight from the workbook rather than re-designed, so the
// printed result stacks on top of the existing template: the sheet's eleven
// column widths (in Excel pixels) become the internal coordinate system, and
// Excel's fit-to-width print setting becomes a single scale factor. Row heights
// are the sheet's own `ht` values. Every literal below traces back to a cell in
// that workbook.
//
// autoTable is deliberately not used here: the template's item table has merged
// cells, unbordered continuation rows, and variable row heights, which is more
// code to fight than to draw directly.

import jsPDF from "jspdf";

import type { Client, CommercialItem } from "@/lib/domain";
import { formatRupiahFull } from "@/lib/format";

// --- Page -----------------------------------------------------------------
// A4 portrait; margins from the sheet's pageMargins (0.25in sides, 0.75in top
// and bottom).
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 18;
const MARGIN_Y = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_BOTTOM = PAGE_H - MARGIN_Y;

// --- Grid -----------------------------------------------------------------
// Left edge of each sheet column, in Excel pixels, derived from the stored
// column widths (A 62, B 19, C 80, D 111, E 12, F 324, G 52, H 65, I 125,
// J 20, K 193).
const COL = {
  A: 0,
  B: 62,
  C: 81,
  D: 161,
  E: 272,
  F: 284,
  G: 608,
  H: 660,
  I: 725,
  J: 850,
  K: 870,
  END: 1063,
} as const;

// The sheet prints with fitToPage, so Excel scales the 1063px grid to exactly
// fill the printable width. Everything else — fonts, row heights — rides on the
// same factor.
const FIT = CONTENT_W / (COL.END * 0.75);
const U = 0.75 * FIT; // pt per Excel pixel

/** Absolute page x for a grid position given in Excel pixels. */
const x = (gridPx: number) => MARGIN_X + gridPx * U;
/** Excel font size (pt) → printed font size (pt). */
const fs = (excelPt: number) => excelPt * FIT;
/** Excel row height (pt) → printed row height (pt). */
const rh = (excelPt: number) => excelPt * FIT;

const PAD = 2 * U; // Excel's default cell padding
const GREY_TITLE = 128; // theme 0, tint -0.5
const HEADER_FILL = 242; // theme 0, tint -0.05

const ROW_ITEM = rh(19.5);
const ROW_SPEC = rh(15);
const ROW_TOTAL = rh(14);
const ROW_TERM = rh(15);
const ROW_HEAD = rh(22.5);

const FONT_BODY = fs(11);
const FONT_TITLE = fs(28);

const LOGO_URL = "/brand/dsm-logo.png";

// --- Public API -----------------------------------------------------------

export type QuotationPdfInput = {
  item: CommercialItem;
  client: Client;
  owner: { name: string; email: string };
  /** org_settings.ppn_rate, e.g. 0.11 */
  ppnRate: number;
  /** Which of the client's three contacts fills the Attention block. */
  picIndex: number;
  customerReference: string;
  terms: string[];
  closingLines: string[];
  signerName: string;
  signerTitle: string;
  validityNote: string;
};

/**
 * Wording carried over verbatim from the template. Editable per export in the
 * preview dialog; deliberately not persisted (no schema for it). The signer's
 * name and title are not here — they come from the signed-in user.
 */
export const QUOTATION_PDF_DEFAULTS = {
  terms: [
    "FOB Bandung",
    "Delivery in 30 days (After Drawing Approved)",
    "Payment: 60 days, after invoice",
  ],
  closingLines: [
    "Should you have any enquiries concerning this quotes,",
    "Please contact adhitya@dutasolusimetalindo.com",
    "wa/mob 0821-20-2000-82",
  ],
  validityNote:
    "This quotation is valid for 30 days unless otherwise specified",
} as const;

export async function buildQuotationPdf(
  input: QuotationPdfInput,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const logo = await loadImage(LOGO_URL);

  let y = MARGIN_Y;

  drawLogo(doc, logo);
  y = drawTitleAndParties(doc, input, y);
  y = drawTableHeader(doc, y);

  const items = orderedItems(input.item);
  items.forEach((line, index) => {
    const plan = planItemBlock(doc, line, index + 1);
    y = ensureSpace(doc, y, plan.height);
    y = drawItemBlock(doc, plan, y);
  });

  y = drawTotals(doc, input, items, y);
  y = drawTerms(doc, input, y);
  drawClosing(doc, input, y);

  return doc;
}

export async function exportQuotationPdf(
  input: QuotationPdfInput,
): Promise<void> {
  const doc = await buildQuotationPdf(input);
  doc.save(quotationPdfFilename(input.item));
}

export function quotationPdfFilename(item: CommercialItem): string {
  const base = item.quotationNumber ?? item.projectName ?? "Quotation";
  return `${base.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
}

// --- Line items -----------------------------------------------------------

type QuotationLine = NonNullable<CommercialItem["lineItems"]>[number];

function orderedItems(item: CommercialItem): QuotationLine[] {
  return [...(item.lineItems ?? [])].sort(
    (a, b) => a.linePosition - b.linePosition,
  );
}

type ParsedSpec = {
  label: string;
  labelIndented: boolean;
  showColon: boolean;
  value: string;
};

type SpecRow = Omit<ParsedSpec, "value"> & { valueLines: string[] };

type ItemPlan = {
  no: number;
  nameLines: string[];
  qty: string;
  uom: string;
  price: string;
  amount: string;
  specs: SpecRow[];
  height: number;
};

/**
 * Turns a line item's multi-line `description` into the template's spec block.
 *
 *   "Cabinet Dimension : IP 55"   → label in column B, ":" in E, value in F
 *   "Material"                    → heading in column B
 *   "  SPCC T 1.4 mm : Frame"     → leading space indents the label to column C
 *   ": 1 lot, Door Seal"          → value only (continuation of the row above)
 *
 * The split is on the first ":". Blank lines are dropped.
 */
function parseSpecLines(description: string | null): ParsedSpec[] {
  if (!description) return [];
  const out: ParsedSpec[] = [];
  for (const raw of description.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const labelIndented = /^[ \t]/.test(raw);
    const line = raw.trim();
    const colon = line.indexOf(":");
    const label = colon === -1 ? line : line.slice(0, colon).trim();
    const value = colon === -1 ? "" : line.slice(colon + 1).trim();
    out.push({
      label,
      labelIndented,
      // Group headings ("Material") and bare continuation lines carry no
      // separator in the template — only real "Label : Value" rows do.
      showColon: colon !== -1 && label.length > 0,
      value,
    });
  }
  return out;
}

function planItemBlock(doc: jsPDF, line: QuotationLine, no: number): ItemPlan {
  doc.setFont("helvetica", "bold").setFontSize(FONT_BODY);
  const nameLines: string[] = doc.splitTextToSize(
    line.productName ?? "-",
    (COL.G - COL.B) * U - PAD * 2,
  );

  doc.setFont("helvetica", "normal");
  const valueWidth = (COL.G - COL.F) * U - PAD * 2;
  const specs: SpecRow[] = parseSpecLines(line.description).map((spec) => ({
    label: spec.label,
    labelIndented: spec.labelIndented,
    showColon: spec.showColon,
    valueLines: spec.value
      ? (doc.splitTextToSize(spec.value, valueWidth) as string[])
      : [],
  }));

  const qty = line.qty === null ? "" : line.qty.toLocaleString("id-ID");
  const price =
    line.unitPrice === null ? "-" : formatRupiahFull(line.unitPrice);
  const amount =
    line.lineTotal === null ? "-" : formatRupiahFull(line.lineTotal);

  const height =
    Math.max(nameLines.length, 1) * ROW_ITEM +
    specs.reduce(
      (sum, spec) => sum + Math.max(spec.valueLines.length, 1) * ROW_SPEC,
      0,
    );

  return {
    no,
    nameLines,
    qty,
    uom: line.uom ?? "",
    price,
    amount,
    specs,
    height,
  };
}

function drawItemBlock(doc: jsPDF, plan: ItemPlan, top: number): number {
  const rowH = Math.max(plan.nameLines.length, 1) * ROW_ITEM;
  const mid = top + ROW_ITEM / 2;

  doc.setFont("helvetica", "bold").setFontSize(FONT_BODY).setTextColor(0);
  text(doc, String(plan.no), center(COL.A, COL.B), mid, "center");
  plan.nameLines.forEach((lineText, index) => {
    text(doc, lineText, x(COL.B) + PAD, mid + index * ROW_ITEM, "left");
  });
  text(doc, plan.qty, x(COL.H) - PAD, mid, "right");
  text(doc, plan.uom, center(COL.H, COL.I), mid, "center");
  text(doc, plan.price, center(COL.I, COL.J), mid, "center");
  text(doc, plan.amount, x(COL.END) - PAD, mid, "right");

  let y = top + rowH;
  doc.setFont("helvetica", "normal");
  for (const spec of plan.specs) {
    const specH = Math.max(spec.valueLines.length, 1) * ROW_SPEC;
    const specMid = y + ROW_SPEC / 2;
    if (spec.label) {
      text(
        doc,
        spec.label,
        x(spec.labelIndented ? COL.C : COL.B) + PAD,
        specMid,
        "left",
      );
    }
    if (spec.showColon) text(doc, ":", x(COL.E) + PAD, specMid, "left");
    spec.valueLines.forEach((valueText, index) => {
      text(doc, valueText, x(COL.F) + PAD, specMid + index * ROW_SPEC, "left");
    });
    y += specH;
  }
  return y;
}

// --- Blocks ---------------------------------------------------------------

function drawLogo(doc: jsPDF, logo: LoadedImage | null) {
  // The workbook carries the logo as a first-page-only header image (LHFIRST),
  // so it is drawn once, in the top margin, and never repeated.
  if (!logo) return;
  const w = 152;
  doc.addImage(logo.data, "PNG", MARGIN_X, 18, w, w * logo.ratio);
}

function drawTitleAndParties(
  doc: jsPDF,
  input: QuotationPdfInput,
  top: number,
): number {
  const { item, client, owner } = input;
  let y = top;

  doc
    .setFont("helvetica", "normal")
    .setFontSize(FONT_TITLE)
    .setTextColor(GREY_TITLE);
  text(doc, "Quotation", MARGIN_X + CONTENT_W / 2, y + rh(78) / 2, "center");
  y += rh(78);

  doc.setFontSize(FONT_BODY).setTextColor(0);

  // Right-hand label column: right-aligned inside J, with Excel's 1-char
  // indent, so the text overflows leftwards exactly as it does in the sheet.
  const labelRight = x(COL.K - 7);
  const valueLeft = x(COL.K) + PAD;

  const rows: { h: number; label?: string; value?: string }[] = [
    { h: rh(18), label: "Date", value: formatTemplateDate(item.documentDate) },
    {
      h: rh(15),
      label: "DSM Quotation #",
      value: item.quotationNumber ?? "-",
    },
    {
      h: rh(14),
      label: "Customer Reference #",
      value: input.customerReference,
    },
    { h: rh(15), label: "Quotation By #", value: owner.email },
    { h: rh(14) },
  ];

  const addressLines = buildAddressLines(input);
  let rowTop = y;
  rows.forEach((row, index) => {
    const mid = rowTop + row.h / 2;
    if (index === 0) {
      doc.setFont("helvetica", "normal");
      text(doc, "Quote To :", center(COL.A, COL.B), mid, "center");
      doc.setFont("helvetica", "bold");
      text(doc, client.name, x(COL.C) + PAD, mid, "left");
    } else {
      doc.setFont("helvetica", "normal");
      const addressLine = addressLines[index - 1];
      if (addressLine) text(doc, addressLine, x(COL.C) + PAD, mid, "left");
    }
    if (row.label) {
      doc.setFont("helvetica", "bold");
      text(doc, row.label, labelRight, mid, "right");
      doc.setFont("helvetica", "normal");
      text(doc, row.value ?? "", valueLeft, mid, "left");
    }
    rowTop += row.h;
  });
  y = rowTop;

  // Attention block — the selected client contact.
  const contact = input.client.contacts[input.picIndex] ?? {};
  const contactRows: [string, string][] = [
    ["Attention", contact.name || "-"],
    ["Mobile", contact.mobile || "-"],
    ["Tel", contact.phone || "-"],
    ["Fax", "-"],
    ["E-mail", contact.email || "-"],
  ];
  const contactHeights = [rh(13.5), rh(14), rh(14), rh(14), rh(15)];
  contactRows.forEach(([label, value], index) => {
    const mid = y + contactHeights[index] / 2;
    doc.setFont("helvetica", "normal");
    text(doc, label, x(COL.J) - PAD, mid, "right");
    text(doc, ":", x(COL.J) + PAD, mid, "left");
    text(doc, value, valueLeft, mid, "left");
    y += contactHeights[index];
  });

  doc.setFont("helvetica", "italic");
  text(doc, input.validityNote, x(COL.A) + PAD, y + rh(33) / 2, "left");
  doc.setFont("helvetica", "normal");
  return y + rh(33);
}

/**
 * Four address lines, mirroring rows 3–6 of the template. Prefers the
 * per-document override (`commercial_documents.client_address`) over the
 * client record, then appends province/city and the country line.
 */
function buildAddressLines(input: QuotationPdfInput): string[] {
  const source = input.item.clientAddress ?? input.client.address ?? "";
  const region = [input.client.province, input.client.city]
    .filter(Boolean)
    .join(", ");
  const lines = [
    ...source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    region,
    "Indonesia",
  ].filter(Boolean);
  if (lines.length <= 4) return lines;
  return [...lines.slice(0, 3), lines.slice(3).join(", ")];
}

function drawTableHeader(doc: jsPDF, top: number): number {
  doc.setFillColor(HEADER_FILL, HEADER_FILL, HEADER_FILL);
  doc.rect(x(COL.A), top, CONTENT_W, ROW_HEAD, "F");

  doc.setDrawColor(0).setLineWidth(1);
  doc.line(x(COL.A), top, x(COL.END), top);
  doc.line(x(COL.A), top + ROW_HEAD, x(COL.END), top + ROW_HEAD);
  doc.line(x(COL.A), top, x(COL.A), top + ROW_HEAD);
  doc.line(x(COL.END), top, x(COL.END), top + ROW_HEAD);

  doc.setFont("helvetica", "bold").setFontSize(FONT_BODY).setTextColor(0);
  const mid = top + ROW_HEAD / 2;
  const headings: [string, number][] = [
    ["Line", center(COL.A, COL.B)],
    ["Part number / Descriptions", center(COL.B, COL.G)],
    ["Quantity", center(COL.G, COL.I)],
    ["Each", center(COL.I, COL.J)],
    ["Amount", center(COL.J, COL.END)],
  ];
  for (const [label, cx] of headings) {
    text(doc, label, cx, mid, "center");
    const w = doc.getTextWidth(label);
    doc.setLineWidth(0.4);
    doc.line(
      cx - w / 2,
      mid + FONT_BODY * 0.42,
      cx + w / 2,
      mid + FONT_BODY * 0.42,
    );
    doc.setLineWidth(1);
  }
  return top + ROW_HEAD;
}

function drawTotals(
  doc: jsPDF,
  input: QuotationPdfInput,
  items: QuotationLine[],
  top: number,
): number {
  const subTotal = items.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const ppn = subTotal * input.ppnRate;
  const rows: [string, string, boolean][] = [
    ["Sub Total :", formatRupiahFull(subTotal), true],
    [`PPN ${formatRate(input.ppnRate)} :`, formatRupiahFull(ppn), false],
    ["Quote Total:", formatRupiahFull(subTotal + ppn), true],
  ];

  const height = rh(21) + rows.length * ROW_TOTAL;
  let y = ensureSpace(doc, top, height) + rh(15);

  doc.setFont("helvetica", "normal").setFontSize(FONT_BODY).setTextColor(0);

  // Rule closing off the item table, spanning the label and value columns.
  const labelLeft =
    x(COL.K) -
    PAD -
    Math.max(...rows.map(([label]) => doc.getTextWidth(label)));
  doc.setDrawColor(0).setLineWidth(1.5);
  doc.line(labelLeft, y, x(COL.END) - PAD, y);
  y += rh(6);

  for (const [label, value, bold] of rows) {
    const mid = y + ROW_TOTAL / 2;
    doc.setFont("helvetica", "normal");
    text(doc, label, x(COL.K) - PAD, mid, "right");
    doc.setFont("helvetica", bold ? "bold" : "normal");
    text(doc, value, x(COL.END) - PAD, mid, "right");
    y += ROW_TOTAL;
  }
  return y;
}

function drawTerms(doc: jsPDF, input: QuotationPdfInput, top: number): number {
  const terms = input.terms.filter(Boolean);
  const closing = input.closingLines.filter(Boolean);
  const reference = input.item.quotationNumber
    ? `When placing orders, please refer to the DSM Quotation #${input.item.quotationNumber}`
    : "";
  const trailing = [reference, ...closing].filter(Boolean);

  const boxPad = rh(6);
  const height =
    rh(47) + boxPad * 2 + (terms.length + trailing.length) * ROW_TERM;
  const boxTop = ensureSpace(doc, top, height) + rh(47);
  let y = boxTop + boxPad;

  doc.setFont("helvetica", "normal").setFontSize(FONT_BODY).setTextColor(0);
  terms.forEach((term, index) => {
    const mid = y + ROW_TERM / 2;
    if (index === 0) text(doc, "Terms:", x(COL.C) - PAD, mid, "right");
    text(doc, term, x(COL.C) + PAD, mid, "left");
    y += ROW_TERM;
  });

  // Rows 41 → 42 in the sheet are adjacent; no separator here.
  for (const line of trailing) {
    text(doc, line, x(COL.B) + PAD, y + ROW_TERM / 2, "left");
    y += ROW_TERM;
  }

  // Frame the whole terms + contact block. Wide enough for the longest line so
  // custom terms can't spill outside the border.
  const rightEdge = Math.max(
    x(COL.G),
    x(COL.C) + PAD + Math.max(0, ...terms.map((t) => doc.getTextWidth(t))),
    x(COL.B) + PAD + Math.max(0, ...trailing.map((t) => doc.getTextWidth(t))),
  );
  doc.setDrawColor(0).setLineWidth(1);
  doc.rect(
    x(COL.A),
    boxTop,
    rightEdge + boxPad - x(COL.A),
    y + boxPad - boxTop,
  );
  return y + boxPad;
}

function drawClosing(doc: jsPDF, input: QuotationPdfInput, top: number): void {
  // Sheet rows 46–54: two blank rows, then the thank-you and sign-off lines,
  // the signer's name on row 53 and the title on row 54. Rows 50–52 stay empty
  // — that is the space the signer writes into after printing, so no signature
  // image is drawn here.
  const height = rh(30) + rh(14) * 7;
  const blockTop = ensureSpace(doc, top, height) + rh(30);

  doc.setFont("helvetica", "normal").setFontSize(FONT_BODY).setTextColor(0);
  text(
    doc,
    "Thank you for choosing Duta Solusi Metalindo.",
    x(COL.I),
    blockTop + rh(14) / 2,
    "left",
  );
  text(doc, "Yours sincerely ,", x(COL.I), blockTop + rh(14) * 1.5, "left");

  const cx = center(COL.I, COL.END);
  const nameMid = blockTop + rh(70) + rh(14) / 2;
  text(doc, input.signerName, cx, nameMid, "center");
  const nameW = doc.getTextWidth(input.signerName);
  doc.setLineWidth(0.4);
  doc.line(
    cx - nameW / 2,
    nameMid + FONT_BODY * 0.42,
    cx + nameW / 2,
    nameMid + FONT_BODY * 0.42,
  );
  text(doc, input.signerTitle, cx, blockTop + rh(84) + rh(14) / 2, "center");
}

// --- Primitives -----------------------------------------------------------

function text(
  doc: jsPDF,
  value: string,
  atX: number,
  atY: number,
  align: "left" | "center" | "right",
) {
  if (!value) return;
  doc.text(value, atX, atY, { align, baseline: "middle" });
}

const center = (from: number, to: number) => x(from) + ((to - from) * U) / 2;

/**
 * Starts a new page when `height` will not fit, repeating the item table header
 * — the sheet sets Print_Titles to row 13, so it appears on every page.
 * Blocks taller than a full page are allowed to overflow rather than loop.
 */
function ensureSpace(doc: jsPDF, y: number, height: number): number {
  const pageCapacity = CONTENT_BOTTOM - MARGIN_Y - ROW_HEAD;
  if (y + Math.min(height, pageCapacity) <= CONTENT_BOTTOM) return y;
  doc.addPage();
  return drawTableHeader(doc, MARGIN_Y);
}

function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`;
}

/** "Wednesday, August 07, 2024" — the template's date format. */
function formatTemplateDate(isoDate: string | undefined): string {
  if (!isoDate) return "-";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

/**
 * `data` is whatever jsPDF's addImage accepts — an <img> in the browser, a
 * data URL elsewhere. `ratio` is height/width, so callers only pick a width.
 */
type LoadedImage = { data: HTMLImageElement | string; ratio: number };

const imageCache = new Map<string, Promise<LoadedImage | null>>();

/**
 * Loads a same-origin asset; a missing file — or a non-browser environment,
 * such as the offline layout check — degrades to a PDF without it rather than
 * failing the whole export.
 */
function loadImage(url: string): Promise<LoadedImage | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  const cached = imageCache.get(url);
  if (cached) return cached;
  const pending = new Promise<LoadedImage | null>((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ data: img, ratio: img.naturalHeight / img.naturalWidth });
    img.onerror = () => resolve(null);
    img.src = url;
  });
  imageCache.set(url, pending);
  return pending;
}
