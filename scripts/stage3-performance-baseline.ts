import { execFileSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_LOCAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const supabaseUrl = process.env.SUPABASE_URL ?? DEFAULT_LOCAL_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  DEFAULT_LOCAL_SUPABASE_ANON_KEY;
const managerEmail =
  process.env.STAGE3_BASELINE_EMAIL ?? "adhitya@local.dsm.test";
const managerPassword =
  process.env.STAGE3_BASELINE_PASSWORD ?? "seed-local-only";
const iterations = Number(process.env.STAGE3_BASELINE_ITERATIONS ?? "5");

type QueryResult = {
  data: unknown;
  count?: number | null;
  error?: { message?: string } | null;
};

type QueryDefinition = {
  name: string;
  currentConsumer: string;
  risk: string;
  run: (client: SupabaseClient) => Promise<QueryResult>;
};

type QueryMeasurement = {
  name: string;
  currentConsumer: string;
  risk: string;
  rowCount: number;
  exactCount: number | null;
  nestedRowCount: number;
  payloadBytes: number;
  iterations: number;
  minMs: number;
  medianMs: number;
  maxMs: number;
};

type AssetRow = {
  path: string;
  bytes: number;
};

type BundleSummary = {
  jsFiles: number;
  cssFiles: number;
  serverMjsFiles: number;
  jsBytes: number;
  cssBytes: number;
  serverMjsBytes: number;
  largestJsAsset?: AssetRow;
  largestServerFile?: AssetRow;
};

function assertLoopback(url: string): void {
  const parsed = new URL(url);
  const isLoopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLoopback) {
    throw new Error(
      `Stage 3 baseline is local-only. Refusing to query non-loopback Supabase URL: ${parsed.origin}`,
    );
  }
}

function gitValue(args: string[], fallback: string): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

function payloadBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
}

function rowCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data == null ? 0 : 1;
}

function nestedRowCount(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  return data.reduce((sum, row) => {
    if (typeof row !== "object" || row === null) return sum;
    return (
      sum +
      Object.values(row).reduce(
        (inner, value) => inner + (Array.isArray(value) ? value.length : 0),
        0,
      )
    );
  }, 0);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function measureQuery(
  client: SupabaseClient,
  definition: QueryDefinition,
): Promise<QueryMeasurement> {
  const timings: number[] = [];
  let lastResult: QueryResult | undefined;

  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    const result = await definition.run(client);
    timings.push(performance.now() - startedAt);
    if (result.error) {
      throw new Error(
        `${definition.name} failed: ${result.error.message ?? "Unknown error"}`,
      );
    }
    lastResult = result;
  }

  const data = lastResult?.data ?? null;
  return {
    name: definition.name,
    currentConsumer: definition.currentConsumer,
    risk: definition.risk,
    rowCount: rowCount(data),
    exactCount: lastResult?.count ?? null,
    nestedRowCount: nestedRowCount(data),
    payloadBytes: payloadBytes(data),
    iterations,
    minMs: Number(Math.min(...timings).toFixed(2)),
    medianMs: Number(median(timings).toFixed(2)),
    maxMs: Number(Math.max(...timings).toFixed(2)),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(path);
      if (entry.isFile()) return [path];
      return [];
    }),
  );
  return nested.flat();
}

async function fileRows(root: string, suffix: string): Promise<AssetRow[]> {
  const files = await walkFiles(root).catch(() => []);
  const rows = await Promise.all(
    files
      .filter((file) => file.endsWith(suffix))
      .map(async (file) => ({
        path: relative(process.cwd(), file),
        bytes: (await stat(file)).size,
      })),
  );
  return rows.sort((a, b) => b.bytes - a.bytes);
}

async function bundleSummary(): Promise<BundleSummary | null> {
  const [jsAssets, cssAssets, serverFiles] = await Promise.all([
    fileRows(".vercel/output/static", ".js"),
    fileRows(".vercel/output/static", ".css"),
    fileRows(".vercel/output/functions", ".mjs"),
  ]);

  if (
    jsAssets.length === 0 &&
    cssAssets.length === 0 &&
    serverFiles.length === 0
  ) {
    return null;
  }

  return {
    jsFiles: jsAssets.length,
    cssFiles: cssAssets.length,
    serverMjsFiles: serverFiles.length,
    jsBytes: jsAssets.reduce((sum, row) => sum + row.bytes, 0),
    cssBytes: cssAssets.reduce((sum, row) => sum + row.bytes, 0),
    serverMjsBytes: serverFiles.reduce((sum, row) => sum + row.bytes, 0),
    largestJsAsset: jsAssets[0],
    largestServerFile: serverFiles[0],
  };
}

function markdownTable(rows: QueryMeasurement[]): string {
  const header =
    "| Query contract | Rows | Nested rows | Payload | Median | Max | Risk |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |";
  const body = rows
    .map(
      (row) =>
        `| ${row.name} | ${row.exactCount ?? row.rowCount} | ${row.nestedRowCount} | ${formatBytes(row.payloadBytes)} | ${row.medianMs} ms | ${row.maxMs} ms | ${row.risk} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

const queries: QueryDefinition[] = [
  {
    name: "clients_all",
    currentConsumer: "Clients, Pipeline, Dashboard/Reports selectors",
    risk: "Unbounded master-data list; pagination must preserve global search/filter/export semantics.",
    run: (client) => client.from("clients").select("*", { count: "exact" }),
  },
  {
    name: "tasks_all_plus_calendar",
    currentConsumer: "Tasks, Pipeline, Dashboard/Reports task metrics",
    risk: "Unbounded task list plus a separate holiday-table read for due-state derivation.",
    run: async (client) => {
      const [tasks, holidays] = await Promise.all([
        client.from("tasks").select("*", { count: "exact" }),
        client
          .from("business_calendar_holidays")
          .select("*", { count: "exact" }),
      ]);
      return {
        data: {
          tasks: tasks.data ?? [],
          business_calendar_holidays: holidays.data ?? [],
        },
        count: tasks.count,
        error: tasks.error ?? holidays.error,
      };
    },
  },
  {
    name: "commercial_documents_all_with_items",
    currentConsumer: "Pipeline, Quotations, Client Detail, Reports selectors",
    risk: "Unbounded nested header+items payload; primary Stage 3 pagination target.",
    run: (client) =>
      client
        .from("commercial_documents")
        .select("*, commercial_document_items(*)", { count: "exact" })
        .neq("type", "RFQ")
        .is("deleted_at", null),
  },
  {
    name: "sales_orders_all_with_items",
    currentConsumer: "Sales Orders, Client Detail, Dashboard/Reports selectors",
    risk: "Unbounded nested header+items payload; export must remain complete after UI pagination.",
    run: (client) =>
      client
        .from("sales_orders")
        .select("*, sales_order_items(*)", { count: "exact" })
        .is("deleted_at", null),
  },
  {
    name: "activity_log_all_ordered",
    currentConsumer: "Activity route, audit widgets, feed builders",
    risk: "Append-only table grows forever; must move to bounded cursor contract.",
    run: (client) =>
      client
        .from("activity_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false }),
  },
  {
    name: "profiles_sales_team",
    currentConsumer: "Owners, Pipeline, Settings, forms",
    risk: "Small today, but Team Settings N+1 work needs a constant-query RPC.",
    run: (client) =>
      client
        .from("profiles")
        .select("id, name, initials, email, role, account_status", {
          count: "exact",
        }),
  },
  {
    name: "targets_all",
    currentConsumer: "Dashboard/Reports target reconciliation",
    risk: "Small yearly grid today; must stay independent from paginated UI rows.",
    run: (client) => client.from("targets").select("*", { count: "exact" }),
  },
  {
    name: "task_control_loop_metrics_rpc",
    currentConsumer: "Dashboard/Reports aggregate task metrics",
    risk: "Good pattern for Stage 3 aggregate RPCs; keep as benchmark for replacing selector-side totals.",
    run: (client) => client.rpc("task_control_loop_metrics"),
  },
];

assertLoopback(supabaseUrl);

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const signIn = await client.auth.signInWithPassword({
  email: managerEmail,
  password: managerPassword,
});
if (signIn.error) {
  throw new Error(
    `Local seeded Manager sign-in failed: ${signIn.error.message}`,
  );
}

const measurements = [];
for (const query of queries) {
  measurements.push(await measureQuery(client, query));
}
const bundle = await bundleSummary();

const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Stage 3 local baseline; no row values persisted, only counts/bytes/timings.",
  git: {
    commit: gitValue(["rev-parse", "--short", "HEAD"], "unknown"),
    branch: gitValue(["branch", "--show-current"], "unknown"),
  },
  supabase: {
    url: new URL(supabaseUrl).origin,
    actorEmail: managerEmail,
  },
  iterations,
  bundle,
  measurements,
  nextStage3Targets: [
    "Define typed pagination/query-key contract before touching route UI.",
    "Move Clients, Tasks, Commercial Documents/Pipeline, Sales Orders, and Activity one route at a time.",
    "Keep exports and aggregate totals independent from current UI page.",
    "Use task_control_loop_metrics_rpc as the pattern for dashboard/report aggregate RPCs.",
  ],
};

await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/stage3-performance-baseline.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

const markdown = `# Stage 3 Performance Baseline

**Date:** 2026-08-05  
**Scope:** local-only Stage 3 baseline against seeded local Supabase. No remote Supabase action, deployment, or production verification was performed.

## Method

- Signed in with the seeded local Manager account.
- Built the app first, then scanned \`.vercel/output\` for bundle size.
- Ran each current unbounded read contract ${iterations} times.
- Persisted only counts, nested-row counts, serialized payload sizes, and timings.
- Did not persist client names, document numbers, notes, or row payloads in the report/artifact.

## Baseline table

${markdownTable(measurements)}

## Bundle snapshot

${
  bundle
    ? `- Client JS files: ${bundle.jsFiles} (${formatBytes(bundle.jsBytes)} total).
- CSS files: ${bundle.cssFiles} (${formatBytes(bundle.cssBytes)} total).
- Server .mjs files: ${bundle.serverMjsFiles} (${formatBytes(bundle.serverMjsBytes)} total).
- Largest client JS asset: ${bundle.largestJsAsset?.path ?? "n/a"} (${formatBytes(bundle.largestJsAsset?.bytes ?? 0)}).
- Largest server file: ${bundle.largestServerFile?.path ?? "n/a"} (${formatBytes(bundle.largestServerFile?.bytes ?? 0)}).`
    : "- Bundle output was not found; run `bun run build` before `bun run stage3:baseline`."
}

## Findings

- The riskiest contracts are the nested full-list payloads: \`commercial_documents_all_with_items\` and \`sales_orders_all_with_items\`.
- \`activity_log_all_ordered\` is structurally risky even when current row count is small because it is append-only.
- \`task_control_loop_metrics_rpc\` is the healthy aggregate pattern Stage 3 should copy for dashboard/report totals.
- Pagination must not become the export boundary; exports still need complete result sets or dedicated export RPCs.

## Next implementation order

1. Define typed pagination and query-key contracts.
2. Migrate one primary list route at a time.
3. Add aggregate RPCs and reconcile against current selectors.
4. Enforce performance budgets only after before/after numbers exist.
`;

await mkdir("docs/reports", { recursive: true });
await writeFile(
  "docs/reports/2026-08-05-stage-3-performance-baseline.md",
  markdown,
);

console.log(JSON.stringify(report, null, 2));
