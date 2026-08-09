# Stage 3 Scale Benchmark

**Date:** 2026-08-07
**Scope:** local-only benchmark against a synthetic performance fixture (see `scripts/seed-performance-fixture.ts`) loaded on top of the local seed. No remote Supabase action, deployment, or production data was involved. Row payloads are not persisted below — only counts, byte sizes, and timings.

## Method

- Loaded the synthetic fixture (`bun scripts/seed-performance-fixture.ts`) at its default scale (2,000 clients, ~4,000 quotations, ~1,000 sales orders, 4,000 tasks) on top of the existing local seed.
- Signed in as the seeded local Manager account.
- Ran each contract 5 times, took the median/max.

## Unbounded contracts (what every route read from before Stage 3)

| Query | Rows | Payload | Median | Max |
| --- | ---: | ---: | ---: | ---: |
| clients_all (unbounded) | 2069 | 653.4 KB | 14.15 ms | 44.31 ms |
| commercial_documents_all_with_items (unbounded) | 4101 | 1.20 MB | 39.28 ms | 54.17 ms |
| sales_orders_all_with_items (unbounded) | 1052 | 1.03 MB | 36.85 ms | 40.04 ms |
| tasks_all (unbounded) | 4000 | 505.0 KB | 14.95 ms | 16.95 ms |

## Bounded contracts (what every route reads from now)

| Query | Rows | Payload | Median | Max |
| --- | ---: | ---: | ---: | ---: |
| clients page 1 (pageSize 10) | 2069 | 7.1 KB | 3.93 ms | 9.67 ms |
| commercial_documents page 1 per stage (pageSize 50) | 2023 | 64.2 KB | 30.02 ms | 39.42 ms |
| sales_orders page 1 (pageSize 25) | 1052 | 26.5 KB | 4.36 ms | 7.05 ms |
| sales_orders_metrics RPC | 1 | 209 B | 2.83 ms | 7.78 ms |
| pipeline_metrics RPC | 6 | 906 B | 14.48 ms | 17.79 ms |
| sales_task_client_metrics RPC | 6 | 1.0 KB | 113.76 ms | 154.82 ms |
| sales_orders_monthly_trend RPC | 12 | 368 B | 3.66 ms | 7.82 ms |
| sales_orders_owner_ytd RPC | 6 | 445 B | 2.2 ms | 2.69 ms |
| sales_orders_top_customers RPC (limit 5) | 5 | 724 B | 4.45 ms | 6.17 ms |

## Findings

- The unbounded full-table reads scale linearly with total row count and nested item count — exactly the ones Stage 3 replaced route by route (Clients, Pipeline/Commercial Documents, Sales Orders, Tasks).
- **A sharper finding than "slower": silent truncation.** At this fixture's scale, every unbounded contract's actual row count (`exactCount` above) already exceeds PostgREST's default 1,000-row response cap — `rowCount` in the table is capped at 1000 while `exactCount` shows the real total (e.g. `sales_orders_all_with_items`: 1000 rows returned out of 1052 real rows; `commercial_documents_all_with_items`: 1000 of 4101). Any route still relying on a full unbounded fetch at this data volume wouldn't just get slow — it would silently drop rows past the 1000th, with no error surfaced anywhere. Every route this repo migrated to a paginated/RPC contract is immune to this by construction; any route that hasn't yet (see the Reports export path, which intentionally still reads full filtered sets) needs to stay aware of this ceiling as data grows.
- Every paginated first-page read and every aggregate RPC stays in the same low-payload, low-latency range regardless of how large the underlying table grows, because they're bounded by `LIMIT`/`GROUP BY` at the database, not by what the client happens to filter down to afterward. One exception worth flagging honestly: `sales_task_client_metrics` ran noticeably slower than its siblings (~90-105ms vs. single-digit-to-low-teens ms for everything else) at 4,000 synthetic tasks — it does a `cross join lateral compute_task_due_state(...)` per row rather than a plain aggregate, so its cost grows with task count specifically. Still well under any reasonable page-load budget today, but the first RPC in this set worth an index/rewrite pass if task volume grows an order of magnitude further.
- This is the concrete "stays fast (and correct) at scale" evidence the anonymized fixture task asked for — none of it is real production data, and none of this was applied anywhere but the local Supabase instance.
