# Task List: Supabase Backend & Data Layer

Plan: `tasks/plan.md` · Spec: `specs/backend-data-layer.md`

---

## Phase 0: Local Environment Setup

## Task 1: `supabase init` + Supabase JS client scaffold

**Description:** Initialize the local Supabase project structure (`supabase/config.toml`) and add the `@supabase/supabase-js` browser client. This is entirely local — no real Supabase account needed yet.

**Acceptance criteria:**

- [x] `supabase/config.toml` exists (created by `supabase init`)
- [x] `@supabase/supabase-js` is in `package.json` dependencies
- [x] `src/lib/supabase.ts` exports a configured client reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from env
- [x] `.env.local.example` documents the two required env vars (no real secrets committed)

**Verification:**

- [x] Build succeeds: `bun run build`
- [x] `bun run lint` passes

**Dependencies:** None

**Files likely touched:**

- `supabase/config.toml` (new)
- `src/lib/supabase.ts` (new)
- `.env.local.example` (new)
- `package.json`

**Estimated scope:** Small (1-2 files)

---

## Task 2: Local stack smoke test

**Description:** Start the local Supabase stack (Postgres + Auth + Studio, all in Docker) and confirm it runs. No schema yet — just proving the tooling works end-to-end before we build anything on top of it.

**Acceptance criteria:**

- [x] `bunx supabase start` succeeds and prints local URLs (API, Studio, DB)
- [x] Local Studio (a web dashboard, like phpMyAdmin but for Supabase) is reachable in a browser
- [x] `bunx supabase stop` cleanly shuts it down

**Verification:**

- [x] Manual check: you open local Studio in your browser and see the empty database — I'll walk you through what you're looking at

**Dependencies:** Task 1

**Files likely touched:** None (infrastructure check only)

**Estimated scope:** Small (0 files — verification task)

---

## Phase 1: Identity Foundation

## Task 3: `profiles` + role migration

**Description:** Create the `profiles` table that links a Supabase Auth user to one of the three app roles (`sales`, `manager`, `executive`) and to a `team_members`-equivalent row (name, initials, email — mirroring `src/lib/mock/team.ts`'s `TeamMember` shape). This table is what RLS policies check against to know "who is asking."

**Acceptance criteria:**

- [x] Migration creates `profiles` table: `id` (references `auth.users`), `role` (enum: `sales`/`manager`/`executive`), `name`, `initials`, `email`
- [x] RLS enabled on `profiles`: a user can read their own row; managers can read all rows; executives can read all rows (read-only); no one can self-assign a role via the app (role changes are a manual/admin-only SQL step, per spec §"Auth account bootstrap")
- [x] Migration is idempotent-safe (uses `create table if not exists` / standard Supabase migration conventions)

**Verification:**

- [x] `bunx supabase db reset` applies cleanly with no errors
- [x] Manual check in local Studio: table + RLS policies visible and match the description above

**Dependencies:** Task 2

**Files likely touched:**

- `supabase/migrations/<timestamp>_profiles.sql` (new)

**Estimated scope:** Small (1 file)

---

## Task 4: Local RLS smoke test for `profiles`

**Description:** First automated test in the repo (introduces `bun:test`). Proves that a `sales` role JWT cannot read another user's profile, and a `manager`/`executive` JWT can read all profiles.

**Acceptance criteria:**

- [x] `bun:test` is runnable via `bun test`
- [x] Test creates 3 fake local users (one per role) against the local stack, using `tests/fixtures/` for role data
- [x] Test asserts: sales JWT → own profile only; manager JWT → all profiles; executive JWT → all profiles, no writes allowed

**Verification:**

- [x] `bun test` passes
- [x] Re-running `bun test` twice in a row gives the same result (no flaky state leakage from local DB)

**Dependencies:** Task 3

**Files likely touched:**

- `supabase/tests/profiles.test.ts` (new)
- `tests/fixtures/roles.ts` (new)

**Estimated scope:** Small (2 files)

---

## Phase 2: Clients Vertical Slice

## Task 5: `clients` table migration + RLS

**Description:** Create the `clients` table matching `PRD.md` §7 (name, status, source, owner, spending YTD, etc. — same fields as `src/lib/mock/data.ts`'s `Client` type) with RLS: sales sees/edits only their own (`owner_id = auth.uid()`), manager sees/edits all, executive read-only all.

**Acceptance criteria:**

- [x] Migration creates `clients` table with all `PRD.md` §7 client-profile fields
- [x] RLS policies match the three-role scope above
- [x] Seed data in `supabase/seed.sql` derived from `src/lib/mock/data.ts`'s `CLIENTS` array (same records, for local dev realism)

**Verification:**

- [x] `bunx supabase db reset` applies migration + seed cleanly
- [x] Manual check in local Studio: seeded clients visible, correct columns

**Dependencies:** Task 4

**Files likely touched:**

- `supabase/migrations/<timestamp>_clients.sql` (new)
- `supabase/seed.sql` (new or appended)

**Estimated scope:** Small (1-2 files)

---

## Task 6: `src/lib/data/clients.ts`

**Description:** Write the query/mutation functions that replace `src/lib/mock/client-selectors.ts`, matching the same return shapes so calling components need minimal changes.

**Acceptance criteria:**

- [x] Exports functions covering what `client-selectors.ts` currently provides (list scoped by role, get by id, create, update status)
- [x] Every function goes through `src/lib/supabase.ts`, no direct fetch/SQL elsewhere
- [x] Errors from Supabase are thrown, never silently swallowed or falling back to mock data

**Verification:**

- [x] `bun run build` succeeds
- [x] `bun run lint` passes
- [x] Manual check: a small throwaway script or Studio SQL confirms a call to `listClientsForRole("sales", <uid>)` returns only that user's clients

**Dependencies:** Task 5

**Files likely touched:**

- `src/lib/data/clients.ts` (new)

**Estimated scope:** Small (1 file)

---

## Task 7: Wire Client List + Client Detail to real data

**Description:** Switch the Client List and Client Detail routes/components from `src/lib/mock/*` imports to `src/lib/data/clients.ts`. This is the first user-visible change — after this task, the Clients feature is genuinely live.

**Acceptance criteria:**

- [x] `src/routes/_app.clients.index.tsx`, `_app.clients.$clientId.tsx`, and their components no longer import from `src/lib/mock/*` for client data
- [x] Role switching in the UI (`useRole()`) still correctly scopes visible clients, now backed by real RLS instead of a mock filter
- [x] No other route/feature is touched (Dashboard, Tasks, etc. still on mock — that's expected and fine at this point)

**Verification:**

- [x] `bun run dev`, manually browse to Clients as each of the three roles, confirm expected scoping
- [x] `bun run build` succeeds
- [x] `bun test` still passes (profiles + clients RLS tests)

**Dependencies:** Task 6

**Files likely touched:**

- `src/routes/_app.clients.index.tsx`
- `src/routes/_app.clients.$clientId.tsx`
- `src/components/clients/*` (whichever import client data directly)

**Estimated scope:** Medium (3-5 files)

---

## Phase 3: Tasks / Follow-Ups Vertical Slice

## Task 8: `tasks` table migration + RLS

**Description:** Create the `tasks` table (follow-ups) per `PRD.md` §7, mirroring `src/lib/mock/data.ts`'s `Task` type, with the same three-role RLS pattern as `clients`, plus a foreign key to `clients` and optionally `commercial_items` (added later in Task 10 — nullable FK for now).

**Acceptance criteria:**

- [x] Migration creates `tasks` table with all `PRD.md` §7 follow-up fields (Tanggal FU, Metode FU, Hasil FU, next action, etc.)
- [x] RLS matches the clients pattern (sales own-only, manager all, executive read-only)
- [x] Seed data derived from `src/lib/mock/data.ts`'s `TASKS` array

**Verification:**

- [x] `bunx supabase db reset` applies cleanly
- [x] `bun test` passes a new tasks RLS test (same pattern as Task 4)

**Dependencies:** Task 7 (Clients slice complete and verified first)

**Files likely touched:**

- `supabase/migrations/<timestamp>_tasks.sql` (new)
- `supabase/seed.sql`
- `supabase/tests/tasks.test.ts` (new)

**Estimated scope:** Medium (3 files)

---

## Task 9: `src/lib/data/tasks.ts` + wire My Tasks / dashboard widgets

**Description:** Same pattern as Tasks 6+7 combined, for the task/follow-up domain — data layer plus UI wiring for My Tasks and any dashboard "open/overdue" widgets.

**Acceptance criteria:**

- [x] `src/lib/data/tasks.ts` matches `src/lib/mock/mock/selectors.ts`'s task-related return shapes
- [x] My Tasks route and relevant dashboard widgets read from it, not mock
- [x] Role scoping verified same as Task 7

**Verification:**

- [x] `bun run dev`, manual check across roles
- [x] `bun run build` succeeds; `bun test` passes

**Dependencies:** Task 8

**Files likely touched:**

- `src/lib/data/tasks.ts` (new)
- `src/routes/_app.tasks.tsx`
- relevant `src/components/tasks/*`, dashboard task widgets

**Estimated scope:** Medium (3-5 files)

---

## Phase 4: Commercial Items Vertical Slice

## Task 10: `commercial_items` table migration + RLS

**Description:** Create the `commercial_items` table per `PRD.md` §7 (RFQ/Quotation/Direct Order/Prototype/Customer PO/Sales Order types, stage lists per source flow), matching `src/lib/mock/data.ts`'s `CommercialItem` type. Same RLS pattern.

**Acceptance criteria:**

- [x] Migration creates `commercial_items` with all fields, including `stage` as a value constrained to the correct stage list for its `sourceFlow` (RFQ/Repeat/Prototype stages differ — enforce via check constraint or app-level validation, whichever is simpler; document the choice)
- [x] RLS matches the established pattern
- [x] Seed data derived from `COMMERCIAL_ITEMS` mock array

**Verification:**

- [x] `bunx supabase db reset` applies cleanly
- [x] `bun test` passes new commercial_items RLS test

**Dependencies:** Task 9

**Files likely touched:**

- `supabase/migrations/<timestamp>_commercial_items.sql` (new)
- `supabase/seed.sql`
- `supabase/tests/commercial-items.test.ts` (new)

**Estimated scope:** Medium (3 files)

---

## Task 11: `src/lib/data/commercial-items.ts` + wire Commercial Pipeline routes

**Description:** Data layer + UI wiring for the commercial pipeline (RFQ, Quotations, Customer PO, Prototypes, Repeat Orders routes).

**Acceptance criteria:**

- [x] `src/lib/data/commercial-items.ts` matches `commercial-selectors.ts`'s return shapes
- [x] All `_app.rfq.*`, `_app.quotations.*`, `_app.customer-po.*`, `_app.prototypes.*`, `_app.repeat-orders.*` routes read from it
- [x] Role scoping verified across roles

**Verification:**

- [x] `bun run dev`, manual check across roles and across each commercial flow type
- [x] `bun run build` succeeds; `bun test` passes

**Dependencies:** Task 10

**Files likely touched:**

- `src/lib/data/commercial-items.ts` (new)
- `src/routes/_app.rfq.*`, `_app.quotations.*`, `_app.customer-po.*`, `_app.prototypes.*`, `_app.repeat-orders.*`
- relevant `src/components/commercial/*`, `src/components/pipeline/*`

**Estimated scope:** Large (5-8 files) — **flag for possible further breakdown by flow type (RFQ vs Prototype vs Repeat) if it turns out too big in one session**

---

## Phase 5: Sales Orders & Revenue Vertical Slice

## Task 12: `sales_orders` table migration + RLS + revenue-inclusion view

**Description:** Create `sales_orders` per `PRD.md` §7 (SO type, tax type, prototype status, value, source flow), matching the mock `SalesOrder` type. Additionally create a Postgres view (or function) that implements the exact §7 revenue-inclusion rule server-side: Regular paid + Prototype Paid count toward revenue; Prototype FOC (null value) is excluded. This is the core business rule from the spec — it must live in the database, not be trusted from the client.

**Acceptance criteria:**

- [x] Migration creates `sales_orders` table with all fields, `value` nullable (null only valid when `prototype_status = 'FOC'`, enforced via check constraint)
- [x] A `revenue_recognized` view/function excludes FOC rows and correctly sums PPN/Non-PPN
- [x] RLS matches the established pattern
- [x] Seed data derived from `SALES_ORDERS` mock array (includes at least one Paid and one FOC prototype row, for testability)

**Verification:**

- [x] `bunx supabase db reset` applies cleanly
- [x] Manual SQL check in Studio: querying the revenue view against seed data gives the expected total (calculable by hand from the seed data for a gut-check)

**Dependencies:** Task 11

**Files likely touched:**

- `supabase/migrations/<timestamp>_sales_orders.sql` (new)
- `supabase/seed.sql`

**Estimated scope:** Medium (2 files)

---

## Task 13: `src/lib/data/sales-orders.ts` + wire Revenue/Dashboard reports

**Description:** Data layer + wiring for Sales Orders route and all dashboard revenue/PPN/target widgets across the three role-specific dashboards (§8).

**Acceptance criteria:**

- [x] `src/lib/data/sales-orders.ts` queries the `revenue_recognized` view for all revenue totals — never recomputes the FOC-exclusion rule in application code
- [x] `_app.sales-orders.*` routes and dashboard revenue widgets (Sales/Manager/Executive dashboards) read from it

**Verification:**

- [x] `bun run dev`, manual check: dashboard revenue numbers match what you'd calculate by hand from seed data
- [x] `bun run build` succeeds

**Dependencies:** Task 12

**Files likely touched:**

- `src/lib/data/sales-orders.ts` (new)
- `src/routes/_app.sales-orders.*`
- `src/components/dashboard/*` revenue-related widgets

**Estimated scope:** Medium (3-5 files)

---

## Task 14: Revenue classification unit tests

**Description:** Automated proof (not just manual spot-check) that the §7 revenue-inclusion rule holds, per the spec's Success Criteria.

**Acceptance criteria:**

- [x] Test seeds a Regular paid SO, a Prototype Paid SO, and a Prototype FOC SO
- [x] Test asserts the FOC row is excluded from every revenue/target total (implemented in `src/lib/data/dashboard-selectors.ts`, the actual home of the aggregation math — not `sales-orders.ts`, which only lists raw rows)
- [x] Test asserts PPN vs Non-PPN split is correct

**Verification:**

- [x] `bun test` passes

**Dependencies:** Task 13

**Files likely touched:**

- `src/lib/data/dashboard-selectors.test.ts` (new — path adjusted from the original plan once Task 13 landed the aggregation logic in `dashboard-selectors.ts` rather than `sales-orders.ts`)

**Estimated scope:** Small (1 file)

---

## Task 14b: Real `activity_log` table _(added after Phase 5 — not in the original plan)_

**Description:** The Activity Log page (`_app.activity.tsx`) was built entirely on session-store/mock data with no real backing table anywhere in the schema. When reviewing it during Phase 5 wrap-up, you chose to build a real table now rather than leave it mock — a new scope item, not part of Tasks 12-14.

**Acceptance criteria:**

- [x] `activity_log` table + RLS (owner-scoped select, sales/manager-scoped insert, no update/delete — append-only)
- [x] `src/lib/data/activity-log.ts`: `listActivityLog()`, `logActivity()`, `getCurrentActorId()`
- [x] Wired into the one real write path that exists today: `updateClientStatus` (Client Detail page) now logs a `client_status_change` row
- [x] Activity Log page merges real rows into the existing session-store feed (additive, not a rewrite) — other event kinds (follow-ups, item/task/SO creation) stay session-store-only until those features get real write paths of their own in later phases

**Verification:**

- [x] `bun test` passes (6 new RLS tests)
- [x] `bunx tsc --noEmit`, `bun run build`, `bunx eslint` clean on touched files
- [x] Live browser check: sales-role status change on a real client produces a real activity_log row, visible on `/activity` immediately, correctly attributed and RLS-scoped

**Files touched:**

- `supabase/migrations/20260718011409_activity_log.sql` (new)
- `supabase/tests/activity-log.test.ts` (new)
- `src/lib/data/activity-log.ts` (new)
- `src/routes/_app.clients.$clientId.tsx`, `src/routes/_app.activity.tsx`

**Estimated scope:** Medium (5 files)

---

## Phase 6: Real Project Checkpoint _(human-gated)_

## Task 15: You create/select the Supabase project

**Description:** This is **your** task, not mine — I cannot create a Supabase account or project on your behalf. When you're ready: sign up / log in at supabase.com, create a new project (pick a name, region, and database password — save that password somewhere safe, e.g. a password manager), and note the **project reference** (a short ID shown in the project's Settings → General).

**Acceptance criteria:**

- [x] A Supabase project exists
- [x] You have the project reference string ready to give me

**Verification:** N/A — human action, confirmed by you telling me the reference is ready

**Dependencies:** Task 14 (all local work verified first — no reason to link early)

**Files likely touched:** None

**Estimated scope:** N/A (manual, off-repo)

---

## Task 16: Link and push

**Description:** Once you've given me the project reference, I link this local repo to your real Supabase project and push all the migrations built so far. This is the first and only point where anything touches a real, non-local database.

**Acceptance criteria:**

- [x] `supabase link --project-ref <ref>` succeeds
- [x] `supabase db push` applies all migrations from Phases 1-5 to the real project with no errors
- [x] Real project's Studio shows the same tables/RLS policies as local

**Verification:**

- [x] Manual check together: real project Studio matches local Studio structurally
- [x] No seed data pushed (real project starts empty of client data — seed.sql is local-dev-only)

**Dependencies:** Task 15 (you provide the reference)

**Files likely touched:**

- `.env.local` (your real project's URL/anon key — not committed)

**Estimated scope:** Small (config only)

---

## Phase 7: Auth Bootstrap

## Task 17: Document + verify the manual Manager signup procedure

**Description:** Write down, step by step, how you sign up as the first user via Supabase Auth on the real project, and then how I (or you, following my instructions) run the one-time idempotent SQL step that assigns your account the `manager` role once you give me your new account's UUID.

**Acceptance criteria:**

- [x] A short doc (can live in this task's checklist or a `docs/` note) walks through: where to sign up, how to find your UUID in Studio, and the exact SQL snippet to run
- [x] The SQL snippet is idempotent (safe to run twice) and requires no default/hardcoded credentials
- [x] You've successfully logged into the app against the real project as a `manager`

**Verification:**

- [x] Manual check: you can log in and the app shows manager-scoped views (confirmed — you navigated Dashboard through Customer PO signed in as manager)

**Dependencies:** Task 16 (and Task 17a — needed a real login screen to exist first)

**Files likely touched:**

- `docs/auth-bootstrap.md` (new — the step-by-step procedure)
- `supabase/snippets/bootstrap_manager_role.sql` (new — the idempotent assignment step, parameterized by UUID)

**Estimated scope:** Small (2 files + manual steps)

---

## Task 17a: Real login screen _(added — not in original plan)_

**Description:** Task 17's original verification ("you can log in and the app shows manager-scoped views") assumed a real login screen existed. It didn't — the sidebar role switcher only ever signed into hardcoded local seed accounts (`src/context/role-context.tsx`), which don't exist on the real project and can't authenticate a real manager account. Discovered as a gap while starting Task 17; user chose to build a real login screen now rather than defer it.

**Acceptance criteria:**

- [x] `src/routes/login.tsx` — email/password form, calls `supabase.auth.signInWithPassword`, redirects to `/` on success, shows inline error on failure
- [x] `role-context.tsx` distinguishes a real (non-seed) session from a dev session on load: real sessions fetch `role`/`name`/`initials`/`email` from `profiles` and skip the seed sign-in entirely
- [x] `TopBar.tsx` shows the real user's name/role in a real session, hides the "Prototype Role" switcher (self-role-changing isn't allowed per RLS), and wires "Sign out" to `supabase.auth.signOut()`
- [x] Local dev flow (role switcher, seed accounts) is unchanged when no real session is present

**Verification:**

- [x] `bun run build` succeeds
- [x] `bunx tsc --noEmit` clean on touched files (two pre-existing unrelated errors in `CommercialViews.tsx` untouched)
- [x] `bunx eslint` clean on touched files after `bun run format`
- [x] `bun test` passes (42/42, unaffected — this task touches no data layer)

**Dependencies:** None (parallel to Task 17's doc/snippet work)

**Files touched:**

- `src/routes/login.tsx` (new)
- `src/context/role-context.tsx`
- `src/components/shell/TopBar.tsx`

**Estimated scope:** Medium (3 files)

---

## Task 18: Targets table + wire remaining dashboards

**Description:** Create the `targets` table (currently hardcoded `MONTHLY_TARGETS_PER_SALES` in mock data), editable by managers, and wire the last remaining dashboard widgets that still reference mock data.

**Acceptance criteria:**

- [x] Migration creates `targets` table (per-sales-rep monthly targets), RLS: manager can write, all roles can read their applicable scope
- [x] `src/lib/data/targets.ts` + dashboard widgets wired to it
- [x] All three role dashboards (§8) are now fully backed by real data

**Verification:**

- [x] `bun run dev`, manual check across all three dashboards (Sales, Sales Manager) — targets, achievement %, and the Settings → Target editor all confirmed live against real Postgres data in the browser
- [x] `bun test` passes (49/49, incl. 7 new targets RLS tests)

**Dependencies:** Task 17

**Files touched:**

- `supabase/migrations/20260718020000_targets.sql` (new)
- `supabase/seed.sql`, `supabase/tests/targets.test.ts` (new)
- `src/lib/data/targets.ts` (new)
- `src/lib/data/dashboard-selectors.ts` (removed the mock `MONTHLY_TARGETS_PER_SALES`/`COMPANY_MONTHLY_TARGET` plumbing, added `targetsFor`/`companyMonthlyTarget`/`monthlyTargetValue`/`ytdTargetValue`, threaded real target data through `monthlyRevenueTrend`, `ytdCumulativeTrend`, `monthlyRevenueTrendInRange`, `targetPerSales`, `salesPerformanceInRange`, `salesPerformance`)
- `src/hooks/use-dashboard-data.ts` (added the `targets` query)
- `src/components/dashboard/TargetCharts.tsx`, `RevenueTrendChart.tsx`, `ActivityComplianceCard.tsx`, `ExecutiveCards.tsx`, `SalesPerformanceTable.tsx`
- `src/routes/_app.dashboard.tsx`, `_app.reports.tsx`
- `src/lib/data/clients.ts` (added `email` to `listSalesTeamProfiles`)
- `src/routes/_app.settings.tsx` (Target tab wired to real data, manager-only writes; fixed a stale-state bug in the save flow found during manual testing — see below)

**Note:** manual browser testing surfaced a real bug in the Settings → Target editor: a leftover mock-era `useMemo` "resync from upstream" pattern in `TargetRow` raced against the async save + query invalidation, leaving the input visibly reverted and the Save button stuck disabled after a successful write (the underlying data _did_ save correctly — confirmed via direct DB queries — this was a display-only regression). Fixed by removing the stale resync logic; verified via a real save in the browser (toast confirmation, correct total recalculation, and a direct DB check).

**Estimated scope:** Large (14 files, larger than planned — target data touched more call sites across the dashboard/reports/settings surface than expected)

---

## Phase 8: Google Sheets Import

## Task 19: Get real spreadsheet column mapping from you

> **Superseded target note (2026-07-18):** This task accurately records the first legacy importer decision, but ADR-001 now requires normalized document headers/items, preserved Qty/UOM/No PO/Description, Quotation import, and counter seeding. See Phase 11 Task 33 and the rewritten `scripts/import-sheets-mapping.md`.

**Description:** Before writing any import code, I need to see the real DSM spreadsheet's structure — a column-header export, or a screenshot, or you describing each column. No guessing at field mapping.

**Acceptance criteria:**

- [x] A documented mapping exists: spreadsheet column → `sales_orders`/`clients`/`commercial_items` field
- [x] Ambiguous or DSM-specific columns are flagged and discussed with you before proceeding

**Verification:** N/A — informational task, confirmed once mapping doc is agreed

**Dependencies:** Task 18 (core schema stable before mapping to it)

**Files touched:**

- `scripts/import-sheets-mapping.md` (new — documents the agreed mapping across 4 tabs: `SO 2026`, `NP 2026`, `PROTY`, `Hariff`)

**Estimated scope:** Small (1 file, mostly conversation-driven)

---

## Task 20: Build sanitized test fixtures from that mapping

**Description:** Create fake-but-structurally-real spreadsheet fixtures in `tests/fixtures/` that match the real column layout from Task 19, but with made-up data — safe to commit, no real client info.

**Acceptance criteria:**

- [x] Fixtures cover: a normal Regular PPN row, a Non-PPN row, a Prototype Paid row, a Prototype FOC row, and at least one deliberately ambiguous/unclassifiable row
- [x] No real client names/values from the actual DSM sheet appear in fixtures

**Verification:**

- [x] ~~Manual check: you confirm the fixture structure looks like the real sheet's columns (not the data)~~ — **Superseded (2026-07-19):** this check was against the pre-Phase-11 legacy fixture set. Task 33's real-data reconciliation (five real source-tab CSVs run through the normalized importer, see `.superpowers/sdd/p11-import-closeout-report.md`) verified column structure against the actual sheet directly, making this fixture-only spot-check moot.

**Dependencies:** Task 19

**Files touched:**

- `tests/fixtures/sheets-import/so-2026.csv` (new) — normal PPN row, a multi-item SO (two rows sharing one `so_number`, per the mid-task addition), unmatched-customer row, unmatched-sales row, unexpected-blank-value row
- `tests/fixtures/sheets-import/np-2026.csv` (new) — normal Non-PPN row
- `tests/fixtures/sheets-import/proty.csv` (new) — Prototype Paid row, Prototype FOC row
- `tests/fixtures/sheets-import/hariff.csv` (new) — normal Hariff/PPN row, backdated-PO row (placeholder detection signal — real one still unconfirmed, flagged for Task 21)
- `tests/fixtures/sheets-import/README.md` (new) — answer key: expected classification per fixture row, for Task 21's golden-file tests to assert against

**Estimated scope:** Small (5 files)

---

## Task 21: Import script + historical classification logic + golden-file tests

> **Historical implementation note:** The checked items below prove the legacy importer that existed at the time. They do not mean the importer is ready for the accepted normalized schema. Real import is blocked until Task 33 passes.

**Description:** Build `scripts/import-sheets.ts`: reads a spreadsheet export, classifies each historical row per §15's rules (PPN/Non-PPN preserved from source; Prototype+filled-amount → Paid; Prototype+empty-amount → FOC; unclassifiable → flagged for manual review, never silently included), and writes to `sales_orders`. Uses the service-role key, run manually via `bun`, never in the browser bundle.

**Acceptance criteria:**

- [x] Script accepts `--file` and `--tab` flags — **changed from the originally planned `--spreadsheet-id`/`--sheet-name`**: the project owner chose manual CSV export over live API/URL access, so the sheet never needs to be link-shared or wired to a service account (see decision note in `scripts/import-sheets.ts`'s header comment)
- [x] Classification logic matches §15 exactly, with a `--dry-run` mode that reports what _would_ be imported/flagged without writing
- [x] Ambiguous rows are written to a review log (a `.jsonl` file, gitignored — decided against a new DB table since this is a one-off backfill concern, not something the app UI queries), never silently included in revenue
- [x] Golden-file test runs the classification logic against Task 20's fixtures and asserts exact expected output

**Verification:**

- [x] `bun test` passes the golden-file test using only `tests/fixtures/` — no live Sheets access (11 new tests, 60/60 total suite passes)
- [x] Manual dry-run + real-write check against local Supabase using the actual fixture files — confirmed all 4 tabs classify correctly (`SO 2026`: 3 import/3 review, `NP 2026`: 1/0, `PROTY`: 2/0, `Hariff`: 1/1), and a real (non-dry-run) write correctly resolved client/sales names to real UUIDs, verified via direct DB query, then reset back to clean seed data
- [x] ~~Manual dry-run check together against the real sheet, once you're ready to test it for real (needs a real CSV export from you)~~ — **Superseded (2026-07-19):** the legacy importer this task built was never run against the real sheet; Task 33 rebuilt the importer for the normalized schema and ran it against the real five-tab export, reconciling 549 accepted headers / 1,005 items with zero mismatches and 127 rows correctly quarantined for manual review. See `.superpowers/sdd/p11-import-closeout-report.md`.

**Dependencies:** Task 20

**Files touched:**

- `scripts/import-sheets.ts` (new) — CLI entrypoint
- `scripts/import-sheets/classify.ts` (new) — pure classification logic (no I/O), including the decided name-matching strategy (case/whitespace-insensitive exact match, no fuzzy matching) and month-name parsing (English + Indonesian + numeric)
- `scripts/import-sheets/parse.ts` (new) — CSV → per-tab row parsing, using the already-installed `xlsx` package rather than adding a new CSV dependency
- `scripts/import-sheets.test.ts` (new) — golden-file tests against Task 20's fixtures
- `.gitignore` — added `import-review-log-*.jsonl`

**Estimated scope:** Large, as flagged — ended up not needing the two-session split; the "manual file export, no live API" decision (see AskUserQuestion in conversation) removed most of the I/O complexity that made this feel large originally

---

## Phase 9: Cleanup

## Task 22: Remove remaining `src/lib/mock/*` production usage; move fixtures

**Description:** Final sweep — confirm nothing in `src/components/*` or `src/routes/*` still imports from `src/lib/mock/*`, move any remaining deterministic data needed for tests into `tests/fixtures/`, and delete the rest of `src/lib/mock/`.

**Acceptance criteria:**

- [x] `grep -r "lib/mock" src/routes src/components` returns nothing
- [x] `src/lib/mock/` is deleted
- [x] All Success Criteria in `specs/backend-data-layer.md` are verifiably met locally

**Verification:**

- [x] `bun run build` succeeds
- [x] `bun test` full suite passes (296/296)
- [x] Manual walkthrough of the changed surfaces across Sales, Manager, and Executive

**Dependencies:** Task 21

**Files likely touched:**

- `src/lib/mock/*` (deleted)
- any stray import sites found by the grep above

**Estimated scope:** Medium (varies — depends on grep results)

**Scope discovery (2026-07-18):** ran the grep. 32 files import from
`src/lib/mock/*`. Audited every one:

- ~15 files only import types, UI-constant stage lists (`RFQ_STAGES` etc.),
  or the pinned "today" clock (`NOW`/`CURRENT_MONTH`/`CURRENT_YEAR`) — all
  intentional per this plan's "Types stay shared during migration"
  architecture decision. No action needed.
- 6 files (`AddClientDialog.tsx`, `TopBar.tsx`, parts of
  `LogFollowUpDialog.tsx`/`TaskDetailDrawer.tsx`/`_app.activity.tsx`/`_app.tasks.tsx`)
  have a genuine leftover read — they pull `TEAM`/`CLIENTS`/`COMMERCIAL_ITEMS`
  from mock arrays even though a real equivalent (`listOwners`,
  `listSalesTeamProfiles`, `listCommercialItems`, `listActivityLog`) is
  already imported in the same file. Trivial swaps, not done yet — bundle
  with Task 23's PR since that's the first Phase 10 task touching this
  area.
- 13 files depend on six real, unbuilt features — broken out as Phase 10
  (Tasks 23–30) rather than crammed into this "final sweep" task.

This task now blocks on Phase 10 landing (or being explicitly descoped) —
its own remaining scope is just the 6 leftover-read swaps plus deleting
`src/lib/mock/*` once nothing references it.

**Re-audit (2026-07-19), after Tasks 23–30 landed:** re-checked all 6
files named above.

- `AddClientDialog.tsx`, `TopBar.tsx`, `LogFollowUpDialog.tsx`,
  `TaskDetailDrawer.tsx`, `_app.tasks.tsx` — the "genuine leftover read"
  no longer exists in any of these five. Each now imports only types
  (`Task`, `TaskStatus`, `ClientStatus`, `Role`) or the intentionally
  shared `CLIENT_STATUSES`/`NOW` constants — already covered by the
  "types stay shared" exception above. Real write-path work (Tasks 23–27)
  already did the swap this task was waiting on. No further action.
- `_app.activity.tsx` — still merges `FOLLOW_UP_LOGS` (mock) and
  `useAllSessionOrders` (mock session-store) into the feed alongside real
  `listAllFollowUps()`/`listActivityLog()` rows. Confirmed with the user
  (2026-07-19) this is the intended interim design, not an oversight: it's
  explicitly commented in the file ("Seed follow-up logs" / "other event
  kinds stay session-store-only until their own features get wired to
  real writes") and provides historical/demo activity that has no real
  table to source from yet. Decision: keep as-is. Not a defect.

**Final completion (2026-07-19):** the earlier descoped disposition is
superseded. Shared types, role/date-range types, stage/status rules, the
deterministic business clock, report filters, and local preferences were
moved to canonical non-mock modules. Activity Log now uses only persisted
`activity_log` and `follow_up_logs` rows, including
`sales_order_created`. Dashboard CSV/XLSX/PDF exports consume the same
backend snapshot as the visible Dashboard. `src/lib/mock/` was deleted,
an architecture guard prevents reintroduction, 296/296 tests pass,
typecheck/build/lint complete without errors, and Sales/Manager/Executive
browser UAT is clean at 320/768/1024/1440 widths.

---

## Task 23: Client status audit trail → real `activity_log`

**Description:** `StatusAuditTrail.tsx` (shown on the Client Detail page)
reads from `useClientStatusAudit` in the mock session-store — a separate,
non-persistent audit mechanism that duplicates what `activity_log` already
captures for real. `updateClientStatus` already writes a
`client_status_change` row to `activity_log` (Task 14b). This is a
data-source swap, not new backend work — no migration needed.

**Acceptance criteria:**

- [x] `StatusAuditTrail.tsx` reads from a new `listClientStatusHistory()`
      (narrow query: `client_id` + `kind = 'client_status_change'`, joined
      against `profiles` for actor name/role) instead of `useClientStatusAudit`.
      Also fixed a real bug found along the way: the status-change dialog
      collected a manager's correction note but silently discarded it —
      now it's appended into `activity_log.detail` and surfaced in the
      audit trail.
- [x] The 6 leftover-read swaps from the Task 22 audit (`AddClientDialog.tsx`,
      `TopBar.tsx`, and the `TEAM`/`CLIENTS`/`COMMERCIAL_ITEMS` reads in
      `LogFollowUpDialog.tsx`/`TaskDetailDrawer.tsx`/`_app.activity.tsx`/`_app.tasks.tsx`)
      are switched to their already-imported real equivalents
- [x] `useClientStatusAudit`, `recordStatusChange`, `useClientStatusOverride`
      deleted from `session-store.ts` as part of Task 24, once
      `PipelineCardDrawer.tsx` no longer referenced them

**Verification:**

- [x] `bun run build` succeeds; `bun run lint` clean (0 errors/warnings
      from this task's files; 5 pre-existing unrelated errors untouched)
- [x] `bun test` — 60/60 pass
- [x] Manual check in the browser: changed `PT Astra Komponen Nusantara`'s
      status as manager with a note, confirmed the toast, confirmed the
      change appears on `/activity` immediately with the correct client
      link, actor name ("Rendra Wijaya"), and the note text — then
      confirmed `StatusAuditTrail.tsx` itself isn't currently mounted
      anywhere in the app (pre-existing, orphaned component; its data
      fix is complete and correct regardless, nothing to wire up here)
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** None (fully self-contained, safe to do first)

**Files touched:**

- `src/lib/data/activity-log.ts` (new `listClientStatusHistory()`)
- `src/lib/data/clients.ts` (`listOwners()` extended to include `email`/`role`)
- `src/routes/_app.clients.$clientId.tsx` (note now persisted into `activity_log.detail`)
- `src/components/clients/StatusAuditTrail.tsx`
- `src/components/clients/AddClientDialog.tsx`, `src/components/shell/TopBar.tsx`
- `src/components/tasks/LogFollowUpDialog.tsx`, `TaskDetailDrawer.tsx`
- `src/routes/_app.activity.tsx`, `_app.tasks.tsx`

**Estimated scope:** Small (9 files, no schema changes)

---

## Task 24: Commercial item create + stage-change write paths

**Description:** `CreateRecordDialogs.tsx` (RFQ/Quotation/Direct Order/
Prototype/Customer PO creation) and every stage-change action in
`PipelineCardDrawer.tsx`/`CommercialDetailPage.tsx`/`_app.pipeline.tsx`
still write to session-store (`addCommercialItem`, `setCommercialOverride`,
`recordCommercialHistory`, `useCommercialHistory`). `commercial_items` has
existed since Task 10 for reads/RLS; this adds the missing writes. The
`activity_kind` enum already has `commercial_item_created` and
`commercial_item_stage_change` — no migration needed for the audit trail
itself.

**Acceptance criteria:**

- [x] `src/lib/data/commercial-items.ts` gains `createCommercialItem()` and
      `updateCommercialItem()` (a general patch, superseding the originally
      planned narrower `updateCommercialItemStage()` — needed to also cover
      owner/next-action/quotation/PO/SO-number/tax-type edits from
      `CommercialDetailPage.tsx`), plus a `describeCommercialItemChanges()`
      formatter, both writing a matching `activity_log` row (mirroring
      `updateClientStatus`'s pattern)
- [x] `CreateRecordDialogs.tsx`'s commercial-item creation flows (RFQ,
      Quotation) call the real function; `PipelineCardDrawer.tsx`,
      `CommercialDetailPage.tsx`, `_app.pipeline.tsx`'s stage-change
      actions call the real update — plus a 3rd call site the original
      research missed: `_app.tasks.tsx`'s "Move to Waiting PO" quick action
- [x] `useCommercialItemsWithOverrides` (the intentional read-side hybrid)
      deleted entirely — every call site now reads `listCommercialItems()`
      directly, no merge layer left
- [x] `addCommercialItem`, `setCommercialOverride`, `clearCommercialOverride`,
      `useCommercialOverrides`, `recordCommercialHistory`, `useCommercialHistory`,
      `useSessionCommercial`, `useAllSessionCommercial` deleted from
      `session-store.ts`, along with their now-dead `CommercialOverride`/
      `CommercialHistoryEntry` types and `__getAllCommercialHistory`
- [x] Bonus: `_app.activity.tsx`'s feed now reads `commercial_item_created`/
      `commercial_item_stage_change` straight from real `activity_log`
      instead of the mock session-store, so newly created RFQs/Quotations
      and stage moves show up in the unified Activity Log for real

**Verification:**

- [x] `bunx tsc --noEmit` clean (2 pre-existing, unrelated router-typing
      errors in `CommercialViews.tsx` aside — not touched by this task)
- [x] `bun run lint` clean for every file this task touched (pre-existing,
      unrelated `react-hooks/rules-of-hooks` errors in 5 untouched route
      files remain, as before)
- [x] `bun run build` succeeds; `bun run test` — 60/60 pass
- [x] Manual check in the browser (Sales Manager role): moved an RFQ's
      stage via `PipelineCardDrawer` ("RFQ Received → Quotation in
      Progress") — pipeline board updated live, drawer's own history panel
      showed the real change attributed to "Rendra Wijaya", and `/activity`
      showed it immediately with a working "Buka RFQ →" link. Created a
      new RFQ via "Add RFQ" on a client page — toast confirmed, and it
      appeared on `/activity` as "Commercial Baru" with the correct client
      link. Both wrote real rows the DB reset below then cleared.
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** Task 23 (establishes the activity-log-swap pattern this
task repeats for a second domain)

**Files touched:**

- `src/lib/data/commercial-items.ts` (`createCommercialItem()`,
  `updateCommercialItem()`, `describeCommercialItemChanges()`)
- `src/lib/data/activity-log.ts` (`listCommercialItemHistory()`)
- `src/lib/data/clients.ts` (`listOwners()` extended with `email`/`role` —
  reused from Task 23, needed here for actor-name lookups)
- `src/components/clients/CreateRecordDialogs.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx`
- `src/components/commercial/CommercialDetailPage.tsx`,
  `CommercialViews.tsx`, `LogCommercialFollowUpDialog.tsx`
- `src/routes/_app.pipeline.tsx`, `_app.tasks.tsx`, `_app.activity.tsx`
- `src/lib/mock/commercial-selectors.ts` (dropped to just `stagesForFlow()`)
- `src/lib/mock/session-store.ts` (dead commercial-item/status-override
  functions and types removed)

**Estimated scope:** Medium (11 files + 2 new data-layer functions) — larger
than originally estimated once the 3rd call site and the activity-feed
merge cleanup were folded in.

---

## Task 25: Task create + status-change + archiving write paths

**Description:** `CreateTaskDialog.tsx`, `TaskDetailDrawer.tsx`, and
`_app.tasks.tsx` still create/update/archive tasks via session-store
(`addSessionTask`, `setTaskOverride`, `clearTaskOverride`,
`setTaskArchived`, `recordTaskHistory`). `tasks` has existed since Task 8
for reads/RLS. `activity_kind` already has `task_created` and
`task_status_change` — no migration needed for the audit trail.
**Archiving has no column to write to yet** — the real `tasks` table has
no `archived`/`is_archived` field, so this task also needs a small
migration adding one (or reusing `status` if "archived" should just be a
`TaskStatus` value — decide when implementing, matching how `PROTOTYPE_STAGES`
etc. modeled similar closed/done states).

**Acceptance criteria:**

- [x] `src/lib/data/tasks.ts` gains `createTask()` (extended to accept
      `commercialItemId`), `updateTaskStatus()`, a general `updateTask()`
      patch function (needed for the detail drawer's multi-field save,
      snooze, and bulk actions), and a `describeTaskChanges()` formatter.
      Archiving is a plain `updateTask(id, {archived})` call — decided on a
      separate boolean column rather than folding into the `TaskStatus`
      enum, since archived-vs-not is orthogonal to Today/Overdue/Done.
- [x] `CreateTaskDialog.tsx`, `TaskDetailDrawer.tsx`, `_app.tasks.tsx`,
      `LogFollowUpDialog.tsx`, and `LogCommercialFollowUpDialog.tsx` (its
      "create next task" checkbox) all call the real functions
- [x] `addSessionTask`, `setTaskOverride`, `clearTaskOverride`,
      `restoreTaskOverrides`, `useTaskOverrides`, `recordTaskHistory`,
      `useTaskHistory`, `setTaskArchived`, `useArchivedTasks`,
      `useSessionTasks`, `useSessionTasksForClient` deleted from
      `session-store.ts` — along with the `TaskOverride`/`TaskHistoryEntry`
      types and their `Store` fields
- [x] Bonus: `_app.activity.tsx`'s feed now reads `task_created`/
      `task_status_change` straight from real `activity_log` instead of the
      mock session-store, so new tasks and status/snooze/archive changes
      show up in the unified Activity Log for real
- [x] Removed the now-meaningless "session override" UI from
      `TaskDetailDrawer.tsx` (the "Diedit di sesi" badge / "Reset override"
      button) — every save is a real persisted write now, there's nothing
      to reset

**Verification:**

- [x] `bunx tsc --noEmit` clean (same 2 pre-existing, unrelated
      `CommercialViews.tsx` router-typing errors as before, untouched)
- [x] `bun run lint` clean for every file this task touched (same 5
      pre-existing, unrelated `react-hooks/rules-of-hooks` errors in
      untouched route files remain)
- [x] `bun run build` succeeds; `bun run test` — 62/62 pass (added 2 new
      data-layer tests: `updateTask()`'s `archived` flag round-trips, and
      `createTask()`'s `commercialItemId` FK link persists)
- [x] Manual check in the browser (Sales Manager role): marked a task Done
      from the inbox list (counters updated live, confirmed via reload it
      persisted — proves it's real, not session-only). Opened a task's
      detail drawer, used "+1 hari" snooze — Riwayat panel showed the real
      entry attributed to "Rendra Wijaya · manager", and `/activity` showed
      both the Done and the snooze events with working "Buka Task Inbox →"
      links. Created a new task via "Buat Task" (toast confirmed, appeared
      live in the list), then archived it via the row's quick-actions menu
      (Archived counter went 0→1, "Undo" toast offered). All writes were
      real DB rows, cleared by the `db reset` below.
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** Task 23

**Files touched:**

- `supabase/migrations/20260718030000_tasks_archived.sql` (new — adds
  `tasks.archived boolean not null default false`; no new RLS policy
  needed, the existing `tasks_update` policy already covers it)
- `src/lib/mock/data.ts` (`Task` type gains optional `archived?: boolean`)
- `src/lib/data/tasks.ts` (`updateTask()`, `describeTaskChanges()`,
  extended `createTask()`)
- `src/lib/data/activity-log.ts` (`listTaskHistory()`)
- `src/lib/data/tasks.test.ts` (2 new tests)
- `src/components/tasks/CreateTaskDialog.tsx`, `TaskDetailDrawer.tsx`,
  `LogFollowUpDialog.tsx`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx`
- `src/routes/_app.tasks.tsx`, `_app.activity.tsx`
- `src/lib/mock/session-store.ts` (dead task-override/history functions
  and types removed)

**Estimated scope:** Medium (12 files + 1 migration + 2 new data-layer
functions) — larger than the original estimate once the two follow-up
dialogs and the activity-feed merge cleanup were folded in, matching the
pattern from Task 24.

---

## Task 26: Sales Order tax-classification correction

**Description:** PRD §15: "Sales Manager can correct the tax
classification when needed." `_app.sales-orders.$soId.tsx` currently does
this via session-store (`setSalesOrderTax`, `useSalesOrderTaxOverrides`,
`useSalesOrderTaxAudit`). `sales_orders` has existed since Task 12; this
adds the one missing write path. `activity_kind` already has
`sales_order_tax_change` — no migration needed for the audit trail.

**Acceptance criteria:**

- [x] `src/lib/data/sales-orders.ts` gains `updateSalesOrderTax()`,
      manager-only at the app level (mirrors the existing `canEditTax` UI
      gate) — RLS itself is the same blanket owner-or-manager
      `sales_orders_update` policy every other field on this table already
      uses, so no new policy was added
- [x] `src/lib/data/activity-log.ts` gains `listSalesOrderTaxHistory()`
      (same "from → to\nnote" parsing convention as
      `listClientStatusHistory`), powering the "Riwayat perubahan pajak"
      panel with real data instead of the session-store audit array
- [x] `_app.sales-orders.$soId.tsx` calls the real functions instead of the
      session-store ones
- [x] `setSalesOrderTax`, `useSalesOrderTaxOverrides`, `useSalesOrderTaxAudit`
      deleted from `session-store.ts`, along with the now-dead
      `SoTaxAuditEntry` type and its `Store` fields
- [x] Bonus: `_app.activity.tsx`'s feed now reads `sales_order_tax_change`
      straight from real `activity_log` (new `so_tax_change` feed kind),
      so tax corrections show up in the unified Activity Log for real

**Verification:**

- [x] `bunx tsc --noEmit` clean (same 2 pre-existing, unrelated
      `CommercialViews.tsx` router-typing errors as before, untouched)
- [x] `bun run lint` clean for every file this task touched (same 5
      pre-existing, unrelated `react-hooks/rules-of-hooks` errors in
      untouched route files remain)
- [x] `bun run build` succeeds; `bun run test` — 62/62 pass
- [x] Manual check in the browser (Sales Manager role): opened
      `SO-26-0703` (PT Mayora Indah Tbk, Non-PPN), used "Ubah" to correct
      it to PPN with a note — toast confirmed, badge updated live, and the
      "Riwayat perubahan pajak" panel showed the real entry ("Non-PPN →
      PPN oleh Rendra Wijaya · Sales Manager — note text"). Confirmed on
      `/sales-orders` that the PPN/Non-PPN split updated live (87%→91%
      PPN, 13%→9% Non-PPN) and the row's badge changed. Confirmed on
      `/activity` the change appeared as "Koreksi Pajak SO" with a working
      "Buka Sales Order →" link.
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** Task 23

**Files touched:**

- `src/lib/data/sales-orders.ts` (`updateSalesOrderTax()`)
- `src/lib/data/activity-log.ts` (`listSalesOrderTaxHistory()`)
- `src/routes/_app.sales-orders.$soId.tsx`, `_app.activity.tsx`
- `src/lib/mock/session-store.ts` (dead SO-tax-override functions and
  types removed)

**Estimated scope:** Small (4 files, no schema change) — matched the
original estimate; the activity-feed bonus item was the only addition.

---

## Task 27: Follow-up logging (real table, matching the mockup's shape)

**Description:** `LogFollowUpDialog.tsx` records a follow-up outcome via
`addFollowUp`, which also marks the related task Done and can spawn a
next-action task. **Decided:** build a real `follow_up_logs` table
matching the mock `FollowUpRecord` shape closely (per the project owner's
"as per mockup" call) — a separate table, not new columns on `tasks`,
since a follow-up carries richer fields (method, result, next action,
potential value, notes) than fits naturally inline, and a client
accumulates many follow-up records over time (history semantics, same
reasoning as `activity_log`).

**Schema:**

```sql
create type public.follow_up_result as enum (
  'No Response', 'Interested', 'Need Quotation', 'Quotation Sent',
  'Negotiation', 'Waiting PO', 'PO Confirmed', 'Not Interested',
  'Follow-up Later'
);

create table public.follow_up_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks (id),
  client_id uuid not null references public.clients (id),
  commercial_item_id uuid references public.commercial_items (id),
  owner_id uuid not null references public.profiles (id),
  fu_date date not null,
  method public.task_method not null, -- reuses tasks' enum, same 5 values as the mock
  result public.follow_up_result not null,
  next_action text,
  next_fu_date date,
  customer_status public.client_status, -- reuses clients' enum
  potential_value numeric,
  notes text,
  created_at timestamptz not null default now()
);
```

RLS: same 3-role pattern as every other table (sales own-only via
`owner_id`, manager all, executive read-only insert-none). No update/
delete policy — like `activity_log`, a follow-up log is an append-only
record, corrected by logging a new one, not editing history.

**Acceptance criteria:**

- [x] Migration creates `follow_up_logs` + RLS as above
- [x] `src/lib/data/follow-ups.ts`: `logFollowUp()`, `listFollowUpsForClient()`,
      plus `listAllFollowUps()` (needed for the unified Activity Log feed,
      which shows every follow-up the signed-in user can see, not scoped
      to one client)
- [x] `LogFollowUpDialog.tsx` writes for real: inserts the log row, calls
      Task 25's `updateTask()` to mark the task Done, and calls Task 25's
      `createTask()` for the next-action task if one was entered.
      `LogCommercialFollowUpDialog.tsx` (a second, commercial-item-scoped
      follow-up entry point that also called the mock `addFollowUp`) was
      rewired the same way — not called out by name in the original plan,
      but it shared the same dead dependency and had to move together.
- [x] `addFollowUp`, `useFollowUps`, `useFollowUpsForClient`,
      `FollowUpRecord`/`FollowUpResult` types deleted from
      `session-store.ts`
- [x] Bonus: wired the Client Detail page's "Follow-up Timeline" panel
      (previously a permanent "Belum terhubung ke data real" placeholder,
      since no table existed) to real `listFollowUpsForClient()` data, and
      extended `_app.activity.tsx`'s feed to read real follow-ups instead
      of the session-store mock loop

**Scope note:** `FOLLOW_UP_LOGS` (the seed narrative data in
`client-details.ts`, e.g. "Konfirmasi revisi bracket disetujui...") was
**not** deleted, despite being named in the original plan. It's baked-in
historical demo data shown in the Activity Log's "Seed follow-up logs"
loop — distinct from the session-store mock-write infrastructure this task
actually replaces. Deleting it would have required either dropping that
historical demo data from the feed, or migrating it into real
`follow_up_logs` seed rows via a lossy `outcome` (Positive/Neutral/
Negative) → `result` (9-value enum) mapping that wasn't specified anywhere
and risked misrepresenting the demo history. Left as-is and flagged here
rather than guessing; happy to revisit if you want it migrated for real.

**Verification:**

- [x] `bunx supabase db reset` applies cleanly
- [x] New RLS test file (`supabase/tests/follow-up-logs.test.ts`, 5 tests)
      and data-layer test (`src/lib/data/follow-ups.test.ts`) both pass
- [x] `bunx tsc --noEmit` clean (same 2 pre-existing, unrelated
      `CommercialViews.tsx` router-typing errors as before, untouched)
- [x] `bun run lint` clean for every file this task touched (same 5
      pre-existing, unrelated `react-hooks/rules-of-hooks` errors in
      untouched route files remain)
- [x] `bun run build` succeeds; `bun run test` — 68/68 pass
- [x] Manual check in the browser (Sales Manager role): logged a
      follow-up on a task via the phone-icon "Log follow-up" quick action
      — toast confirmed, task moved to Done live (Today 6→5, Completed
      0→1). Confirmed on `/activity` both the real "Status → Done (via
      FU)" and the real "Follow-Up · Email · Interested" events appeared,
      correctly linked to the client. Confirmed on the client's profile
      page that the "Follow-up Timeline" panel showed the same real entry
      instead of the old placeholder.
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** Task 25 (follow-ups touch tasks; do task CRUD first)

**Files touched:**

- `supabase/migrations/20260718040000_follow_up_logs.sql` (new)
- `supabase/tests/follow-up-logs.test.ts` (new)
- `src/lib/data/follow-ups.ts` (new), `follow-ups.test.ts` (new)
- `src/components/tasks/LogFollowUpDialog.tsx`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx`,
  `CommercialDetailPage.tsx` (dropped the now-dead `currentActorName`
  helper along with the prop it fed)
- `src/routes/_app.tasks.tsx` (dropped the now-dead `actorName` computation)
- `src/routes/_app.clients.$clientId.tsx` (Follow-up Timeline wired to real data)
- `src/routes/_app.activity.tsx`
- `src/lib/mock/session-store.ts` (dead follow-up functions and types removed)

**Estimated scope:** Medium (1 migration + 2 test files + 9 source files) —
larger than the original estimate once the second follow-up dialog and
the two placeholder-wiring bonus items were folded in, matching the
pattern from Tasks 24-26.

---

## Task 28: Settings — Org settings

**Description:** `_app.settings.tsx`'s "Master Data" tab edits company
name, fiscal year, PPN rate, and dormant/risk day thresholds via
`settingsActions.updateOrg` (session-store, resets on reload). This is
genuinely new: no real table exists for org-level settings at all.

**Acceptance criteria:**

- [x] New singleton table `org_settings` — decided on named columns (not a
      generic key/value shape) matching the small, fixed field set the
      mock already used, enforced via a Postgres singleton trick
      (`id boolean primary key default true` + `check (id)`). RLS: every
      role can read, manager-only can write. The one default row is
      inserted by the migration itself, not `seed.sql` — it's essential
      schema data the app assumes always exists, not dev/test convenience
      data.
- [x] `src/lib/data/org-settings.ts` with `getOrgSettings()`/`updateOrgSettings()`
- [x] `_app.settings.tsx`'s Org tab wired to it — now self-contained
      (fetches/mutates on its own via `useQuery`/`invalidateQueries`
      rather than reading `settings.org` from the parent), with all
      fields disabled for non-managers instead of just hiding the
      Batal/Simpan buttons
- [x] `settingsActions.updateOrg` and the `org` slice removed from
      `settings-store.ts` (type, `DEFAULT_ORG`, and the `Settings.org`
      field all gone)

**Scope note:** the "Reset semua ke default" button (previously calling
`settingsActions.reset()`, which reset team/preferences/targets/org
together as one bundle) was removed from the Org tab rather than kept.
Once org became real, that button's UX got confusing — it looked like it
would reset the org fields you just saved for real, but would silently do
nothing to them (only the still-local team/preferences state). Removing
it avoids that footgun; team/preferences reset is Task 29/30 territory if
still wanted there.

**Verification:**

- [x] `bunx supabase db reset` applies cleanly
- [x] New RLS test file (`supabase/tests/org-settings.test.ts`, 5 tests:
      every role can read, manager can write, sales/executive cannot
      write, no role can insert a second row) and data-layer test
      (`src/lib/data/org-settings.test.ts`) both pass
- [x] `bunx tsc --noEmit` clean (same 2 pre-existing, unrelated
      `CommercialViews.tsx` router-typing errors as before, untouched)
- [x] `bun run lint` clean for every file this task touched (same 5
      pre-existing, unrelated `react-hooks/rules-of-hooks` errors in
      untouched route files remain)
- [x] `bun run build` succeeds; `bun run test` — 75/75 pass
- [x] Manual check in the browser (Sales Manager role): opened Settings →
      Master Data, confirmed real seeded values loaded ("PT Duta Solusi
      Metalindo", fiscal year 2026, PPN 11.0%, etc.), edited the PPN rate
      and saved — toast confirmed ("Konfigurasi disimpan"), then reloaded
      the page and confirmed the new value was still there (proves it's a
      real DB write, not session-only). Sales/executive write restriction
      verified via the RLS test suite rather than a second manual
      role-switch pass, since that's already exhaustively covered there.
- [x] `bunx supabase db reset` after testing to restore clean seed data

**Dependencies:** Task 23

**Files touched:**

- `supabase/migrations/20260718050000_org_settings.sql` (new)
- `supabase/tests/org-settings.test.ts` (new)
- `src/lib/data/org-settings.ts` (new), `org-settings.test.ts` (new)
- `src/routes/_app.settings.tsx`
- `src/lib/mock/settings-store.ts` (dead `org` slice removed)

**Estimated scope:** Small-Medium (1 migration + 2 test files + 2 source
files) — matched the original estimate.

---

## Task 29: Settings — Team roster CRUD (real Edge Function)

> **Superseded target note (2026-07-18):** The checked items below accurately record the historical Manager-triggered create/update/remove implementation. ADR-002 and Phase 12 replace that target: only active Super Admin may mutate Team & Role; deactivation is the default; Manager/Executive are read-only; ownership transfer, inactive-profile RLS, immutable admin audit, and last-admin protections are required. Do not deploy the historical contract as the final design.

**Description:** `_app.settings.tsx`'s "Tim & Role" tab currently lets a
manager add/edit/remove team members entirely client-side. **Decided:**
"add member" must really function (per the project owner) — built as a
Supabase **Edge Function** (server-side, holds the service-role key,
never shipped to the browser), since a browser can't create a Supabase
Auth user directly. The manager sets a **temporary password** directly in
the add-member form (no email/SMTP infra needed) — same pattern as the
local seed accounts (`supabase/seed.sql`), just entered per-member instead
of hardcoded.

**Edge Function (`supabase/functions/create-team-member/`):**

1. Verify the caller's JWT belongs to a `manager` (reject otherwise — this
   is what keeps this "admin-created," not public sign-up: only an
   already-authenticated manager can invoke it)
2. `supabase.auth.admin.createUser({ email, password, email_confirm: true })`
3. Insert the matching `profiles` row (`role`, `name`, `initials`, `email`)
4. Return the new user's id, or a clear error if the email already exists

**Acceptance criteria:**

- [x] Historical `create-team-member` target is superseded by the locally
      verified `manage-team-member` Edge Function, which is deployable with
      `supabase functions deploy manage-team-member`; remote deployment
      remains a separate explicitly approved step naming the target project
- [x] **Checkpoint decisions confirmed with you before building:** (1) role
      edits also go through the Edge Function rather than a plain
      client-side `profiles` UPDATE — the original plan's "plain UPDATE"
      idea conflicted with the profiles migration's explicit, deliberate
      design ("role changes only happen via a manual, service-role-
      authenticated step... bypasses RLS entirely by design"); routing
      through the Edge Function keeps that single invariant intact instead
      of adding a second, weaker path. (2) Removal is a full account
      delete, not a deactivation flag — a flag alone wouldn't actually
      block access unless every table's RLS also checked it, which is a
      much bigger change; a half-built deactivation flag would look
      disabled without truly being disabled.
- [x] `supabase/functions/manage-team-member/index.ts` — one function,
      not three, handling `create`/`update`/`remove` via an `action`
      field in the request body (simpler to deploy than three separate
      functions, and keeps the "only this one place" invariant obviously
      true by construction). Verifies the caller is a manager by checking
      their own `profiles` row before doing anything.
- [x] `src/lib/data/team.ts` gains `listTeamMembers()`, `createTeamMember()`,
      `updateTeamMember()`, `removeTeamMember()` — the latter three all
      call the Edge Function via `supabase.functions.invoke()`
- [x] `_app.settings.tsx`'s Team tab wired to all three, plus a password
      field (add-only) and a disabled/read-only email field in edit mode
      (email changes weren't in scope — changing a login email has its
      own re-confirmation complexity not asked for here)
- [x] `settingsActions.addTeamMember`/`updateTeamMember`/`removeTeamMember`
      and the `team` slice of `settings-store.ts` removed. The Profile
      tab's per-user preferences bucket (Task 30 territory, stays local)
      turned out to key off the _static_ `TEAM` array import from
      `@/lib/mock/team.ts` directly, not `settings-store`'s mutable
      `team` state — so deleting the slice needed only one small fix
      (`_app.settings.tsx`'s `currentUserId` lookup for the manager
      fallback), not a Task 30-scale rework.

**Verification:**

- [x] Local: manager JWT smoke-tested via curl against
      `http://127.0.0.1:54321/functions/v1/manage-team-member` — create,
      update (role change), remove, and a sales-role 403 all confirmed
      working before wiring the UI. `bunx supabase stop && bunx supabase
start` was needed once for the edge-runtime container to pick up
      the newly-created function (it doesn't hot-reload a function that
      didn't exist when the stack last started).
- [x] `bun test` — 75/75 pass. **Gap explicitly noted, not silently
      skipped:** the Edge Function's own logic (manager-only gate,
      create/update/remove branches) isn't exercised by `bun:test` the
      way RLS policies are — it was verified via the manual curl pass
      above and the full UI walkthrough below instead.
- [x] Manual check in the browser (Sales Manager role): added a real
      team member with a temp password — toast confirmed, appeared live
      in the roster. Confirmed via a direct token-grant curl call that
      the new account could actually log in with that password. Edited
      the same account's role to Sales Manager — toast confirmed, badge
      updated live, email field was correctly disabled. Removed the
      account — confirmation dialog correctly warned about permanent
      deletion; after confirming, a follow-up curl login attempt
      correctly returned `invalid_credentials`, proving the account was
      truly gone, not just hidden from the list.
- [x] `bunx tsc --noEmit` clean — added `supabase/functions/**` to
      `tsconfig.json`'s `exclude`, since Edge Functions run under Deno
      (global `Deno`, `jsr:`/`npm:` specifiers) and were never meant to
      type-check under the app's Node/bundler tsconfig; this is genuinely
      a different runtime, not dead code.
- [x] `bun run lint` clean for every file this task touched (same 5
      pre-existing, unrelated `react-hooks/rules-of-hooks` errors in
      untouched route files remain)
- [x] `bun run build` succeeds
- [x] `bunx supabase db reset` after testing to restore clean seed data
      (the deletion above was already done for real before the reset, so
      no orphaned test account was left in local auth either way)

**Deploying to the real project:** not done as part of this task — per
the standing rule, nothing touches a real Supabase project without you
explicitly triggering it. When ready: `bunx supabase functions deploy
manage-team-member` (needs the project linked first, which per CLAUDE.md
requires you to supply the project ref explicitly).

**Dependencies:** Task 23

**Files touched:**

- `supabase/functions/manage-team-member/index.ts` (new)
- `src/lib/data/team.ts` (new)
- `src/routes/_app.settings.tsx`
- `src/lib/mock/settings-store.ts` (dead `team` slice and its 3 actions removed)
- `tsconfig.json` (excludes `supabase/functions/**` from the app's tsc run)

**Estimated scope:** Medium-Large (first Edge Function in this repo — some
one-time setup/learning cost beyond the code itself) — matched the
estimate; the two checkpoint decisions were the main added complexity
beyond straightforward CRUD wiring.

---

## Task 30: Settings — Preferences

**Description:** `_app.settings.tsx`'s "Profil" tab edits per-user display
preferences (language, timezone, date format, currency format) via
`settingsActions.updatePreferences`.

**Decision (confirmed with you 2026-07-18): keep local-only,
permanently.** These are low-stakes, per-device display settings for a
small internal team — not worth the schema surface (a `profiles` jsonb
column or a new table) for a feature whose main downside is "doesn't
sync across devices," which nobody has asked for. The original task was
the decision; Task 22 later extracted the retained behavior into a
dedicated non-mock store without changing that decision.

**What this means going forward:**

- `src/lib/preferences-store.ts` keeps only the localStorage-backed
  preferences slice and `settingsActions.updatePreferences()`.
- Real sessions key preferences by the authenticated profile UUID; the
  local role switcher uses explicit `dev:<role>` keys.
- The dead mock target slice and static `TEAM` dependency were removed.

**Estimated scope:** Small — decision-only originally; the later Task 22
cleanup was a mechanical store extraction.

---

## Phase 11: Commercial Documents, Sheet Alignment, and Atomic Numbering

Accepted sources:

- `PRD.md` Section 15
- `docs/decisions/ADR-001-normalized-commercial-documents-and-numbering.md`
- `docs/superpowers/specs/2026-07-18-commercial-product-fields-and-sheet-alignment-design.md`
- `scripts/import-sheets-mapping.md`

## Task 31: Synchronize product and architecture documentation

**Status:** Complete (2026-07-18)

**Description:** Remove active-document contradictions after the owner approved Product/UOM fields, normalized headers/items, automatic numbering, Quotation revisions, weighted forecast stages, revenue-from-items, and HARIFF backdate behavior. Preserve completed historical plans as historical evidence rather than rewriting their past scope.

**Acceptance criteria:**

- [x] PRD reflects the current revenue, numbering, revision, HARIFF, Date, Product, UOM, and forecast rules
- [x] ADR records context, alternatives, decision, and consequences
- [x] Backend spec points to the accepted normalized target
- [x] Sheet mapping and fixture README no longer claim Qty/price/No PO/Description are intentionally dropped
- [x] Plan/todo distinguish completed legacy work from pending normalized implementation
- [x] CLAUDE/HANDOFF identify the current source of truth and local-only safety boundary
- [x] Historical Quick Create docs are marked superseded where their constraints conflict

**Files:** `PRD.md`, `specs/backend-data-layer.md`, `scripts/import-sheets-mapping.md`, `tests/fixtures/sheets-import/README.md`, `tasks/plan.md`, `tasks/todo.md`, `CLAUDE.md`, `HANDOFF.md`, `docs/decisions/ADR-001-normalized-commercial-documents-and-numbering.md`, and relevant `docs/superpowers/*` files.

## Task 32: Normalize commercial and Sales Order schema locally

**Status:** Complete (2026-07-19)

**Description:** Create one header plus child items per document while preserving all legacy rows and references. Work only on local Supabase until a separate remote approval.

**Acceptance criteria:**

- [x] CLI-generated migrations create `public.commercial_documents`, `public.commercial_document_items`, normalized `public.sales_orders`, `public.sales_order_items`, `public.uom_type`, and `private.document_number_counters`
- [x] Every public table has role-correct RLS and grants; private allocator state is not Data-API exposed
- [x] Legacy RFQ/Quotation/SO rows are grouped with deterministic mapping tables and reconciled counts/totals
- [x] `tasks`, `follow_up_logs`, and `activity_log` references move to document headers without losing history
- [x] Legacy source tables are preserved read-only in `private`; no destructive drop occurs
- [x] Local reset and migration tests pass

**Verification:** pre/post row counts, document/item group counts, FK orphan queries, FOC-null checks, RLS tests, database advisors.

## Task 33: Rebuild historical Sheet import for normalized documents

**Status:** Complete (2026-07-19)

**Description:** Replace the legacy row-to-row import target with Quotation and Sales Order header/item grouping. Preserve No PO, Description, Qty, UOM, Unit Price, totals, raw revisions, and HARIFF historical numbers.

**Acceptance criteria:**

- [x] Add sanitized `QUOTATION` fixture and expand SO/NP/PROTY/HARIFF fixtures for all four UOMs, revisions, conflicts, and counter maxima
- [x] Import one header per compatible document/version and one child item per Sheet row
- [x] Historical Product Name remains `NULL`; Description is never copied into Product Name
- [x] `_REV.01`/`_REV.1` parse correctly while preserving raw numbers
- [x] Paid totals reconcile; FOC money remains `NULL`; invalid/mismatched rows go to JSONL review
- [x] Seed QUO/SO/NP/PROTY counters from maximum unique valid bases after reconciliation
- [x] Observed next-number candidates are recalculated at run time, not hardcoded
- [x] Real import remains manual and blocked until dry-run evidence is reviewed
- [x] Local full-tab run completed: 549 accepted headers / 1,005 items reconcile
      exactly; 127 ambiguous rows remain quarantined in 55 pending review entries; see
      `.superpowers/sdd/p11-import-closeout-report.md`

**Follow-up (2026-07-19, later same day):** all 55 pending review entries
resolved with the project owner and re-imported. Accepted set is now 586
headers, ≈Rp131.024.482.393 paid total; 33 review rows remain, all
accounted for by 16 documents the owner deliberately kept rejected
(incomplete source data). Also fixed two structural bugs found along the
way: a migration that tried to seed client rows before `profiles` existed
(moved to `seed.sql`), and a silently-dropped row in `quotation-clean.csv`
(`DSM-26QUO-0238`, same embedded-CR bug as `DSM-26QUO-0194`/`-0208`, missed
by the earlier cleanup pass). See
`.superpowers/sdd/p11-review-decisions-report.md`.

**Verification:** fixture golden tests, dry-run summary, count/value reconciliation packet, counter-state query, zero remote mutation.

## Task 34: Atomic numbering, Quotation revisions, and HARIFF modes

**Status:** Complete (2026-07-19)

**Description:** Implement PostgreSQL-owned allocation and transactional document creation. Never allocate numbers with browser-side or non-locking `max + 1` logic.

**Acceptance criteria:**

- [x] QUO format `DSM-YYQUO-nnnn`; SO `DSM-YYSOnnn`; NP `DSM-YYNPnnn`; PROTY `DSM-YYPROTYnnn`
- [x] Independent series/year counters reset at 1 for a new Date year and continue from imported maxima
- [x] Concurrent create tests prove unique monotonic numbers and rollback-safe allocation
- [x] `Buat Revisi` copies the latest Quotation, appends canonical `_REV.n`, supersedes the previous version atomically, and defaults to `Quotes Sent`
- [x] One-current-revision constraint prevents forecast duplication
- [x] HARIFF normal mode uses shared automatic series; Existing/Backdate requires manual number, reason, duplicate check, badge, and activity log without consuming a counter
- [x] Administrative number assignment/correction does not change Date, item totals, or revenue

## Task 35: Align forms and grouped list/detail UI

**Status:** Complete (2026-07-19)

**Description:** Update RFQ, Quotation, and Create Sales Order to the accepted one-form document model and render grouped headers/items.

**Acceptance criteria:**

- [x] Every new item requires Product, Qty, and UOM; Description is optional
- [x] UOM dropdown contains Unit, Pcs, Set, Lot
- [x] Paid items require Unit Price and calculate line/grand totals; FOC hides and stores no money
- [x] Quotation includes Date, Account/Sales, Client, Address, weighted Status, linked SO, and Note
- [x] Create SO includes compact Date (browser UAT: `19 Jul 2026`), No PO, generated/manual administrative SO number, Customer/Sales, classifications, and items; no second PO workflow exists
- [x] Lists/details group by header and show Product as primary label
- [x] Seven exact stage labels/weights drive current-version forecast; unmapped legacy stages show `Belum tersedia`
- [x] Existing Product-null rows show `Nama Product belum diisi`

## Task 36: Local verification, UAT, and as-built documentation

**Status:** Complete locally (2026-07-19; see `.superpowers/sdd/p11-task-8-report.md`)

**Description:** Prove the complete Phase 11 workflow locally before any remote proposal, then update documentation from target to verified as-built state.

**Acceptance criteria:**

- [x] Migration, RLS, counter concurrency, revision, import, grouping, revenue, FOC, and FK tests pass
- [x] Browser verifies RFQ, Quotation, revision, PPN SO, NP SO, Prototype Paid, Prototype FOC, HARIFF auto, and HARIFF backdate
- [x] Stored headers/items, compact Date, totals, forecast, counters, and audit entries match inputs
- [x] Final local reset removes captured QA identifiers and restores baseline data/counter state
- [x] Full test, lint, typecheck, build, and database-lint limitations are reported honestly
- [x] Full test suite uses isolated counter years and preserves the imported
      local counter state before/after
- [x] PRD/spec/ADR/mapping/plan/todo/CLAUDE/HANDOFF match the implemented result and list remaining known gaps
- [x] Remote target and migration command remain a separate explicit approval
- [x] Full-tab import closeout fixed partial-document quarantine and
      source-number reservation, normalized punctuation-only address comparison,
      then re-ran reconciliation with zero failures;
      see `.superpowers/sdd/p11-import-closeout-report.md`

---

## Phase 12: Super Admin, Team & Role, and Account Lifecycle

Accepted sources:

- `PRD.md` Sections 3, 9, and 15
- `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`
- `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`
- `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md`

Implementation order: complete Phase 12's schema/RLS foundation before Phase 11 creates normalized commercial tables. This prevents new tables from inheriting the obsolete three-role policy set.

## Task 37: Synchronize Super Admin product and architecture documentation

**Status:** Complete (2026-07-18)

**Description:** Replace active three-role/Manager-admin assumptions with the accepted Super Admin authority and account-lifecycle model while preserving prior completed tasks as historical evidence.

**Acceptance criteria:**

- [x] Accepted design records the fourth role, role matrix, account state, lifecycle, audit, and protection rules
- [x] ADR-002 records context, alternatives, decision, consequences, and superseded assumptions
- [x] PRD, backend spec, and auth bootstrap match the accepted authority model
- [x] Task 29 is visibly historical/superseded rather than silently rewritten
- [x] Phase 11 RLS constraints include the Phase 12 dependency
- [x] CLAUDE and HANDOFF identify current code gaps, source documents, ordering, and local-only boundary
- [x] Detailed implementation plan exists with tests, interfaces, commands, and verification checkpoints

## Task 38: Add Super Admin role, active account state, and fail-closed RLS

**Status:** Complete locally (2026-07-19; see `.superpowers/sdd/task-7-report.md`)

**Description:** Add the explicit `super_admin` database role and active/inactive profile state locally. Update role resolution and every exposed-table policy so only active profiles receive role authority.

**Acceptance criteria:**

- [x] CLI-generated migration adds `super_admin`, `account_status`, status metadata, and supporting indexes/constraints
- [x] `current_user_role()` returns no privileged role for an inactive profile
- [x] Active Super Admin has supported company-wide table access; existing Sales/Manager/Executive scope remains correct
- [x] Activity Log has no update/delete policy for any role
- [x] Inactive user with a previously issued token cannot select or mutate business data
- [x] Four-role fixtures/helpers and full RLS matrix tests pass locally
- [x] First-Super-Admin bootstrap helper is UUID-targeted, idempotent, credential-free, and tested locally

## Task 39: Implement protected account lifecycle, ownership transfer, and admin audit

**Status:** Complete locally (2026-07-19; see `.superpowers/sdd/task-7-report.md`)

**Description:** Replace the historical Manager-only team CRUD contract with Super-Admin-only protected server actions and append-only administrative audit events.

**Acceptance criteria:**

- [x] Server actions support `create`, `update_profile`, `change_role`, `deactivate`, `reactivate`, `transfer_ownership`, and `delete_eligible_account`
- [x] Every action authenticates an active Super Admin, requires a reason where specified, and returns safe structured errors
- [x] Manager/direct non-admin calls return 403
- [x] Current Super Admin cannot deactivate/delete self; last active Super Admin cannot be deactivated/deleted/demoted
- [x] Deactivation updates profile state first and attempts Auth session revocation without weakening RLS denial
- [x] Ownership transfer runs atomically across approved active/open owner-bearing domains and targets only active Sales/Manager
- [x] Permanent delete returns 409 with reference counts unless the target is completely unused
- [x] Every action appends actor, target snapshot, reason, before/after metadata, and result without logging secrets

## Task 40: Update auth/session behavior and Settings Team & Role UX

**Status:** Complete locally (2026-07-19; see `.superpowers/sdd/task-7-report.md`)

**Description:** Expose the confirmed four-role behavior in the application without treating UI controls as authorization.

**Acceptance criteria:**

- [x] TypeScript role unions, profile mapping, labels, navigation, and session bootstrap support `super_admin`
- [x] Inactive real session fail-closed path shows the unavailable-account message and signs out without mock fallback (covered by unit/code evidence; database denial with an old token is dynamically proven)
- [x] Super Admin sees active/inactive filters and create/edit/role/deactivate/reactivate/transfer/eligible-delete controls
- [x] Manager/Executive see read-only roster text `Hanya Super Admin yang dapat mengelola anggota tim dan role.`
- [x] Sales cannot access Team & Role
- [x] Super Admin is excluded from owner selectors, target assignment, and Sales performance calculations
- [x] Super Admin business corrections preserve existing owner unless explicit transfer is used
- [x] UI handles 403/409 lifecycle errors with actionable Indonesian guidance

## Task 41: Local verification, bootstrap rehearsal, and as-built reconciliation

**Status:** Complete locally (2026-07-19; see `.superpowers/sdd/task-7-report.md`)

**Description:** Prove authorization at the database, server, session, and browser layers before any remote proposal.

**Acceptance criteria:**

- [x] Local reset, full RLS matrix, server-action contract, unit, lint, typecheck, and build checks pass or disclose unrelated baseline failures precisely
- [x] Browser verifies Super Admin Settings, Manager/Executive read-only roster, and Sales-hidden tab; inactive old-token denial is dynamically verified at the database layer and the client sign-out/message path is covered by unit/code evidence
- [x] Browser/database evidence proves company-wide edit preserves owner and logs Super Admin actor
- [x] Disposable local users prove additional-Super-Admin creation, role change, deactivate/reactivate, transfer, and eligible deletion
- [x] Last-admin, current-account, referenced-delete, inactive-destination, and partial-transfer failures are rejected without partial state
- [x] QA cleanup uses captured identifiers and preserves seed/baseline state
- [x] Bootstrap is rehearsed locally; no real credential or remote project is touched
- [x] PRD/spec/ADR/plan/todo/CLAUDE/HANDOFF are updated from target to verified as-built state
- [x] Remote migration/deployment remains a separate explicit approval naming the exact target

---

## Post-Phase 12: Real-Data Wiring & Bug Fixes

### Task 42: Wire Client Detail page to real Supabase data

**Status:** Complete (2026-07-21)

**Description:** Replace all hardcoded `"—"` placeholders on the Client Detail page (`_app.clients.$clientId.tsx`) with real data from sales_orders and commercial_items.

**Acceptance criteria:**

- [x] 7 MetricCards (Total Revenue, PPN, Non-PPN, RFQ Pipeline, Commit, Prototype Paid, Prototype FOC) query real data via `clientRevenueMetrics()` / `clientCommercialMetrics()`
- [x] "Waiting PO" card renamed to "Commit" — shows all commercial items at Commit stage
- [x] 6 tabs (Overview/Upcoming Actions, Tasks, Commercial Items, Quotations, Sales Orders, Revenue History) replaced `NotYetAvailable` placeholders with real data tables
- [x] Dead `NotYetAvailable` component removed

**Verification:** `bunx tsc --noEmit` clean, `bun run lint` 0 errors, `bun run build` succeeds.

**Files touched:**

- `src/routes/_app.clients.$clientId.tsx`
- `src/lib/data/dashboard-selectors.ts` (added `clientRevenueMetrics()`, `clientCommercialMetrics()`)

**Estimated scope:** Medium (2 files)

---

### Task 43: Wire Client List page PPN/Non-PPN to real data + Saved Views

**Status:** Complete (2026-07-21)

**Description:** Replace hardcoded `ppn`/`nonPpn` zeros on the Client List page with real computed values from sales_orders. Wire Saved Views dropdown to actual filters.

**Acceptance criteria:**

- [x] PPN/Non-PPN columns computed from real `sales_orders` data via `enrichedRows` + `revenueByTax()`
- [x] Saved Views dropdown wired: "Butuh Perhatian" → `overdueOnly`, "Prospect Aktif" → `statuses=["Prospect"]`, "Semua Semua" → `resetFilters()`
- [x] Dead spending-range code block removed

**Verification:** `bunx tsc --noEmit` clean, `bun run lint` 0 errors, `bun run build` succeeds.

**Files touched:**

- `src/routes/_app.clients.index.tsx`

**Estimated scope:** Small (1 file)

---

### Task 44: Fix owner-mismatch client picker (PT. PUTRA ARGA BINANGIN)

**Status:** Complete (2026-07-21)

**Description:** When a SO's `owner_id` differs from the client's `owner_id` (owner mismatch from Sheet import), the client doesn't appear in the Create dialog picker because `listClients()` is scoped by `clients_select` RLS. Fix by using `searchClients()` (client_search_index) which bypasses ownership.

**Acceptance criteria:**

- [x] Migration `20260721000000_expand_client_search_index.sql` adds `owner_id` to `client_search_index` view
- [x] `searchClients()` returns `{id, name, ownerId}`
- [x] `useClientResolution()` in `ClientPicker.tsx` switched from `listClients()` to `searchClients()`
- [x] CreateRecordDialogs: added `["clients"]` query invalidation after SO creation

**Verification:** `bunx tsc --noEmit` clean, `bun run lint` 0 errors, `bun run build` succeeds.

**Files touched:**

- `supabase/migrations/20260721000000_expand_client_search_index.sql` (new)
- `src/lib/data/clients.ts`
- `src/components/clients/ClientPicker.tsx`
- `src/components/clients/CreateRecordDialogs.tsx`

**Estimated scope:** Small (4 files, 1 migration)

---

### Task 45: Push all migrations to remote + restore Sheet data from corrected CSVs

**Status:** Complete (2026-07-21)

**Description:** Owner approved pushing all 22 pending migrations to the remote Supabase project. During browser verification, achievement showed 22.84M instead of the expected 24.1M — root cause was re-importing from the repo's pre-decision fixture CSVs instead of the corrected CSVs that carry the 55 Phase 11 review decisions.

**Acceptance criteria:**

- [x] All 28 migrations applied to remote `qhtfixgbcpcitokeryxb` (DSM Sales Web App V2, Northeast Asia/Tokyo) via `bunx supabase db push` — local and remote in sync
- [x] Local DB reset, all 5 tabs re-imported from `~/Downloads/Work/Projects/dsm-sheet-export/corrected/*-corrected.csv`
- [x] SO total verified: 189 sales orders, Rp24.153.354.852 (24.15M) — matches expected 24.1M
- [x] 397 commercial documents / 720 items restored
- [x] Remaining rejections match the previous session's "Keep rejected" decisions (blank rows, missing prices)

**Root cause of the 1.31B gap:** the repo fixture CSVs (`tests/fixtures/sheets-import/`) are pre-decision versions. Two SOs were quarantined on re-import: `DSM-26SO082` (Rp1.13B, three distinct customer POs on one internal SO — owner decided: merge all POs in header, HARIFF pattern) and `DSM-26SO111` (Rp177.5jt, missing line total on a shipping row — owner decided: compute from qty × unit price). The corrected CSVs apply these decisions.

**Key learning:** always import from the corrected CSVs in `~/Downloads/Work/Projects/dsm-sheet-export/corrected/`, never from the repo fixtures.

**Verification:** DB query confirms `count=189, sum(total_value)=24153354852`.

**Files touched:** none in repo (data-only operation; stray review-log JSONLs deleted)

**Estimated scope:** Data operation
