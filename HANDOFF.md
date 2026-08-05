# Handoff — DSM Sales Web App V2

Context dump for continuing this work in another tool (Codex). Written 2026-07-18; Phase 11/12 status refreshed 2026-07-19; Phase 11 import-review reconciliation session added 2026-07-19; post-import UX/bugfix session added 2026-07-20; second 2026-07-20 session (pipeline permissions/FK bugfixes) added 2026-07-20; Client Detail/Client List real-data wiring session added 2026-07-21; remote-migration-push + data-restoration session added 2026-07-21; browser-verification + spending_ytd fix + SO edit audit trail session added 2026-07-21; unused-code cleanup + client database (company info/contacts) feature session added 2026-07-22; contact position + Client Detail product/description fixes + commercial item product-name migration reconciliation added 2026-07-22; dynamic per-month sales target UI/calculation update added 2026-07-22; soft-delete implementation, remote Supabase apply, and main/live push closeout added 2026-07-24; RFQ retirement and documentation refresh added 2026-07-25; Sales Task Control Loop spec approval and Phase 1-2 implementation (Tasks 46-52) added 2026-07-27; unified progress timeline Task 53/8 and Manager Team Exceptions Task 54/9 added 2026-07-27; visual design audit Phase 1 (critical usability/responsiveness fixes) added 2026-07-27; Executive exception detail and aggregate-only Task metrics Task 55/10 added 2026-07-27; Dashboard/TopBar consumer migration Task 56/11 added 2026-07-27; Reports consumer migration Task 57/12 added 2026-07-27; export migration Task 58/13 added 2026-07-27; Pipeline/Client Detail/commercial follow-up migration Task 59/14 added 2026-07-27; ownership/account lifecycle migration Task 60/15 added 2026-07-27; production deployment audit + RLS/security-advisor review + two security-hardening migrations added 2026-07-30; Stage 1/Stage 2 checklist closeout + Sentry source-map wiring + commercial Next FU fix (commit `7ae20aa`, pushed, CI green) + Stage 3 Pipeline-pagination brainstorming in progress added 2026-08-05.

## HANDOFF — Stage 3 Sales Orders pagination DONE and pushed (2026-08-05, read this first)

Latest state, ahead of everything below. Stage 3 checklist item "Paginate Sales Orders with
server filters and stable order" is implemented, verified locally, and its migration is applied
to production.

- `src/lib/data/sales-orders.ts` — `listSalesOrdersPage()`: keyset pagination, page size 25,
  cursor `so_number`+`id`, server-side filters for date range / owner / client / tax type /
  source / SO type / deleted mode.
- **Ordering decision:** sorts by `so_number` descending, *not* `created_at`. Production has 209
  active Sales Orders but only 21 distinct `created_at` values (bulk Sheet import), so a
  created_at sort is effectively arbitrary. Every series zero-pads its sequence to three digits
  (`DSM-26SO001` … `DSM-26SO160`, `DSM-26NP017`, `DSM-26PROTY008`), so plain text ordering equals
  the natural-number order `compareSalesOrdersByNewestNumber` produces, within a series and year.
  Series group separately (NP / PROTY / SO), which is acceptable. Regression test:
  "pages by SO number descending regardless of insert order" in `sales-orders.test.ts`.
- `src/lib/data/sales-orders-metrics.ts` + migration
  `20260805130000_add_sales_orders_metrics_rpc.sql` — RPC `sales_orders_metrics()` (security
  definer, same filters) returning PPN / Non-PPN / per-source totals and FOC count, replacing
  client-side summation over the full list. Follows the `pipeline_metrics` precedent.
- `src/routes/_app.sales-orders.index.tsx` — dropped `useDashboardData()` (it fetched all sales
  orders, tasks, commercial items and targets just for this page); now uses targeted
  clients/owners/sales-team queries with the same query keys plus the paged + aggregate queries.
  Added a prev/next pagination footer. Restore-from-deleted now invalidates the `["sales-orders"]`
  prefix so every cache shape ("all", "page", "aggregate") refreshes.
- **Export deliberately still covers the full filtered set**, not just the visible page: it
  fetches all orders on demand inside `handleExport` and re-applies `filterSalesOrders`. Do not
  "optimize" this into exporting `rows`.
- Verification: typecheck clean, lint 0 errors, `bun run test` 541 pass / 0 fail, build succeeds.
  Browser-checked on the local dev server as Sales (Nur Iman): 21 SO, correct descending SO
  numbers, KPI tiles and Revenue-by-Source populated from the RPC, footer reads "1–21 dari 21",
  console clean. **Not yet click-through-verified across more than one page** — the local Sales
  account only sees 21 of the 72 seeded orders, and verifying a second page needs a Manager
  login, which the owner has to perform.
- Migration `20260805130000_add_sales_orders_metrics_rpc.sql` pushed to production
  `qhtfixgbcpcitokeryxb` with owner approval and confirmed in sync (`migration list --linked`).
  Production RPC output cross-checked against a direct aggregate query over the same range —
  identical (PPN 24.911.768.992 / Non-PPN 149.258.000 / 4 FOC / 209 SO for 2026). The
  `supabase db push` run printed unrelated `pgdelta-target-ca.crt` ENOENT noise from the CLI's
  edge runtime; the migration still applied.
- Committed as `7d036ba` and pushed to `main`. GitHub Actions run `31020505720`: all 7 jobs pass.
- Note on the *previous* commit `7a71cd3` (Pipeline pagination): its CI run `31011022207`
  failed the "Production migration parity" job, because the Pipeline migration was pushed to
  Supabase *after* the git push. Every other job passed and no code regression was involved —
  the gate was correctly reporting a real window where production lacked the RPC. Push the
  migration to Supabase **before** pushing the commit, which is the order used for `7d036ba`.

## HANDOFF — Stage 3 Pipeline pagination DONE, moving to Tasks pagination (2026-08-05)

Session run from Claude Code. Continues `tasks/four-stage-stabilization-and-growth-plan.md` /
`tasks/four-stage-stabilization-and-growth-todo.md` (the four-stage stabilization program —
not the Phase 1-15 Task Control Loop work described lower in this file). Picking this up in
another tool: **do not re-ask the questions already answered below**, they were asked and
answered explicitly by the owner this session.

**Pipeline pagination (commercial_documents/Pipeline checklist item) is DONE, migration pushed
to production, and manually re-verified against live production data — do not redo, see the
"Stage 3 Pipeline pagination — COMPLETED" section immediately below.** The design-decisions
section right after it is now historical context only. Current active work is the next
sequential Stage 3 checklist item: **Paginate Tasks with server filters and stable order**
(not yet started — no code changed for it in this repo yet).

### Owner reprioritization (2026-08-05, after Pipeline pagination shipped)

Same reasoning as the earlier Pipeline-before-Tasks reprioritization: Tasks is only 98 rows in
production (checked 2026-08-05), no real performance pressure, and its pagination design is
non-trivial (5 due-state buckets computed from `due_date` + business calendar + workflow status,
not a simple SQL filter — plus Manager My-Tasks/Team-Exceptions and Executive aggregate-only
modes). **Owner chose to skip Tasks for now and do Sales Orders next** (211 rows + 418 nested
items — the other heavy table flagged in the Stage 3 baseline report alongside
commercial_documents). Tasks pagination remains not started; revisit after Sales Orders.

### Stage 3 Pipeline pagination — COMPLETED (2026-08-05)

- Migration `20260805120000_add_pipeline_metrics_rpc.sql` (RPC `pipeline_metrics()`, security
  definer, excludes non-`is_current_revision` Quotations and soft-deleted docs) pushed to
  production project `qhtfixgbcpcitokeryxb` via `supabase db push --linked` and confirmed
  in sync (`supabase migration list --linked` shows local/remote match).
- `src/lib/data/commercial-documents.ts` — `listCommercialDocumentsPage()` bounded per-stage
  keyset pagination (page size 50, cursor `updated_at`+`id`), also filters non-current
  Quotation revisions (fixes the bug flagged in decision 4 below — chosen option: fix in same
  pass, confirmed by owner).
- `src/lib/data/pipeline-metrics.ts` — RPC wrapper for header/analytics aggregates.
- `_app.pipeline.tsx` — 6 parallel per-stage `useQueries`, "Muat lebih banyak" per column,
  drag-and-drop restricted to loaded cards only (Option A trade-off from decision below).
- `PipelineAnalytics.tsx` — consumes RPC `metrics` instead of client-side compute over the
  full unbounded list.
- New tests: `src/lib/data/pipeline-metrics.test.ts`, `src/lib/data/commercial-documents-page.test.ts`.
- Full verification: typecheck clean, lint 0 errors, `bun run test` 537 pass/0 fail, build
  succeeds.
- **Manual production re-verification (2026-08-05, separate session after deploy)**: logged in
  as Super Admin on `https://dsmsalescrm.vercel.app/pipeline` — board shows 418 items /
  Rp108,17 milyar, matches a direct read-only DB query filtering
  `is_current_revision = true` (12 non-current Quotation revisions correctly excluded, e.g.
  `DSM-26QUO-0420`). Load-more on Closed Won/Closed Lost columns (>50 items each) confirmed
  loading more cards. Owner filter (`Nur Iman`) confirmed server-side re-filter of both board
  and summary stats. Card drawer confirmed showing quick-update fields, linked
  Quotations/Sales Orders, and full stage/revision history. Created a persistent local test
  account (`qa.pipeline.test@dutasolusimetalindo.com`, role Sales, owner said leave it in
  production for reuse — do not delete without being asked) to confirm role-based Pipeline
  access has no console errors. Filter-by-status and drag-and-drop were not re-tested live
  (judged low-risk: same server-side mechanism as the already-tested owner filter, and
  drag-and-drop already has automated test coverage).
- **Found a pre-existing, unrelated bug while verifying**: Settings → Tim & Role tab fails to
  render the member list (`e.from is not a function`, `src/routes/_app.settings.tsx`),
  reproduced twice. **Owner decision: defer this fix until every Stage 1-4 checklist item is
  all-green — do not fix it now.**

### What's done and pushed (commit `7ae20aa` on `main`, CI green)

- **Stage 1 and Stage 2 of the checklist are fully closed.** Every checkbox in
  `tasks/four-stage-stabilization-and-growth-todo.md` under those two headings is checked, each
  with a dated note on how it was verified. Do not reopen these without new information.
- Fixed a real bug found while validating cache invalidation: `CommercialViews.tsx` (used by the
  Quotations index Table+Board views) read `item.nextActionDate` directly — a field the
  normalized read path never populates — so "Next FU" always showed "—". Now falls back to the
  earliest active linked Task due date, same pattern as Pipeline's `nextByItem`.
- Wired Sentry source-map upload (`@sentry/vite-plugin` in `vite.config.ts`), gated on
  `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` all being present (no-op otherwise). Uses
  `sourcemap: "hidden"` after a dry run with throwaway fake credentials proved the plugin only
  deletes local `.map` files after a *successful* upload — a failed/misconfigured token would
  otherwise leak maps into the public static output. No Sentry project/DSN exists for this app
  yet; production source-map upload and external event ingestion remain genuinely unverified
  until the owner creates a Sentry project and supplies real credentials (a credential/account
  decision, not an engineering task).
- GitHub Actions run `31004149430` on `7ae20aa`: all 7 jobs pass. (First attempt had one
  transient Docker port-bind flake in "Application and RLS tests", unrelated to the change;
  re-running just that job passed clean.)
- Both dated Stage 1 and Stage 2 verification reports
  (`docs/reports/2026-08-05-stage-2-local-verification.md`) are updated to match.

### What's in progress — Stage 3 commercial_documents/Pipeline pagination design

Currently mid-`superpowers:brainstorming` for the checklist item "Paginate commercial
documents/Pipeline with server filters and stable order". **No design doc has been written yet**
(nothing under `docs/superpowers/specs/` for this), **no code has been changed for this item**.
Resume by continuing the brainstorming skill's clarifying-questions loop, or re-run it fresh —
either way, treat the decisions below as already made so you don't re-ask them:

1. **Real production row counts** (checked live against Supabase project `qhtfixgbcpcitokeryxb`
   via the Supabase MCP `execute_sql` tool, 2026-08-05): `tasks` 98, `commercial_documents` 436
   (+788 nested items), `sales_orders` 211 (+418 nested items), `activity_log` 354, `clients` 75.
   The local seed baseline in `docs/reports/2026-08-05-stage-3-performance-baseline.md` only had
   12 tasks / 126 commercial documents — much smaller than real production. Re-check row counts
   again if much time has passed; they'll have grown.
2. **Owner decision:** the checklist's written order (Tasks → commercial/Pipeline → Sales Orders
   → Activity) is **not** risk-ordered. Given real row counts above, `commercial_documents` and
   `sales_orders` are the heaviest (nested items, largest payload) and were already flagged
   "primary Stage 3 pagination target" / highest risk in the Stage 3 baseline report. Tasks at 98
   rows is not an urgent performance problem. **Owner chose to reprioritize: do
   commercial_documents/Pipeline before Tasks**, following the baseline report's risk ranking
   rather than the checklist's written order. Update the checklist ordering note if you act on
   this.
3. **Owner decision:** `commercial_documents` is read by two structurally different UIs sharing
   one data layer (`src/lib/data/commercial-items.ts` → `commercial-documents.ts`):
   - `src/routes/_app.pipeline.tsx` (812 lines) — Kanban board grouped by stage, drag-and-drop
     cards between stage columns via the `transitionCommercialStage` RPC. This is the
     daily-driver sales UI.
   - `src/components/commercial/CommercialViews.tsx` (649 lines), used by
     `_app.quotations.index.tsx` — has a Table mode (flat, no drag-drop, closest analog to the
     already-paginated Clients route) and a Board mode (kanban-style but read-only, no
     drag-drop).
   **Owner chose: focus on Pipeline (the kanban drag-drop board) first**, Quotations
   Table/Board later.
4. **Open, unanswered question — was asked, owner said "checkpoint, continue with another
   agent" before answering:** Pipeline (`_app.pipeline.tsx`) does **not** filter
   `isCurrentRevision !== false` for Quotations the way `CommercialViews.tsx`'s `scoped` memo
   does (see `CommercialViews.tsx` around the `scoped` useMemo). This means superseded Quotation
   revisions currently still show as separate cards on the Pipeline board and count toward the
   header summary values (Total Pipeline / Open Value / stage percentages) — a real data-
   correctness bug, independent of pagination. **Ask the owner: fix this in the same pass as the
   pagination work (recommended — the new server query needs a revision-filter decision anyway),
   or log it separately and keep pagination behavior-identical to today including this bug?**

### Design considerations already surfaced (not yet decided/presented as options)

- **Summary stats problem:** `PipelineAnalytics` and the header cards (Total Pipeline, Open
  Value, Won Value, Win Rate, per-stage %) are currently computed client-side from the *full*
  in-memory `items` array (all non-deleted commercial_documents, fetched via
  `["commercial-items", "all"]` / `listCommercialItems()`). If Pipeline moves to bounded
  per-stage loading, these numbers can no longer be computed from what's rendered — they need a
  server aggregate RPC (count/sum per stage, respecting the same owner/status/nextWindow
  filters). The Stage 3 baseline report explicitly calls out
  `task_control_loop_metrics_rpc` as "the healthy aggregate pattern Stage 3 should copy" — follow
  that precedent.
- **Kanban ≠ flat list:** the established `src/lib/pagination-contracts.ts` keyset-cursor pattern
  (used mechanically for Clients: `src/lib/data/clients.ts:listClientRowsPage` +
  `src/routes/_app.clients.index.tsx`) assumes one flat cursor across one list. A kanban board
  with 6 stage columns needs either 6 independent per-column cursors/queries (bounded load per
  column, e.g. top N most-recent, with a per-column "load more"), or some other shape — this
  still needs to be designed, not copied mechanically from Clients.
- **Drag-and-drop across pagination boundary:** undecided whether a card outside the initially
  loaded N-per-column must be draggable (would need eager-loading or a different interaction),
  or whether it's acceptable that only already-loaded cards can be dragged until the column is
  expanded.
- **Client-status filter:** the existing `status` filter dropdown filters by the *client's*
  status, not the document's — currently done via a client-side join against a separately
  fetched `clients` list. Whether this moves server-side (via a Supabase embedded-resource
  filter on the `clients` foreign-key relation) or stays a client-side post-filter on the loaded
  page is still open.
- **Rough options sketched (not yet presented to the owner as a formal choice):**
  - **A (leaning recommended):** bounded-per-stage keyset load (extend
    `listCommercialDocuments`/add a paginated variant, called per-stage with a small limit e.g.
    50) + a new aggregate RPC for the header/analytics numbers, following the
    `task_control_loop_metrics_rpc` pattern.
  - **B (minimal/quick-win):** don't implement true per-column pagination yet; just move the
    summary-stat computation to a server RPC and trim the per-card payload. Doesn't actually
    close the checklist item's "paginate" wording, but is lower risk if time is short.
  - **C (not recommended):** replace the kanban board with a server-paginated flat list
    filterable by stage, dropping drag-and-drop. Bigger UX change than what was asked for; the
    owner has already verified and relies on the current drag-drop flow (see the 2026-08-05
    18:05 memory entries about testing bidirectional stage transitions in production).

### Stage 3 already-done items (for context, don't redo)

- `bun run stage3:baseline` → `docs/reports/2026-08-05-stage-3-performance-baseline.md` (the row-
  count/payload/timing baseline referenced above).
- Manager holiday administration (Master Data) + CSV preview/validation/atomic import via
  `import_business_calendar_holidays(jsonb)`, with duplicate/invalid/incomplete-year test
  coverage.
- `src/lib/pagination-contracts.ts` — the typed, resource-agnostic keyset-cursor contract
  (`normalizeListPageInput`, `encodePageCursor`/`decodePageCursor`, `listQueryKey`). Already
  lists `"commercial-documents"` and `"tasks"` in its `ListResource` union, ready to use.
- Clients pagination: `src/lib/data/clients.ts:listClientRowsPage` (server-side search/status/
  source/owner/next-FU filters, keyset cursor on `created_at`+`id`) wired into
  `src/routes/_app.clients.index.tsx`. This is the reference implementation for the *mechanical*
  parts of the pattern (query shape, cursor encode/decode, `listQueryKey` usage) — Pipeline's
  kanban shape still needs its own design as noted above.

### Environment notes

- Local dev server runs on **port 8080** (`bun run dev`), not 3000 — port 3000 on this machine is
  an unrelated `whatsapp-bridge` process, not this app.
- Local Supabase: `bunx supabase start` / `bunx supabase status`. Some auxiliary services
  (imgproxy, pooler) showed as stopped mid-session but the API (`54321`) and DB (`54322`) stayed
  up; not investigated further, wasn't a blocker.
- **The owner asked (2026-08-05) to always respond in Bahasa Indonesia** — saved to this
  project's Claude memory (`feedback_bahasa_indonesia.md`). If your tool doesn't share that
  memory store, the owner will likely repeat this preference.

## HANDOFF TO CODEX — read this first (2026-07-30)

Session run from Claude Code (not Codex), scope was a production audit + security
hardening, not feature work. No app code changed; only two new Supabase
migrations and documentation updates. Read this before assuming the remote
Supabase project or RFQ migration status is still "pending" — both claims
below in older sections of this file are now confirmed, not just planned.

- **Confirmed the app is genuinely live in production**, not just deployed
  once: Vercel project `dsmsalescrm` (`hiulaukgalak` team) auto-deploys every
  push to `main` via the GitHub integration (`Japrang311/dsmsalescrm`).
  Checked `list_deployments` — 20 most recent deployments all `READY`/
  `production`, latest matching local HEAD (`5440633`, "refactor: simplify
  settings and task state handling").
- **Confirmed `qhtfixgbcpcitokeryxb` is the live production Supabase
  backend** (dashboard name `dsmsalescrm`, region ap-northeast-1, Postgres
  17.6.1, Free Plan org `Japrang311's Org`). This is the same project
  referenced elsewhere in this file as "DSM Sales Web App V2" — the local
  `config.toml` `project_id` string `DSM_SALES_WEB_APP_V2` is a separate,
  local-only Docker-stack identifier and should not be confused with this
  remote project ref.
- **RFQ-retirement migrations are no longer remote-pending.** Ran
  `list_migrations` against `qhtfixgbcpcitokeryxb` live: all local
  migrations through `20260730033312_prevent_duplicate_client_names` are
  applied and in sync, including `20260725151142_retire_rfq_rpcs` and
  `20260725152241_block_authenticated_rfq_creation`. Any older note in this
  file or in `CLAUDE.md` calling these two "remote-pending" is now stale.
- **Ran Supabase security + performance advisors** against the remote
  project and worked through every finding with the owner:
  - **Fixed (new migrations, applied to remote and tested against local
    first via `bunx supabase db reset` + `bun run test`):**
    - `20260730120000_revoke_anon_execute_on_privileged_rpcs` — the `anon`
      role could call `public.reassign_client_owner` and
      `public.task_control_loop_metrics` over PostgREST (Postgres grants
      `EXECUTE` to `PUBLIC` by default on function creation; the original
      migrations only ever `grant`ed to `authenticated` and never revoked
      the implicit `PUBLIC` grant). Both functions already reject
      non-privileged/NULL roles internally (see
      `20260728091500_fix_null_role_fail_open_gates.sql`), so this was not
      an active data bypass, but it removed a defense-in-depth gap of
      exactly the same shape as that prior fail-open bug. Verified fixed
      via `get_advisors` (the two `anon_security_definer_function_executable`
      findings disappeared after apply).
    - `20260730121500_pin_normalized_client_name_search_path` — pinned the
      mutable `search_path` on `public.normalized_client_name` (`alter
      function ... set search_path = ''`). It only calls builtins
      (`regexp_replace`/`lower`/`coalesce`), so an empty path is safe.
      Verified fixed via `get_advisors`.
  - **Deliberately left as-is (accepted risk, not a bug):**
    - `public.client_search_index` is flagged ERROR (`security_definer_view`)
      but this is intentional — see
      `20260721000000_expand_client_search_index.sql` and the note in
      `20260722060000_add_client_company_details.sql:55-59`. It's designed
      to bypass `clients` RLS on purpose so the client picker can search
      cross-owner; it only exposes `id`/`name`/`owner_id`. Switching it to
      `security_invoker = true` would restore per-row RLS and break
      cross-owner search in the Create dialogs. Left alone.
    - Leaked Password Protection (Supabase Auth) is off — requires Pro
      Plan; org is on Free. Owner deferred, not urgent.
    - 18 unindexed-foreign-key findings (all INFO level) — checked actual
      row counts (`commercial_documents` 428, `activity_log` 217,
      `sales_orders` 201, `tasks` 50, `follow_up_logs` 36,
      `business_calendar_holidays` 0). At this volume Postgres does a fast
      sequential scan regardless of indexing; owner deferred until a table
      actually grows large enough to matter.
- **Reviewed RLS policies on all 12 `public` tables directly** (`pg_policies`
  + `pg_class.relrowsecurity`), not just the advisor summary. All 12 have
  RLS enabled. Confirmed the `sales`/`manager`/`executive`/`super_admin`
  scoping described in `CLAUDE.md` and ADR-002 actually matches the live
  policies, including one non-obvious point worth remembering: `targets`
  RLS lets `super_admin` administer target rows (same as `manager`), but
  `private.is_active_business_owner()` (used in every `with_check`) only
  returns true for `role in ('sales', 'manager')` — so a `super_admin`
  account can never itself be the *subject* of a target row. That's what
  `CLAUDE.md`'s "excluded from targets/performance" actually means; it is
  not a contradiction with `super_admin` having admin rights over the
  table. Minor observation, not acted on: `business_calendar_holidays` has
  no `UPDATE` policy (only `SELECT`/`INSERT`/`DELETE`), so editing an
  existing holiday requires delete+recreate — worth confirming against the
  UI if it ever grows an "edit holiday" affordance.
- **Updated `CLAUDE.md`** to name `qhtfixgbcpcitokeryxb` explicitly, correct
  the stale "no `.git` yet" note (this repo has been a real git repo on
  GitHub with Vercel auto-deploy this whole time), remove the "RFQ
  migrations remote-pending" caveat now that it's disproven, and record
  the two new migrations plus the three accepted risks above so future
  sessions don't re-litigate them from scratch.

## HANDOFF TO CODEX — read this first (2026-07-27)

Sales Task Control Loop: technical spec approved by the Product Owner, then
implementation-plan Tasks 1-9 (project-tracker Tasks 46-54) delivered and
locally verified. **Tasks 1-7 were committed at `ce160a1`; Tasks 8-9 were
committed at `6ad22eb` and are already in `origin/main` as of the 2026-07-27
reconciliation below.** Remote Supabase migration state must be checked live
before acting; this paragraph was corrected after a later reconciliation found
the four Task Control Loop migrations already present on the linked remote.

- Source of truth: `docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md`
  (the approved spec — status header says "APPROVED oleh Product Owner —
  2026-07-27"), `docs/superpowers/plans/2026-07-27-sales-task-control-loop-implementation.md`
  (the task-by-task plan), `tasks/sales-task-control-loop-todo.md` (checklist),
  and `.superpowers/sdd/sales-task-control-loop-task-{2,3,4,5,6,7,8,9,10,11,12,13,14,15}-report.md`
  (one detailed completion report per task — read these before touching
  anything in this feature, they record several non-obvious decisions and
  three real bugs found only via browser testing).
- **Task 46/1** (spec) and **Task 47/2** (characterization tests) done.
  Task 47 also found and fixed a real pre-existing bug: `.env.local`'s
  `VITE_SUPABASE_URL` pointed at a remote Supabase project instead of local,
  silently breaking every `src/lib/data/*.test.ts` test. Now points local;
  confirmed fixed (full suite passed after).
- **Task 48/3**: new columns on `tasks` (`workflow_status`, `category`,
  `next_action`, `next_action_date`, `cancellation_reason`), `client_id`
  nullable on `tasks` and `follow_up_logs`. Legacy `status` column
  untouched (dual-read until Task 16/61). The next-action-required CHECK
  constraint was deliberately **not** added here — confirmed with the
  Product Owner it would break the live `createTask()` flow immediately.
- **Task 49/4**: `public.business_calendar_holidays` table (empty —
  real holiday data is a deliberately separate, later manual-entry action,
  not fabricated here) plus `compute_task_due_state()` (DB function) and
  its TypeScript mirror `src/lib/data/business-calendar.ts`, proven
  byte-identical against 18 shared fixtures (weekends, consecutive
  holidays, leap day, year-end, calendar-incomplete fallback).
- **Task 50/5**: `public.record_task_progress()` — the one atomic RPC
  (insert `follow_up_logs`, update `tasks`, insert `activity_log`, all or
  nothing; verified with a forced-failure test proving real rollback).
  This is also where the next-action constraint from Task 48 was safely
  added, gated by a new `tasks.first_progress_at` column so it only
  applies once a Task has actually been progressed through the RPC.
- **Task 51/6**: TypeScript domain/adapter migration.
  `src/lib/domain.ts`'s `Task` type gained `workflowStatus`/`dueState`/
  `category`/`nextAction`/`nextActionDate`/`cancellationReason` (legacy
  `status` kept, dual-read). New `src/lib/data/task-progress.ts` wraps the
  RPC; `updateTask()` deliberately cannot touch workflow/progress fields
  anymore (only the RPC can). Found and fixed a real `bun:test` bug: two
  test files sharing the literal basename `task-progress.test.ts` in
  different directories corrupted each other's `supabase.auth` state under
  a full-suite run (not `--isolate`); fixed by renaming one to
  `task-progress-adapter.test.ts`.
- **Task 52/7**: first UI-facing task. `CreateTaskDialog.tsx` — Client now
  optional, Category picker added. `TaskDetailDrawer.tsx` — split into
  "Detail Task" (plain fields via `updateTask()`) and a new "Catat
  Progress" section (workflow status, next action/date, cancellation
  reason, note — all via the RPC; this also absorbed the old standalone
  "Tambah catatan" box, which used to write straight to `activity_log`
  only). Manually browser-verified end-to-end as both real seeded
  accounts (`nur@local.dsm.test` Sales, `adhitya@local.dsm.test` Manager)
  — create without a Client, progress through every workflow state,
  cancel with reason, reopen with a fresh next action, quick-complete,
  archive. This found and fixed **three real bugs unit tests missed**:
  an empty-string `client_id` crashing an `activity_log` insert on
  Task creation, `listTaskHistory()` excluding the new `task_progress`
  activity kind (so the Drawer's "Riwayat" silently showed nothing),
  and stale local form state after a successful save. All three are
  detailed in the Task 7 report.
- **Task 53/8**: unified progress timeline done. `src/lib/data/activity-log.ts`
  now exposes `listTaskTimeline(taskId)`; it renders `follow_up_logs` as the
  canonical progress entries, uses paired `activity_log.task_progress` rows
  only to recover actor/title, suppresses that duplicate audit row, and keeps
  historical follow-ups plus audit-only Task rows visible. `TaskDetailDrawer`
  reads `["task-timeline", taskId]`, and the active Tasks-page "Log follow-up"
  shortcut now opens the atomic drawer instead of the old non-transactional
  `LogFollowUpDialog`. Browser verification created one local QA Task,
  confirmed the timeline survived refresh, saw no console errors, then cleaned
  the exact local fixture (1 task, 1 follow-up, 2 activity rows).
- **Task 54/9**: Manager Tasks split done. New
  `src/lib/data/task-exceptions.ts` provides role-aware selectors for
  Manager-owned Tasks and Sales-owned active Escalated exceptions. The Tasks
  page shows Manager-only mode toggles: "My Tasks" (Manager-owned) and
  "Team Exceptions" (Sales-owned Escalated active rows only). Team Exceptions
  auto-focuses Overdue, keeps the Task owner visible as the Sales owner, opens
  the same Task Detail Drawer/timeline context, and deliberately hides the bulk
  "Ubah owner" action in that mode so escalation does not imply ownership
  transfer. Browser verification used exact local QA fixtures, then removed
  all three fixture Tasks and confirmed `remaining=0`.
- **Task 55/10**: Executive exception detail and aggregate-only reporting done.
  New local migration
  `20260727150000_restrict_task_exception_visibility.sql` narrows Executive
  row-detail RLS to active, non-archived, Manager-owned Tasks whose derived
  due state is `Escalated`; applies the same boundary to Task-linked
  `follow_up_logs` and `activity_log`; and adds
  `public.task_control_loop_metrics()` for aggregate-only company metrics
  (Manager/Executive/Super Admin only, `PUBLIC` execute revoked). UI now labels
  Executive `/tasks` as `Executive Exceptions`, hides Quick Create and write
  controls, and gates TopBar data widgets until `authReady` to avoid pre-auth
  401 noise. See
  `.superpowers/sdd/sales-task-control-loop-task-10-report.md`.
- **Task 56/11**: Dashboard and TopBar consumer migration done. Dashboard
  operational selectors now count active Tasks by `workflowStatus` and due
  buckets by derived `dueState`; `Escalated` is counted separately and combined
  with `Overdue` only for the attention KPI. Manager/Executive/Super Admin
  Dashboard KPI counts use `public.task_control_loop_metrics()` so Executive
  company aggregates do not depend on row-detail visibility. TopBar
  notifications and the Follow-Up Prioritas widget exclude Done, Cancelled,
  and Archived Tasks even when legacy `status` is stale. Executive remains
  read-only in the follow-up widget. See
  `.superpowers/sdd/sales-task-control-loop-task-11-report.md`.
- **Task 57/12**: Reports and performance calculations migration done. New
  `reportSalesPerformance()` keeps Manager-owned personal Tasks counted as
  sales work by owner while separating open, overdue, escalated, done, and
  cancelled definitions through `workflowStatus` + `dueState`. Executive
  Reports no longer show per-member Task detail derived from restricted rows;
  the Reports Task Control card uses aggregate metrics instead. See
  `.superpowers/sdd/sales-task-control-loop-task-12-report.md`.
- **Task 58/13**: Export migration done. CSV, XLSX, and PDF follow-up exports
  now label `Workflow Status` and `Due State` separately, use the shared
  authorized export snapshot, and avoid legacy Task `status` leakage.
  Non-Sales export totals use aggregate Task metrics when available, so
  Executive totals reconcile without relying on restricted Task detail. See
  `.superpowers/sdd/sales-task-control-loop-task-13-report.md`.
- **Task 59/14**: Pipeline, Client Detail, and commercial follow-up path
  migration done. New `src/lib/data/task-relations.ts` centralizes
  Client-related vs commercial-related Task filtering while preserving
  standalone Tasks for the Tasks module. Pipeline next-action fallback and
  Commercial Detail now use explicit commercial Task links, Client Detail uses
  only Client-related Tasks, and UI call sites stopped passing legacy
  `status: "Upcoming"` when creating commercial follow-up Tasks. Browser
  screenshots of `/pipeline` and `/clients` rendered without RFQ being
  reintroduced. See
  `.superpowers/sdd/sales-task-control-loop-task-14-report.md`.
- **Task 60/15**: Ownership transfer and account lifecycle consumer migration
  done locally. New migration
  `20260727130930_update_task_account_lifecycle.sql` replaces account
  lifecycle transfer scope with `workflow_status in ('Open','In Progress',
'Waiting External')` plus `archived = false`, while Done, Cancelled, and
  archived Tasks preserve historical owner attribution. Team roster active
  counts now use the same workflow-active Task predicate. During verification,
  a copied historical bug was caught and fixed: the transfer function must
  update `public.commercial_documents`, not the retired `public.commercial_items`
  table. Checkpoint C is now locally complete. See
  `.superpowers/sdd/sales-task-control-loop-task-15-report.md`.
- **Task 61/16**: existing-data cutover and legacy Task status retirement done
  locally. New migrations `20260727160000_backfill_task_control_loop.sql` and
  `20260727160010_retire_legacy_task_status.sql` create a private
  machine-readable audit row, replace `record_task_progress()` without the old
  dual-write, then drop `public.tasks.status` and `public.task_status`. The
  generated report is
  `docs/reports/sales-task-control-loop-migration.json` plus the Markdown
  companion; it passed with zero unexplained mismatches on the local seeded DB.
  Active app/test code now uses `workflowStatus` + derived `dueState`; the
  unused legacy `LogFollowUpDialog` component was removed. See
  `.superpowers/sdd/sales-task-control-loop-task-16-report.md`.
- **Task 62/17**: complete local verification and documentation reconciliation
  done locally. See
  `.superpowers/sdd/sales-task-control-loop-task-17-report.md`. Fresh local
  reset, migration audit, full `bun test` (458 pass, 0 fail),
  `bunx tsc --noEmit`, `bun run lint` (0 errors, 12 existing warnings),
  `bun run build`, and `supabase db advisors --local` all pass. `bun run lint`
  was stabilized by targeting source/config paths instead of scanning generated
  artifacts from the repo root. One stale Phase 11 test fixture was fixed after
  Task 16 removed `public.tasks.status`; Task Control Loop calendar functions
  were hardened with an explicit empty `search_path`. `supabase db lint --local`
  still exits 0 but reports existing baseline findings in commercial migration/
  import functions and `reassign_client_owner`. Browser UAT evidence in
  `.superpowers/sdd/browser-evidence-task-17-final/` covers Sales
  create/progress/archive/restore, Manager Team Exceptions before and after a
  local holiday correction, Executive read-only Exceptions, and Super Admin
  correction through `/login`; summary recorded no console warnings/errors and
  no failed requests. No remote mutation, deployment, commit, or push occurred.
- **Task 63/18 executed after exact owner approval**: release-gate dossier
  updated at
  `.superpowers/sdd/sales-task-control-loop-task-18-release-gate.md`.
  Commit `b33efe3` (`feat: complete sales task control loop release gate`) was
  pushed to `origin/main` (`30fdb12..b33efe3`). Linked Supabase project
  `qhtfixgbcpcitokeryxb` / `DSM Sales Web App V2` was synced for
  `20260727141303_harden_task_calendar_function_search_path.sql`,
  `20260727160000_backfill_task_control_loop.sql`, and
  `20260727160010_retire_legacy_task_status.sql`; post-apply migration list
  confirmed all three have matching local/remote versions. Vercel production
  deployment `dpl_ATtYyZxxZEp4cLR1jHVwSs1rZaE5` is Ready at
  `https://dsmsalescrm.vercel.app` with deployment URL
  `https://dsmsalescrm-eo807jrdz-hiulaukgalak.vercel.app`. SQL/RLS smoke
  passed: production has 24 tasks, retired `public.task_status` resolves null,
  due-state helper returns `Today` with `calendar_incomplete = true`, Sales RLS
  sees 10 owned tasks, Manager sees 24, Executive sees 0 direct task rows but
  aggregate metrics return 24 total tasks, and Super Admin sees 24. HTTP smoke
  passed for `/`, `/login`, and `/tasks`. Authenticated production browser
  smoke was not run because no production password/session was available; no
  production Auth users were created or mutated for test access. Remote
  `supabase db advisors --linked` did not complete after login-role
  initialization and was stopped, so remote advisors are not verified.
- Verification recorded through Task 9: full local suite **439 pass, 0 fail**
  (58 files), plus a focused 34-test suite across `business-calendar`,
  `task-exceptions`, `tasks`, `task-progress`, and `activity-log`;
  `bunx tsc --noEmit` clean; `bun run build` passed; browser Manager
  verification passed with no console errors. Earlier
  Task 7 full-suite stability was
  run twice from a fresh `bunx supabase db reset` for stability, not a
  lucky pass; Task 8 full suite was run once after implementation. `bun run lint`
  (ESLint) did **not** complete in the session that ran it (24+ then 47+
  minutes with no output, killed both times) — `tsc` and
  `supabase db lint --local` were used as the effective lint-shaped gates
  instead; worth investigating separately why ESLint is this slow on this
  repo.
- Git/Supabase state as reconciled on 2026-07-27: four Task Control Loop
  migrations
  (`20260727120000_add_task_control_loop_foundation.sql`,
  `20260727130000_add_business_calendar.sql`,
  `20260727140000_extend_task_progress_schema.sql`,
  `20260727141000_add_atomic_task_progress.sql`) exist locally and were also
  listed on the linked remote by `bunx supabase migration list --linked`
  during the reconciliation pass. Do not run `supabase db push`/
  `apply_migration`/`execute_sql` against any remote project without fresh
  explicit approval naming the exact target; read-only migration-list checks
  are acceptable for reconciliation. This session's own STOP RULE required
  new explicit authorization before starting each implementation-plan
  task in turn (Tasks 1-9 were granted/continued locally in order) — the same
  pattern should hold for Task 55/10 onward: don't assume continuation is
  pre-approved just because Tasks 1-9 were.

### 2026-07-27 reconciliation checkpoint

- `git status --short --branch` shows `main...origin/main [ahead 3]`.
  The three local commits ahead of `origin/main` are `b10fb15` (design audit
  Phase 1 layout polish), `32f9d50` (mobile Quick Create accessibility label),
  and `17c3fee` (this handoff/design-audit documentation line).
- `origin/main` points at `6ad22eb feat: complete task progress timeline and
manager exceptions`, so Task 53/8 and Task 54/9 are already pushed to Git.
- `bunx supabase migration list --linked` lists the four Task Control Loop
  migrations through `20260727141000` on both local and remote. This corrects
  the older "remote Supabase has not been touched" and "locally only" wording.
- Task 55/10 later added
  `20260727150000_restrict_task_exception_visibility.sql` locally only. It has
  been applied to the local database via `bunx supabase db reset`, but it has
  **not** been pushed/applied to remote Supabase and requires a fresh explicit
  remote gate before any remote mutation.
- No source-file working-tree diff was present before this reconciliation edit.
  The only new pending change from this checkpoint is this `HANDOFF.md`
  correction unless later work adds more.

### Visual design audit, Phase 1 — critical usability/responsiveness fixes (2026-07-27, committed as `b10fb151` + a same-day follow-up commit)

- A `/design-audit`-style pass walked all 10 routes (desktop 1440px and
  mobile ~390px, logged in as `adhitya@local.dsm.test`/Sales Manager) and
  produced a phased findings list. Only Phase 1 (critical) was approved and
  implemented; Phase 2 (spacing/typography/color/consistency) and Phase 3
  (empty/loading states, dark mode, micro-polish) are documented but not
  built — see the full findings list earlier in this same session's chat
  transcript if resuming this work, since it isn't duplicated here.
- **`TaskDetailDrawer.tsx`**: the "Detail Task" and "Catat Progress"
  sections save independently by design (Detail via `updateTask()`,
  Progress via the atomic `recordTaskProgress()` RPC — see Task 50/51
  above; this is intentional, not a bug, so it was _not_ merged into one
  form). Each section is now wrapped in its own bordered card, and shows
  an inline "Ada perubahan belum disimpan" (amber, `text-warning` token)
  indicator scoped to whichever section actually has unsaved edits, so a
  user editing both sections can't silently lose one half by clicking only
  one Simpan button.
- **`_app.settings.tsx`** (Target tab): monthly target inputs were
  rendering as `84px` columns, clipping real 9-digit raw-Rupiah values
  (e.g. `750000000`) by a character. Widened to `140px` (table
  `min-w-[1560px]` → `min-w-[2100px]`). Also added a `relative` wrapper +
  right-edge fade-gradient overlay (`pointer-events-none`, `to-card`) so
  the table visibly hints there's more to scroll to horizontally, instead
  of just cutting off with no affordance.
- **`_app.pipeline.tsx`**: same right-edge fade-gradient treatment added
  to the Commercial Pipeline kanban board (`to-background`), which has 6
  stage columns and regularly overflows the viewport on both desktop and
  mobile. Note: the board's _mobile_ behavior itself was re-verified live
  via `window.innerWidth`/`getBoundingClientRect()` and found to already
  be a correctly-functioning horizontal-scroll flex row (fixed 280px
  columns) — an earlier read of it as a broken 2-column grid was a
  viewport-measurement artifact (the devtools resize call silently didn't
  apply on a freshly-opened tab; `emulate({viewport: ...})` was the
  reliable way to force a true mobile width). No board-layout change was
  needed beyond the fade.
- **`_app.clients.$clientId.tsx`**: the six-tab `TabsList` used
  `flex-wrap` without overriding the base `TabsList` component's fixed
  `h-9`, so on mobile the wrapped second row of tabs visually overlapped
  the KPI cards rendered immediately below instead of pushing them down.
  Changed to a horizontally-scrolling single row (`overflow-x-auto`,
  `shrink-0` per trigger) instead of wrapping.
- **`shell/TopBar.tsx`**: the Quick Create button's visible label
  (`<span className="hidden sm:inline">Quick Create</span>`) is hidden
  below the `sm` breakpoint with no `aria-label` fallback, so on mobile it
  was an icon-only button with an empty accessible name (confirmed via
  the a11y tree, not just visually). Added `aria-label="Quick Create"` to
  the button. Note this was originally misdiagnosed as a Search-button
  labeling issue; direct DOM inspection (`button.ariaLabel`/`textContent`
  per header button) showed the real culprit was Quick Create, and that
  global search has no mobile entry point at all — `GlobalSearch`'s whole
  wrapper is `hidden md:block`, not collapsed-with-a-trigger. That's a
  bigger interaction-design gap (needs a real mobile search surface, not
  a style fix) and was deliberately left unaddressed pending an explicit
  decision, per the audit's scope-discipline rule (flag functional gaps,
  don't silently build new UI for them).
- Verification: `bunx tsc --noEmit` clean; `bunx eslint` on the five
  touched files clean (one pre-existing, unrelated
  `react-hooks/exhaustive-deps` warning in `TaskDetailDrawer.tsx`); all
  fixes re-screenshotted live in-browser after `prettier --write`
  reformatted the touched files (mechanical only, no visual change). Full
  `bun run lint` was not used for the same reason noted in the Task 55/10
  entry above (multi-minute hang with no output on this repo) —
  file-scoped `eslint` was used as the effective gate instead.

## HANDOFF TO CODEX — read this first (2026-07-25)

RFQ is retired as an active application feature. Treat every older RFQ workflow
description below as historical unless a newer note explicitly says otherwise.

- Source of truth:
  `docs/decisions/ADR-003-retire-rfq-workflow.md`,
  `specs/remove-rfq.md`, and `tasks/rfq-removal-todo.md`.
- Active UI no longer exposes RFQ routes, sidebar navigation, global search,
  quick-create, client actions, dropdown options, pipeline filters, or RFQ-only
  stages/statuses.
- Quotation is the first active commercial document in the new-product flow.
  Quotation stages start at `Quotes Sent`; `Client Request for Quotes` is no
  longer an active stage.
- Historical RFQ rows, enum values, old migrations, and legacy stored source
  values remain for compatibility. Application queries exclude historical RFQ
  documents from active business surfaces.
- Git state: RFQ retirement was committed and pushed to `origin/main` as
  `b0dc808 refactor: retire RFQ workflow`.
- Supabase state: local migrations
  `20260725151142_retire_rfq_rpcs.sql` and
  `20260725152241_block_authenticated_rfq_creation.sql` exist and were applied
  locally during implementation, but `supabase migration list --linked` showed
  both migrations still pending on remote immediately after the Git push. Do not
  run `supabase db push --linked` without fresh explicit approval naming the
  exact project target.
- Verification recorded for the RFQ retirement implementation: full test suite
  `364 pass / 0 fail / 1825 assertions`, `bunx tsc --noEmit`, changed-file
  ESLint with 0 errors and 1 existing Fast Refresh warning, `git diff --check`,
  and `bun run build`.

## HANDOFF TO CODEX — read this first (2026-07-24)

Soft delete for RFQ, Quotation, and Sales Order is **implemented, verified,
pushed, and remote-applied**.

- Source documents:
  `docs/superpowers/specs/2026-07-24-soft-delete-rfq-quotation-sales-order-design.md`
  and
  `docs/superpowers/plans/2026-07-24-soft-delete-rfq-quotation-sales-order-implementation.md`.
- Local migrations add `deleted_at`/`deleted_by`, the four immutable lifecycle
  event kinds, scoped column grants, and atomic `security invoker` delete/restore
  RPCs. No browser-accessible hard-delete path was added.
- Active lists/details exclude deleted rows by default. Operational roles can
  open a separate deleted-only mode and restore records. Deleted Sales Orders
  are explicitly excluded from active revenue, reports, KPIs, and export.
- Authorization was verified in the browser: Sales can manage only their own
  records; Manager and Super Admin can act company-wide; Executive has no
  delete/restore controls. Deleting a superseded Quotation revision is blocked.
- Delete/restore writes immutable audit rows. Activity Log now renders all four
  lifecycle kinds; restored records link back to their detail pages.
- Browser QA also found and fixed two issues: structured Supabase errors now
  show their real message, and deleted Sales Orders no longer display active
  revenue KPI cards.
- Browser fixture cleanup is complete: the exact QA audit rows, documents,
  Sales Order, client, profile, and local Auth user were removed and rechecked
  as absent.
- Final local gate: `346 pass / 0 fail / 1798 assertions`,
  `bunx tsc --noEmit` passed, scoped source lint completed with `0 errors`
  and 12 pre-existing warnings, and `bun run build` passed.
- Feature commits after the original design:
  `ba4c487`, `e5c6873`, `8444fd6`, `3f7602c`, `4c79f41`, `2c8e1ae`,
  `e77c131`, `92ee99e`, and `007b7c5`.
- **Git deployment state:** branch `codex/soft-delete-commercial` was pushed to
  `origin`, then `main` was fast-forwarded to `007b7c5` and pushed to
  `origin/main`. Production URL `https://dsmsalescrm.vercel.app` responded with
  HTTP 200 after redirect to `/dashboard` after the push. This confirms the
  live site is reachable; it does not prove Vercel has completed every build
  step because dashboard deployment status was not available in this session.
- **Supabase deployment state:** with explicit owner approval, `supabase db push
--linked` was applied to project `qhtfixgbcpcitokeryxb` (DSM Sales Web App
  V2). Applied migrations:
  `20260724094444_fix_normalized_import_supersedes_column.sql`,
  `20260724094906_add_commercial_soft_delete_activity_kinds.sql`,
  `20260724094907_add_commercial_soft_delete_columns.sql`,
  `20260724095232_add_atomic_commercial_soft_delete.sql`, and
  `20260724095521_add_atomic_sales_order_soft_delete.sql`.
  Post-apply dry-run reported: `Remote database is up to date`.
- **Operational caveat:** the Supabase CLI printed a non-fatal warning after
  apply: caching the pg-delta catalog failed because a temporary certificate
  file was missing. Remote migration history and dry-run verification both
  showed the migrations were applied.

## Project basics

- TanStack Start (React 19) front-end with a real local Supabase Postgres backend (`src/lib/data/`). The production mock layer was fully removed on 2026-07-19.
- Package manager: **bun**. Key commands: `bun run dev`, `bun run test` (needs local Supabase running), `bun run lint`, `bun run build`, `bunx tsc --noEmit`.
- Local Supabase: `bunx supabase start` / `bunx supabase db reset` (rebuilds from `supabase/migrations/*.sql` + `supabase/seed.sql`) / `bunx supabase stop`.
- Git is present on branch `main`, connected to `github.com/Japrang311/dsmsalescrm`
  (the Lovable-connected remote). On 2026-07-24, `main` and `origin/main`
  matched at `007b7c5` before the session-handoff documentation commit. Do not
  trust older "local-only / pending push" notes below without rechecking git first.
  Still never rewrite history, rebase, amend, squash, or force-push on this repo.
- Remote Supabase target is `qhtfixgbcpcitokeryxb` (DSM Sales Web App V2).
  Never run future remote schema/data mutations without fresh explicit owner
  approval for that exact target. On 2026-07-24, `supabase db push --linked
--dry-run` reported `Remote database is up to date` after the soft-delete
  migrations were applied.
- The user (Aditya) is not a programmer — explain things in plain terms, avoid silently making irreversible calls (schema changes, deleting data).

## Latest accepted direction — supersedes older deferred notes below

The older accepted changes below are implemented and verified as noted in their own sections. For the freshest git state, read the 2026-07-22 continuation sections at the bottom; this header was refreshed at `816a7fe`.

### Production mock-layer removal (Task 22 — locally verified complete)

- `src/lib/mock/` is deleted and guarded against reintroduction.
- Shared types/rules/time live in `src/lib/domain.ts`,
  `src/lib/business-rules.ts`, and `src/lib/app-time.ts`.
- Activity Log uses only persisted `activity_log`/`follow_up_logs` rows.
- Dashboard PDF/CSV/XLSX exports use the same backend snapshot as the UI.
- Per-device preferences remain local by decision in
  `src/lib/preferences-store.ts`; they no longer include mock business state.
- Verification: 296/296 tests, typecheck/build/lint with no errors, and
  Sales/Manager/Executive browser UAT. See
  `.superpowers/sdd/task-22-report.md`.

### Super Admin, Team & Role, and account lifecycle (Phase 12 — locally verified complete)

- Source of truth: `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`, `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`, and `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md`.
- Add an explicit fourth database role, `super_admin`; do not model it as Manager plus a UI flag.
- Only active Super Admin manages Team & Role. Manager/Executive see the roster read-only; Sales does not see it.
- Manager retains company-wide supported business editing. Super Admin has company-wide supported access but owns no clients, targets, pipeline, revenue, or performance.
- Super Admin corrections preserve the Sales owner unless the explicit ownership-transfer action targets an active Sales/Manager.
- Deactivate by default; inactive profiles fail closed in RLS. Permanent deletion is only for an account with zero business/audit references.
- Protect the current logged-in and last active Super Admin. Every admin action requires a reason and append-only audit evidence.
- Activity Log is immutable for every role, including Super Admin.
- The historical Manager-driven behavior and `bootstrap_manager_role.sql` are superseded. The current database has four roles and the Super-Admin-only lifecycle boundary.
- Tasks 37–41 are locally verified complete; see `.superpowers/sdd/task-7-report.md`.

### Commercial documents and numbering (Phase 11 — locally verified complete)

Accepted on 2026-07-18:

- Source of truth: `docs/decisions/ADR-001-normalized-commercial-documents-and-numbering.md` and `docs/superpowers/specs/2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`.
- The user still records each RFQ/Quotation/SO once in one form, but PostgreSQL will normalize one document header plus child line items.
- New items require Product, Qty, and UOM (`Unit`, `Pcs`, `Set`, `Lot`); Description is optional. Prototype FOC keeps non-monetary items and stores price/total as `NULL`.
- Revenue is the paid line-item grand total for the form Date. The administrative SO number does not create/move revenue.
- Quotation numbers use `DSM-YYQUO-nnnn`; revisions append `_REV.n`, retain history, and only the latest version enters forecast.
- PPN/Non-PPN/Prototype SO numbers use independent yearly `DSM-YYSOnnn`, `DSM-YYNPnnn`, and `DSM-YYPROTYnnn` counters allocated atomically in PostgreSQL.
- Observed Sheet maxima on 2026-07-18 were QUO 404, SO 143, NP 16, PROTY 8; real import must recalculate before seeding.
- HARIFF supports normal current-year automatic numbering or audited manual Existing/Backdate numbering; backdate consumes no counter and does not change the revenue Date.
- Grouped list/detail is no longer deferred; it is part of Phase 11.
- The Sheet importer and fixtures target normalized headers/items, reconcile
  totals/reviews, and seed counters transactionally.
- All five prepared source tabs were processed locally on 2026-07-19. The
  original closeout accepted 549 headers / 1,005 items / Rp103.459.907.623,
  with 127 rows quarantined in 55 pending review entries and zero
  source-to-database mismatches. Six explicit client aliases are recorded in
  `scripts/import-sheets-mapping.md`. See
  `.superpowers/sdd/p11-import-closeout-report.md`.
- **Update (2026-07-19, later same day):** all 55 pending review entries were
  worked through with the project owner and re-imported. Current accepted
  set is **586 headers**, paid total **≈Rp131.024.482.393**; 33 review rows
  remain, all accounted for by 16 documents the owner deliberately chose to
  keep rejected (incomplete source data — not a gap). See
  `.superpowers/sdd/p11-review-decisions-report.md` for the full
  decision-by-decision record, including two structural bugs found and fixed
  along the way (a migration that seeded business data before `profiles`
  existed, and a silently-dropped row in `quotation-clean.csv`).
- Import grouping now quarantines an entire document when any row for that
  document requires review. Valid official numbers on review rows still reserve
  their counter sequence.
- Punctuation/casing/spacing-only address variations compare as equivalent
  without rewriting the stored source address. This released
  `DSM-26QUO-0119`; distinct status, note, linked-SO, PO, and client-ID values
  remain quarantined.
- Numbering/data-adapter tests use dedicated 2091–2096 counter years and clean
  only their own rows. Lifecycle failure-trigger tests self-heal stale triggers.
  The 313-test suite leaves imported 2026 counters unchanged.
- Tasks 31–36 are locally verified complete; see `.superpowers/sdd/p11-task-8-report.md`.
- No Phase 11 or Phase 12 migration or mutation has been performed against a remote project.

The old PRD rule that official Quotation/SO numbers must come from an external process is superseded. Do not restore it.

## What happened this session, in order

### 1. Ran the app locally

Started `bun run dev` + local Supabase stack. Two `vite dev` processes originally ended up on 8080/8081; the stale 8080 process was later terminated and 8081 was verified active. Recheck current process state before browser work because this is runtime state, not a durable guarantee.

### 2. Fixed "Quick Create" dropdown — was fully non-functional

Root cause: several creation flows (Client, Sales Order, Prototype Request, quick Follow-Up) had never been wired to real Supabase writes anywhere in the app, not just in the Quick Create menu. Fixed all of them:

- Added `createSalesOrder()` to `src/lib/data/sales-orders.ts`.
- New `src/components/clients/ClientPicker.tsx` — shared `useClientResolution()` hook + `ClientPickerField` component (used when a create-dialog is opened without an already-known client, e.g. from the global Quick Create menu vs. from inside a client's own page).
- Rewrote `AddClientDialog.tsx`, `AddFollowUpDialog.tsx` to real writes.
- Rewrote `CreateRfqDialog`, `CreateQuotationDialog`, `CreateSalesOrderDialog` in `CreateRecordDialogs.tsx`, added new `CreatePrototypeDialog`.
- Fixed dead stubs on `_app.clients.$clientId.tsx` (Create Task, Add Prototype Request).
- Wired all 6 dropdown items in `src/components/shell/TopBar.tsx`.
- Added tests: `clients.test.ts` (createClient), `sales-orders.test.ts` (new file, createSalesOrder).

The later Quick Create verification pass fixed the label to **`Record Sales Order`**, added a menu-contract test, browser-verified all six flows, and removed its exact QA data. See the Quick Create design/plan documents for historical evidence.

Verification status at the time: tsc/lint/test/build all clean, but live browser click-through verification was **only partially done** (New Client and New Follow Up visually confirmed; RFQ/Quotation/SO/Prototype dialogs and the Client Detail page fixes were not re-verified after later changes — see below, they were exercised again in the next phase).

### 3. Built multi-item Qty/Unit Price line items for RFQ, Quotation, Sales Order

User's request (verbatim, Indonesian): RFQ/Quotation/SO creation was missing Qty/Unit Price/Total fields, and one document number (RFQ/quotation/SO/SO-prototype) should support multiple line items with a computed row total and grand total.

Three scoping questions were asked and answered (all "Recommended" option):

1. **RFQ gets its own number field too** (`rfqNumber`), same multi-item treatment as Quotation/SO — RFQ didn't have a document number before this.
2. **Value is always auto-calculated as Qty × Unit Price** — never manually overridable by the user.
3. **Only the Create dialogs get this treatment for now** — Pipeline board, RFQ/Quotation/SO index & detail pages, Client Detail tabs are explicitly **NOT** refactored to group rows by document number. This is a known, deliberate gap — see "Explicitly deferred" below.

Implementation:

- **Migration** `supabase/migrations/20260718060000_line_items.sql`: added `rfq_number text`, `qty numeric`, `unit_price numeric` to `commercial_items`; `qty numeric`, `unit_price numeric` to `sales_orders`. All nullable (backward compatible). Applied via `bunx supabase db reset`.
- **Mock types** `src/lib/mock/data.ts`: `CommercialItem` gained `rfqNumber?`, `qty?`, `unitPrice?`; `SalesOrder` gained `qty?`, `unitPrice?`.
- **Data layer**:
  - `src/lib/data/commercial-items.ts`: `CommercialItemRow`/`toCommercialItem()` extended; new `createCommercialItemsBatch()` — takes shared header (clientId/ownerId/type/sourceFlow/stage/rfqNumber-or-quotationNumber) + `lineItems: {description, qty, unitPrice}[]`, inserts one row per item via a single Supabase array insert, `estimated_value = qty * unitPrice` computed per row.
  - `src/lib/data/sales-orders.ts`: `SalesOrderRow`/`toSalesOrder()` extended; new `createSalesOrdersBatch()` — same pattern, `lineItems: {qty, unitPrice}[]` (no description — `sales_orders` has no description column), `value = qty * unitPrice`. Only used for non-FOC SOs; Prototype FOC rows still go through the old single-row `createSalesOrder()` with `value: null` (a DB check constraint requires FOC rows to have null value, so they don't get line items at all).
- **UI** `src/components/clients/CreateRecordDialogs.tsx`:
  - New shared `LineItemsSection<TFieldValues>` component (generic over the form's field-values type, uses `react-hook-form`'s `useFieldArray` + `Path<TFieldValues>` casts for the dynamic `lineItems.${index}.*` field names) — renders add/remove rows, per-row computed total, and a grand total. Takes a `showDescription` flag (true for RFQ/Quotation, false for SO).
  - `CreateRfqDialog`: added Nomor RFQ field, replaced single description+estimatedValue with the line-items editor, submits via `createCommercialItemsBatch()`.
  - `CreateQuotationDialog`: same pattern with Nomor Quotation.
  - `CreateSalesOrderDialog`: added the line-items editor for non-FOC paths; FOC path shows a note instead and skips items entirely; submits via `createSalesOrdersBatch()` (non-FOC) or `createSalesOrder()` (FOC).
- **Tests**: added `createCommercialItemsBatch()` test to `commercial-items.test.ts`, `createSalesOrdersBatch()` test to `sales-orders.test.ts`.

### Verification done

- `bunx tsc --noEmit` clean (only 2 pre-existing, unrelated errors remain in `src/components/commercial/CommercialViews.tsx` — a TanStack Router typed-`Link` issue not touched this session).
- `bun run lint` clean for every file touched this session (5 pre-existing errors remain, all in unrelated route files: `_app.customer-po.$id.tsx`, `_app.prototypes.$id.tsx`, `_app.quotations.$id.tsx`, `_app.repeat-orders.$id.tsx`, `_app.rfq.$id.tsx` — a `react-hooks/rules-of-hooks` false-positive pattern, pre-existing, not caused by this session).
- `bun run test`: 80/80 pass (78 pre-existing + 2 new).
- `bun run build`: succeeds.
- **Browser-verified live**, end-to-end, via Chrome automation:
  - Created a 2-line-item RFQ (PT Denso Indonesia, RFQ-26-4415: "Bracket assembly 2mm" 500×15000=7.5jt, "Housing cover rev.B" 200×25000=5jt) — confirmed 2 separate `commercial_items` rows created via direct Postgres REST query, both `estimated_value` correct, both sharing `rfq_number`.
  - Created a 2-line-item Sales Order (PT Sinar Baja Elektrik, SO-26-8987: 50×120000=6jt, 10×50000=500rb, total 6.5jt) — confirmed 2 separate `sales_orders` rows via direct query, `value` correct on each, both sharing `so_number`.
  - Opened `CreateQuotationDialog` and visually confirmed the same Nomor Quotation + line-items UI renders correctly (did not submit — pattern already proven by RFQ/SO).
  - **Cleaned up all test data** created during this verification pass (deleted the test RFQ/SO rows and their `activity_log` references) — confirmed via re-query that counts returned to baseline (10 SO, Rp2.8 milyar total revenue). No leftover test data in the local DB.

## Historical deferrals from the earlier implementation pass

The list below records the earlier state. Items 1, 2/FOC behavior, and the numbering assumptions are superseded by the accepted Phase 11 design above; item 3 was already fixed. Do not use this section as current scope.

These are **known gaps**, not oversights — the user was asked and chose to defer them:

1. **List/detail pages still show one row per line item, not grouped by document number.** The Pipeline board, RFQ/Quotation/SO index tables, and detail pages will show e.g. 2 separate RFQ rows for a 2-line-item RFQ (same behavior visible in the screenshot verification above: "PT Denso Indonesia · Bracket assembly 2mm" and "PT Denso Indonesia · Housing cover rev.B" appear as two list rows, not grouped under one RFQ-26-4415 entry). Dashboard/Reports totals are unaffected since they already sum across all rows regardless of grouping. If the user wants grouped display later, that's a separate follow-up task — likely needs a "group by document number" view on the relevant index pages, and possibly the detail pages need to show a table of line items instead of a single description/value.
2. **`CreatePrototypeDialog`** (the early "Prototype Request" stage dialog on `commercial_items`, distinct from "SO Prototype") was **not** given multi-item/qty/price treatment — it wasn't in the user's explicit list (RFQ/Quotation/SO/SO-Prototype) and has no natural document-number concept.
3. **TopBar dropdown label bug**: "Record Customer PO" should read something like "Record Sales Order" (see above) — cosmetic, not fixed.
4. Full re-verification of all 6 Quick Create menu items (New Follow Up, New Client, New RFQ, New Quotation, Record Customer PO/SO, New Prototype Request) end-to-end was not exhaustively repeated after the line-items rewrite — RFQ, Quotation (UI only), and Sales Order were checked this session; Client/Follow-Up were checked in the earlier phase; Prototype Request was not re-checked at all in this session.

## What happened this session (2026-07-19, import-review reconciliation)

Starting point: 55 pending review entries from Task 33's closeout
(`Phase-11-Import-Review.xlsx`) were still undecided, and a graphify
knowledge-graph pass had just been run over the repo (see
`graphify-out/GRAPH_REPORT.md` if still present).

1. Ran `/graphify` over the whole project — 1,698 nodes, 4,114 edges, 187
   communities. Not otherwise load-bearing for backend work; mentioned here
   only because it ran earlier in this session.
2. Walked through all 55 review entries interactively with the owner,
   category by category (unmatched_customer, header_conflict, invalid_qty,
   invalid_paid_money, document_has_rejected_rows, price_mismatch,
   unmatched_sales). Every decision is recorded in
   `.superpowers/sdd/p11-review-decisions-report.md`.
3. Discovered the local Supabase DB was completely empty (0 profiles, 0
   clients) at the start of the DB-mutation phase. `bunx supabase db reset`
   then failed on a pre-existing, previously-uncommitted-context migration:
   `supabase/migrations/20260719200000_add_import_clients.sql` (68 new
   client rows for sheet-import matching, apparently from earlier work this
   same day). Root-caused and fixed two independent bugs in it (see the
   report); ultimately moved its data into `supabase/seed.sql` and deleted
   the migration file, since migrations run before `seed.sql` inserts
   `profiles`, and the active-owner trigger needs `profiles` to exist first.
4. Found and fixed a silently-dropped row in `quotation-clean.csv`
   (`DSM-26QUO-0238`) — same embedded-CR bug as `DSM-26QUO-0194`/`-0208` from
   the original closeout, missed by the earlier cleanup pass. Restored from
   `quotation-real.csv`.
5. Fixed a client master naming error (`PT. KOPERASI KARYAWAN BERSATU
SEJAHTERA` → `KOPERASI KARYAWAN BERSATU SEJAHTERA`; a koperasi isn't a
   PT).
6. Applied all 55 decisions to working copies of the five source CSVs
   (outside the repo, under
   `~/Downloads/Work/Projects/dsm-sheet-export/corrected/` — originals never
   touched), dry-ran each tab to verify every target document resolved as
   decided, then ran the real (non-dry-run) import for all five tabs against
   local Supabase.
7. Marked Task 20/21's two stale manual-check checkboxes in `tasks/todo.md`
   as superseded by Task 33's real-data closeout (they predate Task 33's
   normalized-schema rebuild and were never actually actionable against it).
8. End-of-session checkpoint: `bun run test` 313/313, `bunx tsc --noEmit`
   clean, `bun run lint` 12 pre-existing warnings only (no errors), `bun run
build` succeeds.

Nothing in this session touched a remote Supabase project. The corrected
CSVs and the decided review workbook
(`Phase-11-Import-Review-DECIDED.xlsx`) live outside the repo in the Downloads
folder mentioned above, not committed anywhere.

## What happened this session (2026-07-20, post-import UX/bugfix session)

Starting point: the owner started actually using the app after the Phase 11
import-review reconciliation, and reported concrete problems one at a time.
Full detail in `.superpowers/sdd/p11-post-import-ux-fixes-report.md`; short
version:

1. **Dashboard crash fixed** — `/dashboard` threw and fell to the error
   boundary because `dashboard-selectors.ts` indexed a per-member target
   array without a bounds guard; a member with no seeded `targets` row
   (empty array) triggered it. Fixed 4 unguarded sites.
2. **Global search and notifications built** — both were fully decorative
   (no `value`/`onChange`, no click handler) despite looking functional.
   Search now does client-side lookup across client/RFQ/quotation/SO into a
   grouped dropdown; notifications now derive from today/overdue tasks.
   `ClientPickerField` (shared by every "create X" dialog) rebuilt as a
   searchable combobox instead of a scroll-only dropdown.
3. **Sales Orders made editable** (client, owner, PO, date, line items) —
   triggered by the owner finding a real SO whose client showed "—".
   Root cause: correct `client_id`, but the client's `owner_id` (set by the
   Phase 11 bulk import's client-matching heuristic) differed from the SO's
   own owner, and RLS correctly hid it. Scale check: **21 of 189 imported
   Sales Orders and 74 of 400 commercial documents** have this same
   mismatch. New migration `20260720000000_add_sales_order_edit_support.sql`
   adds a `client_search_index` view (any active user can look up any
   client's id+name, not gated by `clients_select`'s ownership rule),
   reopens `client_id`/`owner_id` as edit-form-and-RLS-checked columns on
   `sales_orders` (owner decision — reverses part of
   `20260719041351_harden_normalized_document_permissions.sql`), and adds a
   trigger so `sales_orders.total_value` stays in sync with its items
   (didn't exist before; a real gap once item editing was allowed). Applied
   via `supabase migration up --local`, not `db reset` (would have wiped
   the real 586-document import, which isn't seed-sourced). 4 pre-existing
   RLS tests updated (not deleted) to match the new, narrower contract.
4. **Twelve leftover mock/demo clients deleted** (with their mock
   tasks/orders) — both live and from `seed.sql` — verified first that none
   had real `Imported` data attached. `PT. HARIFF DAYA TUNGGAL ENGINEERING`
   looked like mock data too but has 27 real imported sales orders — kept.
5. **Sales Performance dashboard composition changed** (owner decision,
   display-only) — Andri Sutomo dropped, Adhitya Wirambara and Leli Al
   added despite their `profiles.role` being `manager`. No RLS/role change.
6. **Product Name backfilled from Description** (owner decision, reverses
   part of the original Phase 11 import design) — 1,102 of 1,106 historical
   line items had `product_name` null with the real text sitting in
   `description`; moved into `product_name`, `description` cleared.

Checkpoint: `bunx tsc --noEmit` clean, `bun run lint` 0 errors, **`bun run
test` 314/314**, `bun run build` succeeds. Committed as `7aecd2e` on `main`;
working tree clean; **not pushed at that time**. As of the 2026-07-22 handoff
refresh, `7aecd2e` is in the current `origin/main` ancestry.

**Flagged, not yet acted on** (see the report for detail — don't silently
build these without asking first):

- New Sales Order header/item edits aren't logged to Activity Log yet (the
  tax editor on the same page is).
- The ~94 remaining owner-mismatched documents (95 minus the one fixed)
  are not bulk-corrected — the new edit form is one-at-a-time.
- Search/notifications/SO-edit/product-name UI changes were verified via
  `tsc`/`lint`/`test`/`build` only, not a live browser click-through —
  Chrome DevTools MCP was disconnected for most of this session. Do a
  manual pass before treating this as fully proven.

**Resolved in the 2026-07-20 follow-up session (see bottom section):**
`public.profiles` no longer has a `Hendra Wijaya` row — confirmed mock data,
deliberately deleted (not restored) — see below for detail. Do not treat that
old line above as still open.

## What happened this session (2026-07-20, pipeline permissions/FK bugfix session)

Starting point: the owner (Adhitya) kept using the app after the post-import
UX session above and reported more concrete problems, one at a time, mostly
via screenshots. Three commits landed: `77d637a`, `aad642f`, `48c1cd4`.

1. **Removed Hendra Wijaya entirely** (owner decision — he is confirmed
   mock/placeholder data, not a real team member). Deleted his
   `public.profiles`/`auth.users` rows from the live local DB and from
   `supabase/seed.sql`. This broke the dev role switcher's "Manager" login,
   which was hardcoded to sign in as `hendra@local.dsm.test` — fixed by
   repointing `ROLE_LOGIN.manager` in `src/context/role-context.tsx` to
   `leli@local.dsm.test` (an existing real manager), and the matching
   fallback display name in `_app.settings.tsx`.
2. **Fixed a systemic pipeline stage-vocabulary bug.** The owner supplied a
   screenshot of the correct 7 weighted stages (Client Request for Quotes
   15%, Quotes Sent 30%, Negotiation 55%, Hot Prospect 75%, Commit 90%,
   Closed Won 100%, Closed Lost 0%). `commercial-stages.ts` already had the
   right weights, but `business-rules.ts`, `domain.ts`,
   `_app.pipeline.tsx`, `PipelineCardDrawer.tsx`, and
   `PipelineAnalytics.tsx` each had independently hardcoded **old** stage
   names that never matched real data — this dumped almost every Pipeline
   card into a fallback column, and made the Dashboard's "Waiting PO Value"
   KPI, "Quotation Funnel", and "Forecast vs Achievement" always show
   wrong/zero figures (`dashboard-selectors.ts`, `_app.reports.tsx` had
   duplicate hand-rolled forecast math using the old names too). Fixed by
   making `COMMERCIAL_STAGES` (`commercial-stages.ts`) the single source of
   truth everywhere, and routing all forecast math through the existing
   `forecastValue()` function instead of ad hoc duplicates.
3. **Restricted pipeline stage moves to the document owner.** Previously any
   Sales or Manager could drag/edit any card, which just meant Sales users
   silently hit an RLS-driven failure when they didn't own the card. Added
   an ownership check (`canMoveItem`/`canEdit` in `_app.pipeline.tsx` and
   `PipelineCardDrawer.tsx`) — Sales can only move/edit cards they own;
   Manager/Super Admin remain unrestricted, matching the existing
   `sales_orders_update` RLS pattern.
4. **Fixed the Owner search/filter dropdowns silently excluding two
   managers with a real book of business.** Adhitya Wirambara ("G.M.
   Manager" role = `manager` in the DB) and Leli Al both personally own
   clients (Adhitya: 4 including PT. Putra Arga Binangun and PT. Symphos
   Electric; Leli: 26 — more than any Sales rep), but
   `listSalesTeamProfiles()` only queried `role = 'sales'`, so neither
   ever appeared in the Owner filter on Pipeline/Clients/Tasks/Sales
   Orders/Reports/Commercial views. Fixed by widening the query to
   `role IN ('sales', 'manager')`, keeping only Sales + those two named
   managers (Super Admin stays excluded per Phase 12). Simplified
   `dashboardSalesTeam()` in `dashboard-selectors.ts`, which had
   separately hardcoded the same two managers just for Dashboard/target
   views — now redundant, removed to avoid double-counting.
5. **Fixed the Pipeline card drawer failing on every single save** —
   `"Gagal menyimpan perubahan" / permission denied for table
commercial_documents`. Root cause: `PipelineCardDrawer.tsx`'s
   `saveChanges()` always sent `ownerId` in the update patch, even when
   unchanged — but a Phase 11 hardening migration
   (`20260719041351_harden_normalized_document_permissions.sql`)
   deliberately revokes `UPDATE` on `owner_id` for `commercial_documents`
   (RFQ/Quotation ownership isn't reassignable from the client, unlike
   Sales Orders). Any UPDATE that touches that column in its SET clause
   fails regardless of whether the value actually changes. Fixed by never
   sending `ownerId`, and turning the Owner field read-only in
   `PipelineCardDrawer.tsx` and `CommercialDetailPage.tsx` (owner
   reassignment for these documents genuinely isn't supported by the DB —
   this isn't a UI bug, it's DB-enforced by design).
6. **Fixed a systemic `commercial_item_id`/`commercial_document_id` FK
   mismatch** — `"Gagal memindahkan pipeline card" / insert or update on
table "activity_log" violates foreign key constraint
"activity_log_commercial_item_id_fkey"`. The legacy `commercial_item_id`
   column on `activity_log`, `tasks`, and `follow_up_logs` now only
   references a **frozen historical snapshot table**
   (`private.legacy_commercial_items_20260718`) created during Phase 11
   normalization — confirmed via `pg_constraint` that no live table named
   `public.commercial_items` exists anymore, and confirmed via direct query
   that **zero** rows in `tasks`/`activity_log` actually rely on the legacy
   column (everything live already resolves through
   `commercial_document_id`). Every call site that passed a normalized
   document's `.id` into the `commercialItemId:` field of `logActivity()`
   or `createTask()` was therefore writing an id that can never exist in
   the frozen snapshot, and always failed with this FK violation. Fixed in
   6 files: `_app.pipeline.tsx`, `PipelineCardDrawer.tsx`,
   `CommercialDetailPage.tsx`, `LogCommercialFollowUpDialog.tsx`,
   `LogFollowUpDialog.tsx` (`src/components/tasks/`), and `_app.tasks.tsx`
   — all now pass `commercialDocumentId:` instead. Also fixed
   `LogCommercialFollowUpDialog.tsx`'s "Perbarui Next follow-up" checkbox,
   which called the same broken `updateCommercialItem(..., {
nextActionDate })` pattern already fixed in Pipeline earlier this
   session — it now creates a follow-up task instead (same as the adjacent
   "Buat task follow-up berikutnya" checkbox), without double-creating a
   task if both boxes are checked.
7. **Fixed one remaining stale stage name.** `_app.tasks.tsx`'s "Move to
   Waiting PO" task action (found while reviewing item 6, not separately
   reported by the owner) wrote the stage literal `"Waiting PO"`, which
   isn't one of the 7 real stages from item 2's refactor — the correct
   current name is `"Commit"` (same mapping already used for the
   Dashboard's "Waiting PO Value" KPI). Fixed the write and the menu label
   ("Move to Commit").

Checkpoint after every change in this session: `bunx tsc --noEmit` clean,
`bun run lint` 0 errors (12 pre-existing warnings only, same baseline as
before), **`bun run test` 314/314**, `bun run build` succeeds. Three commits
on `main`: `77d637a`, `aad642f`, `48c1cd4`. Working tree clean except an
untracked `.planning/` directory (unrelated tooling output, not part of this
work, left alone). **Not pushed to `origin`.**

**Flagged from this session, not yet acted on:**

- No live browser click-through of any of the fixes above — Chrome DevTools
  MCP was unavailable this session too. The owner confirmed each fix by
  reproducing the original error screenshot-by-screenshot after each patch,
  but a systematic pass (drag every stage, edit every field, log a
  follow-up from every entry point) hasn't been done.
- Given how many call sites shared the exact same
  `commercial_item_id`/`commercial_document_id` bug (item 6), it's worth
  grepping for `commercialItemId:` as a literal object-key pattern
  periodically — any _new_ code that copies an older call site risks
  reintroducing it. There is no lint rule or type-level guard against it;
  the two fields are both optional strings on the same input type, so
  TypeScript can't catch the mix-up.
- The legacy `commercial_item_id` / `private.legacy_commercial_items_20260718`
  archive table itself was not touched or cleaned up — it's just historical
  evidence, left as-is.

## What happened this session (2026-07-21, Client Detail/Client List real-data wiring)

Starting point: all 41 tasks in `tasks/todo.md` were complete (Phases 0–12), but the Client Detail page and Client List page still had hardcoded `"—"` placeholders for revenue/commercial metrics. The owner (Aditya) reported that "PT. PUTRA ARGA BINANGIN" didn't appear in the client picker form but existed in SO records.

### Changes committed as `2c1c196`:

**Client Detail page (`_app.clients.$clientId.tsx`):**

- All 7 MetricCards (Total Revenue, PPN, Non-PPN, RFQ Pipeline, Commit, Prototype Paid, Prototype FOC) wired to real data via `clientRevenueMetrics()` / `clientCommercialMetrics()` selectors in `dashboard-selectors.ts`
- "Waiting PO" card renamed to "Commit" — shows all commercial items at Commit stage (not just Quotation type)
- 6 tabs replaced hardcoded `NotYetAvailable` placeholders:
  - Overview → Upcoming Actions: top 5 tasks with status badges
  - Tasks tab: full task table (title, method, due date, status, priority)
  - Commercial Items tab: all items (type, description, stage, est. value)
  - Quotations tab: RFQ + Quotation items (number, description, stage, est. value)
  - Sales Orders tab: all SOs sorted newest first (SO number, type, tax, date, value)
  - Revenue History tab: revenue breakdown (SO number, source, tax, prototype status, revenue)
- Dead `NotYetAvailable` component removed

**Client List page (`_app.clients.index.tsx`):**

- PPN/Non-PPN columns computed from real `sales_orders` data via `enrichedRows` + `revenueByTax()`
- Saved Views dropdown wired to actual filters: "Butuh Perhatian" sets `overdueOnly`, "Prospect Aktif" sets `statuses=["Prospect"]`, "Semua Semua" calls `resetFilters()`
- Dead spending-range code block removed (incomplete refactor from earlier)

**Owner-mismatch fix (PT. PUTRA ARGA BINANGIN not in client picker):**

- Root cause: the `client_search_index` view only exposed `id` + `name`. `useClientResolution()` used `listClients()` (RLS-scoped by `clients_select`), so clients owned by another sales rep didn't appear in Create dialog pickers
- Scale check: the SO edit support migration already documented "21 of 189 imported Sales Orders and 74 of 400 commercial documents have this same owner mismatch"
- New migration `20260721000000_expand_client_search_index.sql` adds `owner_id` to the view
- `searchClients()` now returns `{id, name, ownerId}`
- `useClientResolution()` in `ClientPicker.tsx` switched from `listClients()` to `searchClients()` — the picker now shows ALL clients regardless of owner

**CreateRecordDialogs:**

- Added `["clients"]` query invalidation after SO creation so `spendingYtd` stays fresh

**Code review findings fixed (same commit):**

- WR-01: Removed dead spending-range code block in `_app.clients.index.tsx:135-141`
- WR-02: Saved Views dropdown wired to actual filters
- WR-03: Added `["clients"]` query invalidation in `CreateRecordDialogs.tsx`

**Verification:** `bunx tsc --noEmit` clean, `bun run lint` 0 errors (12 pre-existing warnings only), `bun run build` succeeds.

**Migration to apply:** `20260721000000_expand_client_search_index.sql` — needs `bunx supabase db reset` (local) or `supabase migration up` to apply. This is required for the client picker fix to take effect.

## What happened this session (2026-07-21, remote migration push + data restoration)

Starting point: commit `2c1c196` had the Client Detail/List wiring and client-picker fix. The owner approved pushing all pending migrations to the remote Supabase project, then browser verification revealed wrong achievement numbers.

### What was done

1. **Pushed 22 pending migrations to remote.** `bunx supabase db push` applied everything from `20260718020000` through `20260721000000` to the remote project `qhtfixgbcpcitokeryxb` (DSM Sales Web App V2, Northeast Asia/Tokyo). All 28 migrations are now in sync between local and remote (`bunx supabase migration list` shows identical columns). Owner approval was given explicitly before pushing.

2. **Found remote DB has zero business data.** The remote has the schema and 2 real profiles (`adhitya@dutasolusimetalindo.com` = manager, `superadmin@dutasolusimetalindo.com` = super_admin) but 0 clients / 0 SOs / 0 tasks. The real business data only exists in the local Supabase. `.env.local` was briefly pointed at the remote, then reverted to `http://127.0.0.1:54321`.

3. **Root-caused the achievement mismatch (22.84M vs expected 24.1M).** After a local `db reset` wiped the data, the first re-import used the repo's fixture CSVs (`tests/fixtures/sheets-import/`) — these are **pre-decision** versions. Two SOs got quarantined:
   - `DSM-26SO082` (Rp1.13B): three distinct customer POs (PO/2026/VI/RM/041, /042, /043) on one internal SO → `header_conflict`. Owner's prior decision: keep one consolidated SO with all three POs merged in the header (same pattern as HARIFF multi-PO merge).
   - `DSM-26SO111` (Rp177.5jt): a shipping row had unit price but empty Total Price → `invalid_paid_money`, quarantining the whole document. Owner's prior decision: compute the missing total from qty × unit price.
   - The 115 "unmatched_customer" SO rows were just monthly summary rows in the CSV (e.g. `Rp1.766.299.000,JANUARI`) — correctly ignored.

4. **Re-imported from the corrected CSVs.** The decision-applied files live outside the repo at `~/Downloads/Work/Projects/dsm-sheet-export/corrected/` (`so-2026-corrected.csv`, `quotation-corrected.csv`, `np-2026-corrected.csv`, `proty-corrected.csv`, `hariff-corrected.csv`). Full `db reset` + re-import of all 5 tabs produced:
   - **189 sales orders, Rp24.153.354.852 (24.15M)** — matches the owner's expected 24.1M
   - 397 commercial documents / 720 items
   - Remaining rejections (1 SO, 31 quotation, 1 NP) match the previous session's documented "Keep rejected" decisions (blank rows, missing prices).

### Key learnings for future sessions

- **Always import from `~/Downloads/Work/Projects/dsm-sheet-export/corrected/*-corrected.csv`, never from `tests/fixtures/sheets-import/`.** The repo fixtures are pre-decision and will silently lose Rp1.31B of SO value plus 12 quotation documents to `header_conflict` quarantines.
- The import script needs `SUPABASE_URL=http://127.0.0.1:54321` and a `SUPABASE_SERVICE_ROLE_KEY` JWT signed with the local JWT secret (`super-secret-jwt-token-with-at-least-32-characters-long`, from `docker exec supabase_db_DSM_SALES_WEB_APP_V2 env`).
- `bunx supabase db push` only affects the remote; local needs `bunx supabase db reset` to pick up new migrations.
- Chrome DevTools MCP was added to `.mcp.json` (`chrome-devtools` server, `--isolated`) — needs a session restart to activate.
- The dev server runs on whatever port is free (8083 this session; 8080-8082 were occupied).

## What happened this session (2026-07-21, browser verification + spending_ytd fix + SO edit audit trail)

Starting point: commit `1ecb133` (client owner reassign/handover feature, 4 iterative RLS bugfix commits) was the tip of `main`, pushed. The owner asked for a live browser verification pass over previously-flagged and previously-closed items, using Chrome DevTools MCP against production (`dsmsalescrm.vercel.app`) since local Supabase had no business data at session start (0 sales_orders/commercial_documents/tasks rows — a `db reset` had happened without a follow-up manual CSV re-import, likely during the reassign-feature debugging session).

### Browser verification findings

- **Actor-name misattribution bug (real, reproduced live on production):** `ChangeStatusDialog`/`ReassignOwnerDialog` on the Client Detail page passed `ownerName` (the client's Sales owner) as `actorName` instead of the actually logged-in user. Reproduced on production: logged in as Super Admin, reassign dialog showed "Dicatat sebagai Leli Al" (the client's owner) instead of "Super Admin". Fixed in `_app.clients.$clientId.tsx` by deriving `currentActorName` from `authSource === "real" ? realProfile.name : ...` and passing that instead.
- **`spending_ytd` stale-data bug (real, both Client Detail and Client List):** `clients.spending_ytd` is a raw stored column the Sheet import never populated — always 0 or stale. Client Detail's "Spending YTD" MiniStat and Client List's Spending YTD/sort/filter column both read straight from it. Fixed by recomputing from real `sales_orders` via the same `clientRevenueMetrics()` / `revenueByTax()` selectors the PPN/Non-PPN columns already use (see below).
- **Verified working, no fix needed:** global search, Client Detail tabs/metrics with real data, Client List PPN/Non-PPN columns, Sales Orders "Nama Product" column, SO Edit dialog structure, notifications empty state, client picker (owner-mismatch fix from the previous session) in Create dialogs.
- **Confirmed still-open, deliberately not acted on:** ~95 owner-mismatched SOs/commercial documents (21/189 SOs, 74/400 commercial docs per the 2026-07-20 SO-edit-support migration's own count) need case-by-case correctness judgment, not a mechanical bulk fix — left as backlog.

### Changes committed as `843af1f` (pushed to `origin/main`, migration applied to remote)

- **`_app.clients.$clientId.tsx`**: actor-name fix (above) + `spending_ytd` fix — header MiniStat now reads `revenue.totalRevenue` (already computed via `clientRevenueMetrics()`).
- **`_app.clients.index.tsx`**: `enrichedRows` now overrides `spendingYtd` with `revenueByTax().total`, same pattern as the existing `ppn`/`nonPpn` override. `ClientsTable.tsx` reads `r.spendingYtd` for sort/column/filter, so all three benefit from one change.
- **SO edit Activity Log gap closed**: editing a Sales Order's header (Klien/Owner/PO/Tanggal) or a line item was previously unaudited — only tax-type changes were logged. Added two new `activity_kind` enum values (`sales_order_header_change`, `sales_order_item_change`) via migration `20260721100000_add_sales_order_edit_activity_kinds.sql`, added labels to `activity-log.ts`, and wired `logActivity()` calls into `EditSalesOrderHeaderDialog.save()` and `SalesOrderItemRow.save()` in `_app.sales-orders.$soId.tsx` (threading `soId`/`soNumber`/`clientId`/`ownerId` props down as needed).
- Verification: `bunx tsc --noEmit` clean, `bun run lint` clean (one prettier auto-fix needed), `bun run build` succeeds. `bun run test`: 294/314 pass — the 20 failures (`permission denied for table activity_log`/`follow_up_logs`) were confirmed via `git stash` to be **pre-existing on the unmodified baseline**, not caused by this session's changes.

### Real production bug found and fixed as `9a12281` (pushed to `origin/main`, migration applied to remote)

While locally verifying the SO edit Activity Log wiring end-to-end (couldn't test on production — auto-mode correctly blocks form submissions/clicks against live business data), found that **Sales Order item editing was completely broken on production**, unrelated to this session's other work:

- Root cause: `sales_order_items.description` had column-level `UPDATE` grant to `authenticated` since `20260719041351`. Earlier the same day, `20260721000001_merge_description_into_product_name.sql` dropped the column, and `20260721000002_add_description_to_sales_order_items.sql` re-added it — but Postgres column privileges don't survive `DROP COLUMN`/`ADD COLUMN`, and the re-add never restored the grant.
- Impact: `updateSalesOrderItem()` always includes `description` in its `UPDATE` SET list, and Postgres denies the _entire_ statement if privilege is missing on _any_ column in the SET list — so every SO item edit failed with "permission denied for table sales_order_items" for every role.
- Fix: one-line migration `20260721110000_fix_sales_order_items_description_grant.sql` (`grant update (description) on table public.sales_order_items to authenticated;`).
- Verified by seeding a throwaway test SO directly in local Postgres (local dev server's `.env.local` currently points `VITE_SUPABASE_URL` at the **production** REST API, not local — see note below — so browser-driven local testing wasn't possible; a standalone script signing in as the `leli@local.dsm.test` seed account exercised the exact same mutation + `logActivity()` calls the UI makes). Confirmed both the item update and the new `sales_order_item_change` log row succeed only after the grant fix; failed with the same "permission denied" error before it. Test fixture data deleted afterward.
- Post-push production spot-check (after the owner ran `bunx supabase db push --linked` themselves, since the agent is blocked from running it): Client List and Client Detail both show correct non-zero Spending YTD matching PPN totals; latest Vercel deployment confirmed `Ready`.

### Important environment note for future sessions

- **`.env.local`'s `VITE_SUPABASE_URL` currently points at the production Supabase REST API** (`https://qhtfixgbcpcitokeryxb.supabase.co`), not `http://127.0.0.1:54321`. Confirmed by watching `bun run dev`'s network requests — every REST call went to the production host, and the local dev-role-switcher's sign-in attempts (`nur@local.dsm.test` etc., seed accounts that only exist in the local Auth) correctly got rejected by production Auth. `bun run test` is unaffected because `supabase/tests/helpers.ts` reads a separate `SUPABASE_URL` env var (unset, defaults to local) — the earlier 294/314 test result was genuinely local. But **`bun run dev` right now is not a safe local sandbox** — treat any UI testing done via `bun run dev` as hitting real production data until `.env.local` is repointed. Historical note: file tools were permission-denied in that prior session; during the 2026-07-22 handoff refresh, `.env.local` was readable and still pointed at production.

## What happened this session (2026-07-22, unused-code cleanup + client database feature)

Starting point: commit `9a12281` was the tip of `main`, pushed, both its migrations applied to remote. The owner asked to find unused code/files and any open tasks/flags, then to build a new "client database" feature.

### Unused-code audit (committed as `e98b003`; pushed by 2026-07-22 handoff refresh)

Ran `knip` and verified every hit against actual usage before acting (many knip hits are false positives: vendored shadcn/ui primitives nobody's used yet, and `manage-team-member` which IS used but via a runtime `supabase.functions.invoke()` string knip can't trace). Real, verified-dead findings:

- **Deleted**: `updateClientOwner()` (`src/lib/data/clients.ts`) — the old raw `.update({owner_id})` client-reassign implementation, superseded by the `reassign_client_owner` RPC called directly in `_app.clients.$clientId.tsx` (the SECURITY DEFINER fix from `1ecb133`). Nothing called it anymore.
- **Deleted**: `src/components/shell/PhaseStub.tsx` — unused placeholder, no references anywhere, no task ever mentioned it.
- **Confirmed intentional, left alone**: `src/components/clients/StatusAuditTrail.tsx` (documented orphan since Task 23, see that section above), `createCommercialItem()`/`createCommercialItemsBatch()` in `commercial-items.ts` (deliberate poison-pill stubs that `throw new Error("NORMALIZED_DOCUMENT_INPUT_REQUIRED")`, guarding against stale pre-normalization callers — not dead code).
- All 45 tasks in `tasks/todo.md` and all `tasks/plan.md` checkpoints were already complete; no open TODO/FIXME comments anywhere in `src/`.

### Client database feature: company info + up to 3 contact persons (committed as `371ac81`; pushed by 2026-07-22 handoff refresh)

Owner request (Indonesian): turn the existing 69 clients into a real client database — Contact Person 1/2/3 (nama/email/telepon/HP each) plus alamat perusahaan, connected to existing revenue/status data. Went through full plan-mode: 1 Explore agent (schema/UI/RLS-pattern discovery) → 1 Plan agent (design) → 2 AskUserQuestion clarifications (extra fields: owner picked bidang usaha + website + catatan, declined NPWP; UI placement: card in Overview tab, not a 7th tab) → written plan approved via ExitPlanMode → executed.

**Design**: flat nullable columns on `clients` (not a child table — exactly 3 fixed UI slots, so flat columns let `select("*")`/RLS/grants absorb them with zero policy changes). New columns: `address`, `industry`, `website`, `notes`, `cp1_name/email/phone/mobile`, `cp2_*`, `cp3_*` (16 total). New `activity_kind` value `client_details_change`, logged once per save with a coarse "what changed" summary (field-group names only, never phone/email values in the log).

**Migrations**:

- `supabase/migrations/20260722060000_add_client_company_details.sql` — the 16 columns AND a column-level `grant update (...) on table public.clients to authenticated`
- `supabase/migrations/20260722060001_add_client_details_activity_kind.sql` — the enum value, own transaction boundary (Postgres rule)

**Real bug caught before shipping**: initial exploration wrongly assumed `clients` had a table-level UPDATE grant. It's actually column-level (`20260718164503_apply_super_admin_rls_matrix.sql:277-284`), originally listing only `name, status, source, spending_ytd, last_fu, next_fu`. Without the grant statement above, every edit from the new dialog would have failed with "permission denied for table clients" — the same class of bug as the `sales_order_items.description` issue fixed in `9a12281` last session. This time the new RLS tests in `supabase/tests/clients.test.ts` caught it locally (via a full `bunx supabase db reset` cycle) before it ever reached production. **Lesson for future schema work on this table: always check `20260718164503_apply_super_admin_rls_matrix.sql` for the current column-level UPDATE grant list before assuming `select("*")`-style table grants cover new columns — clients, tasks, commercial_items, and sales_orders are ALL column-level-grant tables per that migration, not just clients.**

**Data layer** (`src/lib/data/clients.ts`, `src/lib/domain.ts`): `Client.contacts` is a fixed-length-3 tuple `[ClientContact, ClientContact, ClientContact]`; `updateClientDetails(id, patch)` writes empty-string form fields as explicit `null` so clearing a field actually clears it.

**UI**: new `src/components/clients/EditClientInfoDialog.tsx` (react-hook-form + zod, same pattern as `AddClientDialog.tsx`); new local `ClientInfoCard`/`InfoRow` components in `_app.clients.$clientId.tsx`, rendered at the top of the Overview tab, "Edit Info" button gated by the same `canEditStatus` boolean used for status editing (sales-own/manager/super_admin; executive read-only).

**Tests**: extended `supabase/tests/clients.test.ts` (own-client update succeeds, other-sales-rep's-client denied, executive denied, manager succeeds on any client, fresh row has null defaults) and `supabase/tests/activity-log.test.ts` (new enum value inserts cleanly). `bun run test`: 300 pass / 20 fail — the 20 are the same documented pre-existing `permission denied for anon` baseline from prior sessions, unaffected by this work.

**Verification**: `bunx tsc --noEmit` clean, `bunx eslint` clean (one auto-fix pass), `bun run build` succeeds, plus a standalone script (mirrors `EditClientInfoDialog.save()` exactly) signed in as the `nur@local.dsm.test` seed account, proved a real update + `client_details_change` log entry + null-clearing all round-trip correctly against local Supabase, then cleaned up its own test data.

**NOT done / explicitly deferred**: no live browser walkthrough of the new UI (same `.env.local`-points-at-production blocker as last session — see the environment note above; used the direct-Supabase script approach instead, per the owner's approved plan). Git push is no longer pending as of this handoff refresh (`371ac81` is in the current `origin/main` ancestry), and remote Supabase migrations were verified in sync through `20260722080000`.

## What happened next (2026-07-22, contact position + product display fixes)

Starting point for this refresh: `main` and `origin/main` both pointed to
`816a7fe`. The prior handoff text still described `e98b003` and `371ac81` as
local-only, which was no longer true.

### Contact position field (committed as `8234f63`, pushed)

- Added `position`/`Jabatan` to each of the three client contact-person slots.
- Touched `src/components/clients/EditClientInfoDialog.tsx`,
  `src/lib/data/clients.ts`, `src/lib/domain.ts`,
  `src/routes/_app.clients.$clientId.tsx`, and `supabase/tests/clients.test.ts`.
- Added migration `supabase/migrations/20260722070000_add_client_contact_position.sql`.
- Fixed a pre-existing test expectation while there: executive client-info
  update denial is represented as zero rows affected because RLS filters the
  row, not as a thrown error.

### Client Detail product/description columns (committed as `192dbfe`, pushed)

- Updated `src/routes/_app.clients.$clientId.tsx`.
- Client Detail Quotations/RFQ table now shows the first line item's `Nama Product`.
- Client Detail Sales Orders table now shows first line item's `Nama Product`
  and `Deskripsi`.
- Multi-item documents follow the existing `+N lainnya` display pattern from the
  main Sales Orders list.

### Commercial item product-name reconciliation (committed as `816a7fe`, pushed)

- Added migration
  `supabase/migrations/20260722080000_merge_description_into_product_name_commercial_items.sql`.
- Reason: production-shaped imported commercial document item rows mostly stored
  the useful product name in `description` while `product_name` was `NULL`, so
  the newly-added `Nama Product` columns would show empty values for most
  RFQ/Quotation rows.
- Migration mirrors the earlier sales-order-items reconciliation pattern from
  `20260721000001_merge_description_into_product_name.sql`.
- Remote Supabase migration status was checked during this handoff edit:
  `bunx supabase migration list --linked` showed local and remote matched
  through `20260722080000`.

### Important environment note (refreshed 2026-07-22)

- **`.env.local`'s `VITE_SUPABASE_URL` still points at the production Supabase REST API** (`https://qhtfixgbcpcitokeryxb.supabase.co`), not `http://127.0.0.1:54321`. `bun run dev` is therefore still not a safe local sandbox until that value is intentionally repointed. Keep using direct local-Postgres/service-role scripts for local functional verification, or explicitly switch `.env.local` to local before browser testing.

## Suggested next steps for Codex

### Dynamic monthly sales targets (2026-07-22, uncommitted at handoff edit time)

- Owner requested: `target bulanan sales di ganti, menjadi dinamis, tiap bulan berbeda`.
- No schema migration was needed. `public.targets` was already one row per
  `sales_id/year/month` with `unique (sales_id, year, month)`.
- Replaced the flat Settings target editor with a 12-month grid per sales rep
  in `src/routes/_app.settings.tsx`. Sales Manager/Super Admin UI can edit
  month-by-month values and save only changed months.
- Replaced `upsertYearlyTarget()` with `upsertMonthlyTargets()` in
  `src/lib/data/targets.ts`.
- Hardened dashboard/report target math in `src/lib/data/dashboard-selectors.ts`
  and `src/routes/_app.reports.tsx` so target values are read by the `month`
  field, not by array index. This prevents YTD/monthly totals from going wrong
  if rows are sparse or returned out of order.
- Updated `supabase/seed.sql` comment: seed still provides initial baseline rows,
  but every month is independently editable.
- Verification performed: `bun --env-file=.env.local test src/lib/data/dashboard-selectors.test.ts`
  passed 5/5; `bunx tsc --noEmit` passed; targeted `bunx eslint` on changed
  TS/TSX files passed; `bun run build` passed. Full `bun run lint` was manually
  stopped after it ran too long without output, so use targeted lint evidence
  unless rerunning full lint later.

### 2026 official sales target data (2026-07-22, remote applied and pending git commit at handoff edit time)

- Owner provided `/Users/macbook/Downloads/Target_Penjualan_Tim_Sales_2026.md`
  and asked to enter targets by sales name and month.
- Added migration `supabase/migrations/20260722105512_seed_2026_sales_targets.sql`.
  It upserts 60 target rows for 2026 by matching `public.profiles.name`:
  Adhitya Wirambara, Leli Al, Nur Iman, Siti Zulaika (Ika), and Feni
  Cahyaningtias. The migration raises an exception if fewer than all five names
  are present, so target data cannot be partially seeded silently.
- Updated `supabase/seed.sql` with the same month-by-month values so a future
  local `db reset` starts with the official 2026 target baseline.
- Local verification: `bunx supabase migration up --local` applied the target
  migration; local query confirmed each sales has 12 months and yearly totals
  match the source file (Adhitya 14.4B, Leli 12B, Nur 9.6B, Siti 6B, Feni 6B).
  Monthly team totals also match the file: 2.5B, 3B, 3.5B, 4B, 4.5B, 5B, 4.5B,
  4.5B, 5B, 4B, 3.5B, 4B.
- Remote read-only verification before push: linked project profile names exist
  and are active for all five target owners.
- Remote migration was applied to linked project `qhtfixgbcpcitokeryxb` with
  `bunx supabase db push --linked`; `bunx supabase migration list --linked`
  confirmed local and remote match through `20260722105512`.
- Remote post-apply verification query confirmed the same yearly totals and
  monthly team totals as local/source file.
- Validation: `bun --env-file=.env.local test src/lib/data/dashboard-selectors.test.ts`
  passed 5/5; `bunx tsc --noEmit` passed; targeted `bunx eslint` passed;
  `bun run build` passed. `bunx supabase db lint --local` still reports
  pre-existing temp-table lint errors in historical import functions, unrelated
  to this target migration.

1. Read this file's most recent 2026-07-22 continuation first (official 2026 sales target data), then dynamic monthly sales targets, then contact position + Client Detail product/description fixes + commercial item product-name migration reconciliation, then the unused-code cleanup + client database feature section, then the 2026-07-21 browser verification + spending_ytd fix + SO edit audit trail, then remote migration push + data restoration, then Client Detail/Client List wiring, then the 2026-07-20 sessions.
2. **Git push is not pending as of this refresh**: `main` matched `origin/main` at `816a7fe`. Recheck `git status --short --branch` before relying on this because it is runtime state.
3. Remote Supabase migration status for the newest migrations (`20260722060000`, `20260722060001`, `20260722070000`, `20260722080000`) was verified in sync during this refresh. Still get explicit owner approval before any future remote mutation, then verify again with `bunx supabase migration list --linked`.
4. **Before adding any new column to `clients`, `tasks`, `commercial_items`, or `sales_orders`, check the column-level UPDATE grant list in `20260718164503_apply_super_admin_rls_matrix.sql`** and add the new column to a `grant update (...)` statement in the same migration — these four tables do NOT have table-level UPDATE grants, only specific columns are grantable. This bit twice now (`sales_order_items.description` in the prior session, caught after the fact; `clients`' new columns this session, caught before shipping via local RLS tests).
5. Do a live browser pass on the new "Info Perusahaan & Kontak" card/dialog on Client Detail (once deployed), plus the still-outstanding items from prior sessions: global search, notifications, the Sales Order edit dialog/inline item editor, the Client List page (PPN/Non-PPN/Spending YTD columns, Saved Views), and the client picker in all Create dialogs.
6. Preserve Activity Log immutability, ownership attribution, task/follow-up/activity foreign keys, and archived legacy evidence.
7. The ~95 owner-mismatched SOs/commercial documents (21/189 SOs, 74/400 commercial docs) remain an open data-quality backlog item — needs case-by-case correctness judgment, not a mechanical bulk fix. Don't attempt it without the owner's explicit sign-off on the correction approach.
8. Git has real commits through `816a7fe` and was synced with `origin/main` during this handoff refresh. Treat it normally (stage intentionally, don't `add -A` blindly, never force-push/rewrite history on this Lovable-connected repo).
