# Stage 3 Performance Baseline

**Date:** 2026-08-05  
**Scope:** local-only Stage 3 baseline against seeded local Supabase. No remote Supabase action, deployment, or production verification was performed.

## Method

- Signed in with the seeded local Manager account.
- Built the app first, then scanned `.vercel/output` for bundle size.
- Ran each current unbounded read contract 5 times.
- Persisted only counts, nested-row counts, serialized payload sizes, and timings.
- Did not persist client names, document numbers, notes, or row payloads in the report/artifact.

## Baseline table

| Query contract                      | Rows | Nested rows |  Payload |   Median |      Max | Risk                                                                                           |
| ----------------------------------- | ---: | ----------: | -------: | -------: | -------: | ---------------------------------------------------------------------------------------------- |
| clients_all                         |   69 |           0 |  44.7 KB |  6.14 ms | 29.65 ms | Unbounded master-data list; pagination must preserve global search/filter/export semantics.    |
| tasks_all_plus_calendar             |   12 |           0 |   6.8 KB |  4.41 ms |   5.9 ms | Unbounded task list plus a separate holiday-table read for due-state derivation.               |
| commercial_documents_all_with_items |  126 |         246 | 163.9 KB | 10.93 ms | 16.64 ms | Unbounded nested header+items payload; primary Stage 3 pagination target.                      |
| sales_orders_all_with_items         |   74 |         146 |  78.0 KB |  9.55 ms | 49.97 ms | Unbounded nested header+items payload; export must remain complete after UI pagination.        |
| activity_log_all_ordered            |   20 |           0 |  11.8 KB |  5.18 ms |  5.79 ms | Append-only table grows forever; must move to bounded cursor contract.                         |
| profiles_sales_team                 |    7 |           0 |   1.1 KB |  4.34 ms |  4.93 ms | Small today, but Team Settings N+1 work needs a constant-query RPC.                            |
| targets_all                         |   60 |           0 |  10.8 KB |  3.86 ms |  4.22 ms | Small yearly grid today; must stay independent from paginated UI rows.                         |
| task_control_loop_metrics_rpc       |    1 |           0 |    197 B |   3.8 ms |  7.16 ms | Good pattern for Stage 3 aggregate RPCs; keep as benchmark for replacing selector-side totals. |

## Bundle snapshot

- Client JS files: 110 (2.94 MB total).
- CSS files: 2 (105.1 KB total).
- Server .mjs files: 163 (7.87 MB total).
- Largest client JS asset: .vercel/output/static/assets/ComposedChart-BhmzGfvf.js (408.1 KB).
- Largest server file: .vercel/output/functions/\_\_server.func/\_libs/@tanstack/react-router+[...].mjs (645.1 KB).

## Findings

- The riskiest contracts are the nested full-list payloads: `commercial_documents_all_with_items` and `sales_orders_all_with_items`.
- `activity_log_all_ordered` is structurally risky even when current row count is small because it is append-only.
- `task_control_loop_metrics_rpc` is the healthy aggregate pattern Stage 3 should copy for dashboard/report totals.
- Pagination must not become the export boundary; exports still need complete result sets or dedicated export RPCs.

## Next implementation order

1. Define typed pagination and query-key contracts.
2. Migrate one primary list route at a time.
3. Add aggregate RPCs and reconcile against current selectors.
4. Enforce performance budgets only after before/after numbers exist.
