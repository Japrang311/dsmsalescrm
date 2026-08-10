#!/usr/bin/env bun
import { readFileSync } from "node:fs";

export type OwnerMismatchDocumentKind = "commercial_document" | "sales_order";

export type OwnerMismatchRow = {
  document_kind: OwnerMismatchDocumentKind;
  document_id: string;
  document_number: string;
  document_date: string;
  client_name: string;
  client_owner_id: string;
  client_owner_name: string;
  document_owner_id: string;
  document_owner_name: string;
  amount: number | string | null;
  status: string | null;
};

export type OwnerMismatchSummary = {
  total: number;
  commercialDocuments: number;
  salesOrders: number;
  byClientOwner: Record<string, number>;
  byDocumentOwner: Record<string, number>;
};

export const OWNER_MISMATCH_REVIEW_SQL = `
-- Read-only owner-mismatch review query.
-- Purpose: identify documents where the document owner differs from the
-- current client owner. This is NOT a correction script; every row needs
-- Product Owner judgment before any data change.
with commercial_totals as (
  select
    commercial_document_id,
    sum(coalesce(line_total, 0)) as amount
  from public.commercial_document_items
  group by commercial_document_id
), owner_mismatches as (
  select
    'commercial_document'::text as document_kind,
    d.id::text as document_id,
    coalesce(d.quotation_number, d.rfq_number, d.so_number, d.id::text) as document_number,
    d.document_date::text as document_date,
    c.name as client_name,
    c.owner_id::text as client_owner_id,
    client_owner.name as client_owner_name,
    d.owner_id::text as document_owner_id,
    document_owner.name as document_owner_name,
    coalesce(t.amount, 0) as amount,
    concat(d.type::text, ' / ', d.stage) as status
  from public.commercial_documents d
  join public.clients c on c.id = d.client_id
  join public.profiles client_owner on client_owner.id = c.owner_id
  join public.profiles document_owner on document_owner.id = d.owner_id
  left join commercial_totals t on t.commercial_document_id = d.id
  where d.deleted_at is null
    and d.owner_id <> c.owner_id

  union all

  select
    'sales_order'::text as document_kind,
    so.id::text as document_id,
    so.so_number as document_number,
    so.date::text as document_date,
    c.name as client_name,
    c.owner_id::text as client_owner_id,
    client_owner.name as client_owner_name,
    so.owner_id::text as document_owner_id,
    document_owner.name as document_owner_name,
    coalesce(so.total_value, 0) as amount,
    concat(so.type::text, ' / ', so.source::text) as status
  from public.sales_orders so
  join public.clients c on c.id = so.client_id
  join public.profiles client_owner on client_owner.id = c.owner_id
  join public.profiles document_owner on document_owner.id = so.owner_id
  where so.deleted_at is null
    and so.owner_id <> c.owner_id
)
select *
from owner_mismatches
order by document_kind, client_name, document_date, document_number;
`.trim();

function countBy(rows: OwnerMismatchRow[], field: keyof OwnerMismatchRow) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = String(row[field] ?? "Unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((left, right) => right[1] - left[1]),
  );
}

function numericAmount(value: OwnerMismatchRow["amount"]): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatRupiah(value: OwnerMismatchRow["amount"]): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(numericAmount(value));
}

function escapeCell(value: string | number | null): string {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
}

export function summarizeOwnerMismatches(
  rows: OwnerMismatchRow[],
): OwnerMismatchSummary {
  return {
    total: rows.length,
    commercialDocuments: rows.filter(
      (row) => row.document_kind === "commercial_document",
    ).length,
    salesOrders: rows.filter((row) => row.document_kind === "sales_order")
      .length,
    byClientOwner: countBy(rows, "client_owner_name"),
    byDocumentOwner: countBy(rows, "document_owner_name"),
  };
}

export function formatOwnerMismatchMarkdown(rows: OwnerMismatchRow[]): string {
  const summary = summarizeOwnerMismatches(rows);
  const lines = [
    "# Owner-Mismatch Review Backlog",
    "",
    "> Read-only review output. Jangan bulk-fix otomatis: setiap baris perlu keputusan apakah owner dokumen harus ikut owner client, atau mismatch memang historis/benar.",
    "",
    "## Summary",
    "",
    `- Total kandidat mismatch: ${summary.total}`,
    `- Commercial documents: ${summary.commercialDocuments}`,
    `- Sales orders: ${summary.salesOrders}`,
    "",
    "### By current client owner",
    "",
    ...Object.entries(summary.byClientOwner).map(
      ([owner, count]) => `- ${owner}: ${count}`,
    ),
    "",
    "### By document owner",
    "",
    ...Object.entries(summary.byDocumentOwner).map(
      ([owner, count]) => `- ${owner}: ${count}`,
    ),
    "",
    "## Review rows",
    "",
    "| Kind | Number | Date | Client | Client owner | Document owner | Amount | Status | Decision note |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeCell(row.document_kind)} | ${escapeCell(row.document_number)} | ${escapeCell(row.document_date)} | ${escapeCell(row.client_name)} | ${escapeCell(row.client_owner_name)} | ${escapeCell(row.document_owner_name)} | ${escapeCell(
        formatRupiah(row.amount),
      )} | ${escapeCell(row.status)} |  |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function usage(): never {
  console.error(`Usage:
  bun scripts/owner-mismatch-review.ts --print-sql
  bun scripts/owner-mismatch-review.ts --input owner-mismatches.json [--format md|json]

Workflow:
  1. Run the printed SQL in Supabase SQL editor or psql read-only context.
  2. Export the result as JSON.
  3. Feed that JSON back with --input to print a Product Owner review report.
`);
  process.exit(1);
}

function parseRows(path: string): OwnerMismatchRow[] {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Input JSON must be an array of owner-mismatch rows");
  }
  return parsed as OwnerMismatchRow[];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args["print-sql"]) {
    console.log(OWNER_MISMATCH_REVIEW_SQL);
    return;
  }

  const input = args.input;
  if (typeof input !== "string") usage();

  const rows = parseRows(input);
  const format = args.format === "json" ? "json" : "md";
  const output =
    format === "json"
      ? JSON.stringify(
          { summary: summarizeOwnerMismatches(rows), rows },
          null,
          2,
        )
      : formatOwnerMismatchMarkdown(rows);

  console.log(output);
}

if (import.meta.main) main();
