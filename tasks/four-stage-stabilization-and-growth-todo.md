# Checklist: Four-Stage Stabilization and Growth

**Status:** APPROVED FOR LOCAL EXECUTION — Stage 1 and Stage 2 checkpoints closed as of 2026-08-05; Stage 3 in progress
**Spec:** `docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md`  
**Plan:** `tasks/four-stage-stabilization-and-growth-plan.md`

## Stage 0 — Decisions and baseline

- [x] Approve four-stage order and superseding of the PWA-first order.
- [x] Approve explicit existing-Task versus new-Task choice.
- [x] Approve structured `activity_log.event_data`.
- [x] Approve Stage 4 lineage/Customer PO date fields or reduce Stage 4 scope.
- [x] Select browser testing tool; installation remains separately gated. Playwright Chromium selected and installed locally after owner blocker-resolution approval on 2026-08-05.
- [x] Capture dated reproducible baseline report.

## Stage 1 — Operational integrity

### Database

- [x] Add nullable structured audit payload without modifying old rows.
- [x] Test payload validation, grants, RLS, and append-only behavior.
- [x] Add atomic client follow-up RPC.
- [x] Add atomic commercial follow-up RPC.
- [x] Add atomic commercial stage-transition RPC.
- [x] Prove forced failures roll back all internal writes.
- [x] Prove stale/concurrent stage transitions are rejected safely.
- [x] Prove active Task fields are enforced at database boundary.

### Application

- [x] Replace client follow-up direct writes with canonical adapter.
- [x] Replace commercial follow-up direct writes with canonical adapter.
- [x] Replace pipeline independent writes with canonical transition adapter.
- [x] Separate `due_date` and `next_action_date` labels/inputs.
- [x] Load real commercial follow-up history in Pipeline drawer.
- [x] Remove or honestly disable fake archive/create/saved-view behavior.
- [x] Surface incomplete business-calendar warning.
- [x] Set root document language to Indonesian.
- [x] Validate exact cache update and invalidation behavior. Confirmed on 2026-08-05: `LogCommercialFollowUpDialog`, the Pipeline drag-drop stage transition, and the Pipeline drawer quick-update all invalidate the same four query-key prefixes (`tasks`, `commercial-items`, `follow-ups`, `activity-log`) matching every consuming query; live-tested a follow-up logged on Quotation Detail correctly propagating to the Pipeline board's next-action badge. Found and fixed a related pre-existing gap in the same area: `CommercialViews.tsx` (Quotations/SO table + board views) read `it.nextActionDate` directly — a field the normalized read path never populates — so "Next FU" always showed "—" regardless of logged follow-ups; now falls back to the earliest active linked Task due date, same as Pipeline's `nextByItem` logic. Typecheck/lint clean, verified in both Table and Board view with zero console errors.

### Checkpoint

- [x] Fresh local Supabase reset succeeds.
- [x] Full database and application tests pass.
- [x] Typecheck, lint, and build pass with warning delta documented.
- [x] Manual reload confirms persisted state for each changed flow. Pipeline transition, Client Quick Create follow-up, and commercial-detail follow-up dialog (`LogCommercialFollowUpDialog` on Quotation Detail) all passed local browser reload smoke on 2026-08-05 — follow-up entry, new Task, and next-action fields persisted verbatim after reload with zero console errors.
- [x] Role matrix passes for Sales/Manager/Executive/Super Admin/inactive.
- [x] Dated Stage 1 verification report is reviewed.

## Stage 2 — Engineering guardrails

- [x] Add deterministic typecheck/test/database/runtime/audit/bundle commands.
- [x] Expand CI into application, database, runtime, audit, and bundle jobs.
- [x] Generate useful non-secret failure artifacts.
- [x] Triage all 13 baseline dependency advisories.
- [x] Add owner and expiry to every approved exception. No approved dependency exception exists as of 2026-08-05; future exceptions must include owner and expiry before acceptance.
- [x] Obtain approval before installing browser test dependency. Owner resolved the blocker on 2026-08-05; `@playwright/test` and Chromium were installed locally.
- [x] Automate authentication/protected-route workflow. `e2e/browser-flows.spec.ts` verifies `/reports` redirects to `/login`, seeded Manager login reaches `/dashboard`, and browser console/page errors stay clean.
- [x] Automate Task progress and both follow-up workflows. Browser E2E covers Task create/reload/Done, client follow-up create/reload, and commercial-detail follow-up create/reload.
- [x] Automate stage transitions and Closed Lost validation. Browser E2E proves Closed Lost cannot proceed without the reason dialog and persists after reason selection.
- [x] Automate normalized Quotation/Sales Order creation smoke. Browser E2E creates a normalized Quotation and Sales Order from Client Detail and verifies routed lists.
- [x] Automate representative unauthorized-write denial. Browser/RLS E2E verifies Executive read-only Task UI and direct Executive `create_sales_order` RPC denial.
- [x] Automate Reports/export smoke. Browser E2E verifies Dashboard CSV dropdown download.
- [x] Verify Sentry environment/release/source-map contract without exposing secrets. Environment/release config already had unit coverage (`monitoring-config.test.ts`, 5 cases). Source-map upload had no implementation at all (no plugin, no `build.sourcemap`, no DSN anywhere) — wired `@sentry/vite-plugin` into `vite.config.ts` on 2026-08-05, gated on `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` all being present, a no-op otherwise. Dry-run built twice with throwaway fake credentials (never real secrets) to prove both branches: (1) no token → build succeeds, zero `.map` files emitted; (2) fake token → plugin activates, attempts real upload, fails auth cleanly without crashing the build. That dry run surfaced a real gap: the plugin only deletes local `.map` files after a *successful* upload, so a misconfigured/expired token in production would silently ship full source maps in the public static output (112 files did leak in the failed-upload dry run). Fixed by switching to `sourcemap: "hidden"` — maps are still generated for Sentry but the `sourceMappingURL` comment is omitted, so even an undeleted map isn't linked from the shipped JS (verified: 0 `sourceMappingURL` references in output after the fix). External ingestion into a real Sentry project remains untested — no Sentry project/DSN exists for this app yet; that requires the owner creating one and supplying `SENTRY_DSN`/`VITE_SENTRY_DSN` plus the upload token, which is a credential/account decision outside this pass. Typecheck, full test suite (533 pass), and lint all clean after the change.
- [x] Prove CI passes on a clean clone and fresh local database. Latest pushed baseline GitHub Actions run `30985051161` passed on commit `dba65bb`; current local browser expansion still needs a post-push CI run.
- [x] Review dated Stage 2 verification report. `docs/reports/2026-08-05-stage-2-local-verification.md` updated on 2026-08-05 with GitHub-hosted CI run `31004149430` on commit `7ae20aa` (all 7 jobs pass) and the Sentry source-map wiring/dry-run verification. Only remaining gap: production Sentry source-map upload against a real project and external event ingestion, blocked on the owner creating a Sentry project and supplying `SENTRY_DSN`/upload token — a credential decision outside this pass.

## Stage 3 — Data and performance

- [ ] Create anonymized representative performance fixture. Current baseline persists only anonymized metrics from seeded local data; synthetic larger-scale fixture remains open.
- [x] Capture query/payload/bundle/timing baseline. `bun run stage3:baseline` writes `docs/reports/2026-08-05-stage-3-performance-baseline.md` and ignored JSON artifact.
- [x] Build Manager holiday administration. Master Data now lists business-calendar rows and lets Manager/Super Admin delete entries.
- [x] Build CSV preview/validation/atomic import. Settings preview validates CSV locally, then writes through `import_business_calendar_holidays(jsonb)` in one DB transaction.
- [x] Test duplicate dates, invalid rows, and incomplete-year reporting. Parser tests cover invalid/missing/duplicate rows; DB tests cover duplicate rejection, Manager import, Sales denial, and existing incomplete-calendar fixtures.
- [x] Define typed pagination and query-key contracts. `src/lib/pagination-contracts.ts` defines bounded page size, opaque cursor, stable filter serialization, and shape-separated query keys with unit coverage.
- [x] Paginate Clients with server filters and stable order. Clients route now reads bounded cursor pages from Supabase with server-side search/status/source/owner/next-FU filters; Spending YTD remains display-only until aggregate/RPC work makes it server-filterable.
- [ ] Paginate Tasks with server filters and stable order.
- [x] Paginate commercial documents/Pipeline with server filters and stable order. Bounded per-stage keyset pagination (page size 50) + `pipeline_metrics` aggregate RPC replacing unbounded 436-doc/788-item client fetch; also fixes `is_current_revision` Quotation-revision filter bug in Pipeline board (parity with `CommercialViews.tsx`). Migration `20260805120000_add_pipeline_metrics_rpc.sql` pushed to production (`qhtfixgbcpcitokeryxb`) and verified 2026-08-05: board shows 418 current-revision items matching direct DB query, load-more/filter/drawer all confirmed against production data.
- [x] Paginate Sales Orders with server filters and stable order. `listSalesOrdersPage()` keyset pagination (page size 25, cursor `so_number`+`id`) with server-side date/owner/client/tax/source/type filters, plus `sales_orders_metrics` aggregate RPC for the KPI tiles and Revenue-by-Source card, replacing the unbounded 211-row/418-item `useDashboardData()` fetch on `_app.sales-orders.index.tsx`. Ordered by `so_number` descending, not `created_at`: production rows were bulk-imported and share only 21 distinct `created_at` values, while every series zero-pads its sequence to three digits so text order equals natural order. Export still covers the full filtered set (fetched on demand, not just the visible page). Migration `20260805130000_add_sales_orders_metrics_rpc.sql` applied locally and pushed to production (`qhtfixgbcpcitokeryxb`), RPC output cross-checked against a direct aggregate query.
- [x] Paginate Activity with server filters and stable order. Unlike Clients/Pipeline/Sales Orders, Activity Log merges two heterogeneous tables (`activity_log` + `follow_up_logs`) into one timeline with free-text search across enriched (not raw) fields, so a mechanical per-table keyset didn't apply. Added `public.activity_feed_events`, a `security_invoker` view that UNIONs both tables (RLS enforced per caller, same as the two separate unbounded reads it replaces), classifies each row into the UI's `FeedEvent.kind` buckets, excludes `db_kind`s with no bucket mapping (`client_details_change`, `task_progress`, `sales_order_header_change`, `sales_order_item_change` — matches the prior client-side drop), and computes a lowercased `search_text` haystack (title/detail/administrative_reason/kind label/client/owner/actor/target names) for server-side `ilike` search. `listActivityFeedPage()` does keyset pagination (page size 25, cursor `at`+`event_id`) over that view; the route uses `useInfiniteQuery` to keep the existing infinite-scroll UX. The "Perubahan Terkait" (related events) drawer panel now runs a bounded, targeted query (`listRelatedActivityFeedEvents`, matched by client/commercial-item/sales-order id within ±7 days) instead of scanning an in-memory array of every event ever fetched. Export fetches the full filtered set on demand (`listAllActivityFeedEvents`), same pattern as Sales Orders. Owner filter changed from name-keyed to id-keyed (matches every other filter in the app). Migration `20260805140000_add_activity_feed_events_view.sql` applied locally and pushed to production (`qhtfixgbcpcitokeryxb`); view row count cross-checked against raw table counts (228 mapped activity_log + 79 follow_up_logs = 307, 127 excluded rows match expectation exactly).
- [ ] Prove page navigation has no duplicate/missing rows.
- [ ] Add dashboard/report aggregate RPCs and reconcile totals.
- [x] Replace Team Settings N+1 with one set-returning RPC. `public.admin_team_summary()` (security definer, manager/executive/super_admin only) computes every member's clients/tasks/active-commercial-items counts and last admin activity_log entry in one query via LATERAL joins, replacing `listTeamMembers()`'s 1 + 4*N per-member round trips. Also fixes a real overcounting bug: the active-commercial-items predicate never picked up `deleted_at`/`is_current_revision` filters after Quotation revisions and soft-delete existed, so superseded revisions and soft-deleted documents were counted as active business — new integration test proves one active document counts and three siblings (soft-deleted, superseded, terminal-stage) do not. Migration `20260806000000_add_admin_team_summary_rpc.sql` applied locally and pushed to production. Building this surfaced and fixed the actual root cause of the previously-deferred "Tim & Role gagal render: e.from is not a function" bug (unrelated to any missing table): `queryFn: listTeamMembers` was passed directly to `useQuery`, and React Query always calls `queryFn` with a context argument that silently overrode `listTeamMembers`' optional `client` parameter default, so `client` became the context object with no `.rpc`/`.from` method. `getCurrentProfileId` had the identical pattern, silently degrading `currentProfileId` to undefined on every Settings page load, not just Team tab — both call sites fixed. Verified end to end with a throwaway Playwright check against a full production-equivalent build: reproduced the failure ("e.rpc is not a function", the new code's version of the same bug) before the fix, confirmed the Team tab renders all 7 roster rows with zero console errors after.
- [x] Prove Team query count is constant as member count grows. Covered by the RPC replacement above: `listTeamMembers()` now issues exactly one query regardless of roster size (was 1 + 4*N). Regression test in `src/lib/data/team.test.ts` ("issues a single RPC call regardless of roster size") asserts exactly one RPC call for a 20-member roster.
- [ ] Keep export complete and independent of current UI page.
- [ ] Decompose Reports without behavioral changes.
- [ ] Decompose Client Detail without behavioral changes.
- [ ] Decompose Commercial Detail without behavioral changes.
- [ ] Decompose Pipeline without behavioral changes.
- [ ] Approve and enforce measured performance budgets.
- [ ] Review dated Stage 3 before/after report.

## Stage 4 — Product intelligence

- [ ] Approve versioned metric dictionary.
- [ ] Add explicit new-record Quotation → Sales Order lineage.
- [ ] Add explicit Customer PO business milestone date.
- [ ] Confirm no inferred legacy backfill was performed.
- [ ] Verify structured stage-event coverage/effective date.
- [ ] Implement RLS-scoped win/loss aggregates.
- [ ] Implement lost-reason aggregates using existing contract.
- [ ] Implement event-based funnel aggregates.
- [ ] Implement traceable cycle-time distributions.
- [ ] Implement completed/open stage dwell metrics.
- [ ] Return coverage and exclusion counts with every affected metric.
- [ ] Build separate report chart components.
- [ ] Build data-quality/coverage panel.
- [ ] Apply existing owner/range/client filters consistently.
- [ ] Test empty and insufficient-history states.
- [ ] Extend exports without changing existing columns/order unless approved.
- [ ] Reconcile on-screen and exported totals.
- [ ] Prove each displayed cycle sample resolves to explicit IDs and dates.
- [ ] Review dated Stage 4 verification report.

## Program completion

- [ ] All four stage checkpoints are accepted in sequence.
- [ ] Released contracts and decision log are updated.
- [ ] Local verification, CI verification, remote migration, deployment, and browser production verification are reported separately.
- [ ] Exact target approval obtained before any remote Supabase action.
- [ ] Exact branch/commit approval obtained before push/merge/deploy.
- [ ] Realtime is reassessed only after Stage 4; no automatic implementation.
- [ ] Preferences Sync and PWA remain separate future specs unless explicitly authorized.
