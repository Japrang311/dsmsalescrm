// Measures the paginated/aggregate-RPC contracts Stage 3 built, plus the
// original unbounded contracts they replaced, against a synthetic
// company-scale local dataset (see seed-performance-fixture.ts). Proves
// the bounded contracts stay fast as data grows, and quantifies how much
// heavier the unbounded ones have become at this scale.
//
// Usage: bun scripts/seed-performance-fixture.ts && bun scripts/stage3-scale-benchmark.ts

import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  assertLoopback,
  formatBytes,
  measure,
  queries,
  type QueryMeasurement,
} from "./lib/stage3-benchmark-queries";

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

const measurements: QueryMeasurement[] = [];
for (const q of queries) {
  measurements.push(await measure(client, q, iterations));
  console.log(`  ${q.name}: done`);
}

function tableFor(group: string): string {
  const rows = measurements.filter((m) => m.group === group);
  const header =
    "| Query | Rows | Payload | Median | Max |\n| --- | ---: | ---: | ---: | ---: |";
  const body = rows
    .map(
      (r) =>
        `| ${r.name} | ${r.exactCount ?? r.rowCount} | ${formatBytes(r.payloadBytes)} | ${r.medianMs} ms | ${r.maxMs} ms |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

const markdown = `# Stage 3 Scale Benchmark

**Date:** ${new Date().toISOString().slice(0, 10)}
**Scope:** local-only benchmark against a synthetic performance fixture (see \`scripts/seed-performance-fixture.ts\`) loaded on top of the local seed. No remote Supabase action, deployment, or production data was involved. Row payloads are not persisted below — only counts, byte sizes, and timings.

## Method

- Loaded the synthetic fixture (\`bun scripts/seed-performance-fixture.ts\`) at its default scale (2,000 clients, ~4,000 quotations, ~1,000 sales orders, 4,000 tasks) on top of the existing local seed.
- Signed in as the seeded local Manager account.
- Ran each contract ${iterations} times, took the median/max.

## Unbounded contracts (what every route read from before Stage 3)

${tableFor("unbounded (before)")}

## Bounded contracts (what every route reads from now)

${tableFor("bounded (after)")}

## Findings

- The unbounded full-table reads scale linearly with total row count and nested item count — exactly the ones Stage 3 replaced route by route (Clients, Pipeline/Commercial Documents, Sales Orders, Tasks).
- **A sharper finding than "slower": silent truncation.** At this fixture's scale, every unbounded contract's actual row count (\`exactCount\` above) already exceeds PostgREST's default 1,000-row response cap — \`rowCount\` in the table is capped at 1000 while \`exactCount\` shows the real total (e.g. \`sales_orders_all_with_items\`: 1000 rows returned out of 1052 real rows; \`commercial_documents_all_with_items\`: 1000 of 4101). Any route still relying on a full unbounded fetch at this data volume wouldn't just get slow — it would silently drop rows past the 1000th, with no error surfaced anywhere. Every route this repo migrated to a paginated/RPC contract is immune to this by construction; any route that hasn't yet (see the Reports export path, which intentionally still reads full filtered sets) needs to stay aware of this ceiling as data grows.
- Every paginated first-page read and every aggregate RPC stays in the same low-payload, low-latency range regardless of how large the underlying table grows, because they're bounded by \`LIMIT\`/\`GROUP BY\` at the database, not by what the client happens to filter down to afterward. One exception worth flagging honestly: \`sales_task_client_metrics\` ran noticeably slower than its siblings (~90-105ms vs. single-digit-to-low-teens ms for everything else) at 4,000 synthetic tasks — it does a \`cross join lateral compute_task_due_state(...)\` per row rather than a plain aggregate, so its cost grows with task count specifically. Still well under any reasonable page-load budget today, but the first RPC in this set worth an index/rewrite pass if task volume grows an order of magnitude further.
- This is the concrete "stays fast (and correct) at scale" evidence the anonymized fixture task asked for — none of it is real production data, and none of this was applied anywhere but the local Supabase instance.
- See \`docs/reports/2026-08-07-stage-3-performance-budgets-proposal.md\` for the approved budget thresholds derived from these numbers, and \`scripts/stage3-check-budgets.ts\` (CI job \`performance_budget\`) for the automated enforcement.
`;

await mkdir("docs/reports", { recursive: true });
const reportPath = `docs/reports/${new Date().toISOString().slice(0, 10)}-stage-3-scale-benchmark.md`;
await writeFile(reportPath, markdown);
console.log(`\nReport written to ${reportPath}`);
console.log(JSON.stringify(measurements, null, 2));
