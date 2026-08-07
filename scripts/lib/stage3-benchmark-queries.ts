// Shared query definitions + measurement helper for
// scripts/stage3-scale-benchmark.ts (reporting) and
// scripts/stage3-check-budgets.ts (CI enforcement) — one list of
// contracts, two consumers, so they can't drift apart.

import { performance } from "node:perf_hooks";
import { Buffer } from "node:buffer";
import type { SupabaseClient } from "@supabase/supabase-js";

export function assertLoopback(url: string): void {
  const parsed = new URL(url);
  const isLoopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLoopback) {
    throw new Error(
      `Stage 3 benchmark tooling is local-only. Refusing non-loopback Supabase URL: ${parsed.origin}`,
    );
  }
}

export type QueryResult = {
  data: unknown;
  count?: number | null;
  error?: unknown;
};
export type QueryGroup = "unbounded (before)" | "bounded (after)";
export type QueryDefinition = {
  name: string;
  group: QueryGroup;
  run: (client: SupabaseClient) => Promise<QueryResult>;
};
export type QueryMeasurement = {
  name: string;
  group: QueryGroup;
  rowCount: number;
  exactCount: number | null;
  payloadBytes: number;
  medianMs: number;
  maxMs: number;
};

export function payloadBytes(data: unknown): number {
  return Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
}
export function rowCount(data: unknown): number {
  return Array.isArray(data) ? data.length : data == null ? 0 : 1;
}
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export async function measure(
  client: SupabaseClient,
  def: QueryDefinition,
  iterations: number,
): Promise<QueryMeasurement> {
  const timings: number[] = [];
  let last: QueryResult | undefined;
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    const result = await def.run(client);
    timings.push(performance.now() - start);
    if (result.error) {
      throw new Error(`${def.name} failed: ${JSON.stringify(result.error)}`);
    }
    last = result;
  }
  const data = last?.data ?? null;
  return {
    name: def.name,
    group: def.group,
    rowCount: rowCount(data),
    exactCount: last?.count ?? null,
    payloadBytes: payloadBytes(data),
    medianMs: Number(median(timings).toFixed(2)),
    maxMs: Number(Math.max(...timings).toFixed(2)),
  };
}

export const queries: QueryDefinition[] = [
  // --- Before: the original unbounded full-table reads ------------------
  {
    name: "clients_all (unbounded)",
    group: "unbounded (before)",
    run: (c) => c.from("clients").select("*", { count: "exact" }),
  },
  {
    name: "commercial_documents_all_with_items (unbounded)",
    group: "unbounded (before)",
    run: (c) =>
      c
        .from("commercial_documents")
        .select("*, commercial_document_items(*)", { count: "exact" })
        .neq("type", "RFQ")
        .is("deleted_at", null),
  },
  {
    name: "sales_orders_all_with_items (unbounded)",
    group: "unbounded (before)",
    run: (c) =>
      c
        .from("sales_orders")
        .select("*, sales_order_items(*)", { count: "exact" })
        .is("deleted_at", null),
  },
  {
    name: "tasks_all (unbounded)",
    group: "unbounded (before)",
    run: (c) => c.from("tasks").select("*", { count: "exact" }),
  },
  // --- After: the paginated/aggregate contracts that replaced them ------
  {
    name: "clients page 1 (pageSize 10)",
    group: "bounded (after)",
    run: (c) =>
      c
        .from("clients")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(11),
  },
  {
    name: "commercial_documents page 1 per stage (pageSize 50)",
    group: "bounded (after)",
    run: (c) =>
      c
        .from("commercial_documents")
        .select("*, commercial_document_items(*)", { count: "exact" })
        .eq("stage", "Quotes Sent")
        .is("deleted_at", null)
        .order("document_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(51),
  },
  {
    name: "sales_orders page 1 (pageSize 25)",
    group: "bounded (after)",
    run: (c) =>
      c
        .from("sales_orders")
        .select("*, sales_order_items(*)", { count: "exact" })
        .is("deleted_at", null)
        .order("so_number", { ascending: false })
        .order("id", { ascending: false })
        .limit(26),
  },
  {
    name: "sales_orders_metrics RPC",
    group: "bounded (after)",
    run: (c) => c.rpc("sales_orders_metrics", {}),
  },
  {
    name: "pipeline_metrics RPC",
    group: "bounded (after)",
    run: (c) => c.rpc("pipeline_metrics", {}),
  },
  {
    name: "sales_task_client_metrics RPC",
    group: "bounded (after)",
    run: (c) => c.rpc("sales_task_client_metrics", {}),
  },
  {
    name: "sales_orders_monthly_trend RPC",
    group: "bounded (after)",
    run: (c) => c.rpc("sales_orders_monthly_trend", {}),
  },
  {
    name: "sales_orders_owner_ytd RPC",
    group: "bounded (after)",
    run: (c) => c.rpc("sales_orders_owner_ytd", {}),
  },
  {
    name: "sales_orders_top_customers RPC (limit 5)",
    group: "bounded (after)",
    run: (c) => c.rpc("sales_orders_top_customers", { p_limit: 5 }),
  },
];
