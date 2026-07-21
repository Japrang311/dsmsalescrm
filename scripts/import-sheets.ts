#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { requireLocalSupabaseUrl } from "../supabase/local-supabase-url";
import {
  APPROVED_SALES_ALIASES,
  buildClientNameLookup,
  buildNameLookup,
  classifyRow,
  deriveCounterSeeds,
  groupImportRows,
  type SheetTab,
} from "./import-sheets/classify";
import { parseSheetCsv } from "./import-sheets/parse";

const VALID_TABS: SheetTab[] = [
  "QUOTATION",
  "SO 2026",
  "NP 2026",
  "PROTY",
  "HARIFF",
];

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveTab(raw: string): SheetTab | null {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "HARIFF") return "HARIFF";
  return VALID_TABS.find((tab) => tab === raw.trim()) ?? null;
}

function usage(): never {
  console.error(`
Usage: bun scripts/import-sheets.ts --file <path> --tab <tab> [--year <YYYY>] [--dry-run]

  --file      CSV export for one source tab
  --tab       QUOTATION | SO 2026 | NP 2026 | PROTY | HARIFF
  --year      Year for month-only SO tabs (default: current year)
  --dry-run   Reconcile and report without writing documents or counters
  --review-log <path>  Optional JSONL destination for rejected rows
  --allow-remote  Skip the local-origin guard (owner-approved remote imports only)

Only the exact local Supabase origin on port 54321 is accepted unless
--allow-remote is passed.
`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = args.file;
  const tab = typeof args.tab === "string" ? resolveTab(args.tab) : null;
  const dryRun = Boolean(args["dry-run"]);
  const configuredReviewLog = args["review-log"];
  const year = args.year ? Number(args.year) : new Date().getFullYear();

  if (
    typeof file !== "string" ||
    !tab ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2099
  ) {
    usage();
  }

  const configuredUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuredUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  // Default: only the approved local origin is accepted. --allow-remote is an
  // explicit escape hatch for the owner-approved production import (2026-07-21).
  const targetUrl = args["allow-remote"]
    ? configuredUrl
    : requireLocalSupabaseUrl(configuredUrl);
  const supabase = createClient(targetUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rawRows = parseSheetCsv(tab, readFileSync(file, "utf8"));
  const [
    { data: clients, error: clientsError },
    { data: sales, error: salesError },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, owner_id"),
    supabase
      .from("profiles")
      .select("id, name")
      .in("role", ["sales", "manager"])
      .eq("account_status", "active"),
  ]);
  if (clientsError) throw clientsError;
  if (salesError) throw salesError;

  const clientsByName = buildClientNameLookup(clients ?? []);
  const salesByName = buildNameLookup(sales ?? []);
  for (const [alias, canonicalName] of Object.entries(APPROVED_SALES_ALIASES)) {
    const ownerId = salesByName.get(canonicalName.toLowerCase());
    if (ownerId) salesByName.set(alias.toLowerCase(), ownerId);
  }
  const clientOwnersByName = buildClientNameLookup(
    (clients ?? []).map((client) => ({
      id: client.owner_id,
      name: client.name,
    })),
  );
  const classified = rawRows.map((raw) =>
    classifyRow(tab, raw, year, clientsByName, salesByName, clientOwnersByName),
  );
  const result = groupImportRows(classified);
  const seeds = deriveCounterSeeds(classified);
  const itemCount = result.documents.reduce(
    (sum, document) => sum + document.items.length,
    0,
  );
  const paidTotal = result.documents.reduce((sum, document) => {
    if (document.header.kind === "sales_order") {
      return sum + (document.header.totalValue ?? 0);
    }
    return (
      sum +
      document.items.reduce(
        (itemSum, item) => itemSum + (item.lineTotal ?? 0),
        0,
      )
    );
  }, 0);
  const focCount = result.documents.filter(
    (document) =>
      document.header.kind === "sales_order" &&
      document.header.prototypeStatus === "FOC",
  ).length;
  const revisionGroups = new Set(
    result.documents.flatMap((document) =>
      document.header.kind === "commercial" &&
      document.header.quotationRevision > 0
        ? [document.header.quotationBaseNumber]
        : [],
    ),
  ).size;

  console.log(`Tab resolved: ${tab}`);
  console.log(`Source rows: ${rawRows.length}`);
  console.log(`Review rows: ${result.reviews.length}`);
  console.log(`Document headers: ${result.documents.length}`);
  console.log(`Items: ${itemCount}`);
  console.log(`Paid total: ${paidTotal}`);
  console.log(`FOC documents: ${focCount}`);
  console.log(`Quotation revision groups: ${revisionGroups}`);
  console.log(`Counter seeds: ${JSON.stringify(seeds)}`);

  if (result.reviews.length > 0 && !dryRun) {
    const reviewLogPath =
      typeof configuredReviewLog === "string"
        ? configuredReviewLog
        : `import-review-log-${tab
            .replace(/\s+/g, "-")
            .toLowerCase()}-${Date.now()}.jsonl`;
    writeFileSync(
      reviewLogPath,
      `${result.reviews.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );
    console.log(`Review log: ${reviewLogPath}`);
  }

  if (dryRun) {
    console.log("--dry-run: no documents, items, or counters written.");
    return;
  }
  if (result.documents.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  const { data, error } = await supabase.rpc(
    "admin_import_normalized_documents",
    {
      p_documents: result.documents,
      p_counter_seeds: seeds,
    },
  );
  if (error) throw error;
  console.log(`Imported transaction: ${JSON.stringify(data)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
