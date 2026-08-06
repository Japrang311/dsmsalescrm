# Task List: SO Visibility Bug, Team & Role Error, Pipeline Closed-Won → SO

Plan: `tasks/so-visibility-team-role-pipeline-plan.md`

---

## Phase 1 — Bug 1: timezone date bug (confirmed root cause)

## Task 1.1: Add `toLocalIsoDate()` and fix the filter/metrics call sites that caused the reported bug — DONE

**Description:** `isoDate()` in both `src/lib/data/sales-orders.ts:256-258` and `src/lib/data/sales-orders-metrics.ts:39-41` does `date.toISOString().slice(0, 10)`. `.toISOString()` converts to UTC; any `Date` representing local midnight (like `NOW` from `src/lib/app-time.ts:9`, or a date-picker's `new Date(y, m, d)`) rolls back to the *previous* calendar day once shifted to UTC in any timezone ahead of UTC (GMT+7 included). This is why `to: NOW` on the Sales Orders list and Dashboard KPI RPCs excludes today's rows. Fix: add one canonical helper that reads local calendar parts instead of converting through UTC, and use it at the two call sites directly responsible for the reported symptom.

**Acceptance criteria:**
- [ ] New `toLocalIsoDate(date: Date): string` helper added to `src/lib/app-time.ts` (or `src/lib/format.ts` — pick whichever already owns date-formatting utilities), computing `${getFullYear()}-${pad(getMonth()+1)}-${pad(getDate())}` from local time, no `.toISOString()` involved
- [ ] `isoDate()` in `src/lib/data/sales-orders.ts` and `src/lib/data/sales-orders-metrics.ts` (dedupe to one shared function if reasonable) now delegates to `toLocalIsoDate()`
- [ ] A Sales Order dated "today" (in a UTC+ timezone) is included by `listSalesOrdersPage()`'s and `getSalesOrdersMetrics()`'s default `to: NOW` filter

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] New unit test for `toLocalIsoDate()` covering a UTC+ offset (force `process.env.TZ = "Asia/Jakarta"` or equivalent in the test) proving local midnight doesn't roll back a day
- [ ] Updated/new integration test proving a same-day-dated Sales Order is returned by `listSalesOrdersPage()` and counted by `getSalesOrdersMetrics()` when `to: NOW` — this is the direct regression test for the reported bug
- [ ] `bunx tsc --noEmit` clean

**Dependencies:** None

**Files likely touched:**
- `src/lib/app-time.ts` (new helper)
- `src/lib/data/sales-orders.ts`
- `src/lib/data/sales-orders-metrics.ts`
- `src/lib/data/sales-orders.test.ts` / `src/lib/data/sales-orders-metrics.test.ts`

**Estimated scope:** S (3-4 files, mechanical)

---

## Task 1.2: Surface list-query errors instead of failing silently — DONE

**Description:** `ordersPage` (`useQuery` in `src/routes/_app.sales-orders.index.tsx`) never renders `ordersPage.error` anywhere — a real Supabase/network error currently produces an empty-looking table with no explanation, identical in appearance to "no results match your filter." Add a visible error state, mirroring the pattern already used on Settings → Tim & Role (`"Data tim gagal dimuat"` + retry button).

**Acceptance criteria:**
- [ ] When `ordersPage.isError` is true, the page renders a visible error message (not just an empty table) with the error's message text
- [ ] A "Coba lagi" (retry) button calls `ordersPage.refetch()`
- [ ] Normal loading/success/empty-filtered-result states are unchanged

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] Build succeeds: `bunx tsc --noEmit`
- [ ] Manual check: temporarily force `listSalesOrdersPage` to throw (e.g. bad column name) in a local branch, confirm the error UI renders, then revert

**Dependencies:** None

**Files likely touched:**
- `src/routes/_app.sales-orders.index.tsx`

**Estimated scope:** S (1 file)

---

## Task 1.3: Sweep the remaining "today"-derived call sites (data-correctness bug, not just display) — DONE

**Description:** The same `.toISOString().slice(0, 10)`-on-a-local-midnight-`Date` bug also affects **write paths** that default to "today" — meaning follow-ups/tasks created "today" in a UTC+ timezone are currently persisted with **yesterday's** date. This is a data-correctness bug distinct from Task 1.1's read-filter fix, and should ship as its own reviewable change. Confirmed affected (all derive from `new Date()`/`NOW`, not a user-picked date):
- `src/components/clients/CreateRecordDialogs.tsx:55` (`todayIso`)
- `src/components/clients/AddFollowUpDialog.tsx:117`
- `src/components/pipeline/PipelineCardDrawer.tsx:339`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx:98`
- `src/routes/_app.pipeline.tsx:348`
- `src/lib/data/clients.ts:370` (`today` default)
- `src/components/pipeline/PipelineStageMoveDialog.tsx:33` — confirm whether `d` here is always "now" or can be a user-picked date before changing
- `src/components/tasks/TaskDetailDrawer.tsx:270`, `src/routes/_app.tasks.tsx:564,656,784` — confirm each `next`/`due` is "now"-derived vs. an already-picked date before touching

Explicitly **not** in scope for this sweep (format an already-correct, user-picked or already-UTC-appropriate Date, verify before assuming otherwise): `src/lib/export-pdf.ts:297`, `src/lib/export-sales-orders.ts:40`, `src/lib/export-xlsx.ts:28`, `src/lib/export-csv.ts:37`, `src/lib/data/business-calendar.ts:119,266`, `src/routes/_app.activity.tsx:339-340` — these take a `from`/`to` range boundary that may itself be a `NOW`-derived default in the *caller*, so trace each one back to its actual origin before deciding it's out of scope; don't assume the export-layer files are safe just because they're formatting, not deriving.

**Acceptance criteria:**
- [ ] Every call site above confirmed to derive from "now" is switched to `toLocalIsoDate(NOW)` / `toLocalIsoDate(new Date())`
- [ ] Every call site confirmed to format an already-picked or genuinely-UTC value is left untouched, with a one-line note in the PR description of why
- [ ] A follow-up/task created through the UI with a UTC+ system clock stores today's actual local date

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] `bunx tsc --noEmit` and `bun run lint` clean
- [ ] Browser-verified: create a follow-up via `AddFollowUpDialog` and `LogCommercialFollowUpDialog`, confirm the stored date matches the local system date, not the day before

**Dependencies:** Task 1.1 (shares the `toLocalIsoDate()` helper)

**Files likely touched:** the ~8 confirmed-affected files listed above (verify each before editing)

**Estimated scope:** M (mechanical but touches many files — verify each site individually, don't batch-replace blindly)

---

### Checkpoint: Phase 1
- [x] The reported SOs (`DSM-26SO161`-`164`) and any freshly created same-day SO are visible on the Sales Orders & Revenue page with default filters
- [x] Dashboard KPI tiles and Sales Orders metrics include today's transactions
- [x] A follow-up created "today" is stored with today's actual date, verified in a UTC+ timezone
- [x] A simulated query failure renders a visible error state instead of an empty table
- [x] `bun run test` passes, `bunx tsc --noEmit` clean
- [x] Review with human before proceeding

---

## Phase 2 — Bug 2: Team & Role error + "test role" still present

## Task 2.1: Confirm production deployment/migration state

**Description:** The `"e.from is not a function"` error text does not match any code path in the current `main` checkout (current code calls `.rpc(...)`, not `.from(...)`), and the fix (`admin_team_summary` RPC + `team.ts` wrapping) is already in `HEAD`. Confirm whether this is a stale-deployment issue rather than a live defect, before writing any code.

**Acceptance criteria:**
- [ ] Confirmed timestamp of the latest Vercel deployment vs. commit `9d7e786` (the fix commit) — is the fix actually live?
- [ ] Confirmed via Supabase `list_migrations`/`get_advisors` (already done in an earlier session per project memory, but re-verify) that `20260806000000_add_admin_team_summary_rpc.sql` is applied on `qhtfixgbcpcitokeryxb`
- [ ] User has hard-refreshed / cleared cache and re-tested against the live URL

**Verification:**
- [ ] N/A — read-only verification step (Vercel/Supabase MCP tools, no code change)

**Dependencies:** None

**Files likely touched:** None

**Estimated scope:** XS (no files)

---

## Task 2.2 (conditional on Task 2.1): Redeploy / reapply migration

**Description:** Only needed if Task 2.1 finds an actual gap (e.g. the migration never reached production, or the last deploy predates the fix commit). If the fix is confirmed live and the user still reproduces the exact same error after a hard refresh, escalate to a fresh live-debugging session instead of guessing further.

**Acceptance criteria:**
- [ ] Depends on Task 2.1 finding

**Verification:**
- [ ] Settings → Tim & Role loads without error on the production URL, tested by the user directly

**Dependencies:** Task 2.1

**Files likely touched:** None expected (deploy trigger / `apply_migration` only) unless Task 2.1 finds a genuine code gap

**Estimated scope:** XS–S

---

## Task 2.3: Fix loadRealSession()'s root cause, then remove the Prototype Role switcher entirely

**Description:** Confirmed by the user — seen on `dsmsalescrm.vercel.app` (production). Two parts, in order: (1) fix why it rendered at all — trace `loadRealSession()` (`src/context/role-context.tsx`) for any path where a real authenticated session fails to flip `authSource` to `"real"` before first render (race, uncaught exception, stale default); (2) per explicit user decision, **remove the switcher feature entirely** — this is not a gating fix, it's a deletion. Delete the dev-role-login UI (`TopBar.tsx:500-523`), the `DevRole`/`ROLE_LOGIN` dev-switch machinery in `role-context.tsx`, and anything else that exists solely to support it. Keep whatever `loadRealSession()` fix comes out of part (1) even after the switcher is gone — the underlying session-resolution bug could affect other logic, not just this one UI element.

**Acceptance criteria:**
- [ ] Root cause of `authSource` failing to resolve to `"real"` identified and fixed in `loadRealSession()`
- [ ] Prototype Role switcher UI removed from `TopBar.tsx` — no dropdown, no "demo" badge, nothing referencing `DevRole`/`ROLE_LOGIN` remains reachable from any screen
- [ ] `role-context.tsx` no longer exposes a way to set role outside of a real authenticated Supabase session
- [ ] `authSource` concept itself can be simplified/removed if, after deletion, `"dev"` is no longer a reachable value anywhere (check before removing the type — don't leave dead branches, but don't over-refactor beyond what this removal requires either)
- [ ] Existing role-dependent UI (Sales/Manager/Executive/Super Admin views) continues to work exactly as before, driven only by the real profile's role

**Verification:**
- [ ] Tests pass: `bun run test` — update/remove any test that exercised the dev-switcher path
- [ ] `bunx tsc --noEmit` and `bun run lint` clean
- [ ] Browser-verified directly against `dsmsalescrm.vercel.app` after deploy: log in as each real role, confirm no switcher anywhere, confirm correct role-scoped UI renders

**Dependencies:** None

**Files likely touched:** `src/context/role-context.tsx`, `src/components/shell/TopBar.tsx`, any test files exercising `authSource === "dev"`

**Estimated scope:** M (removal touches a few files; verify nothing else depends on the dev-switch path before deleting)

---

### Checkpoint: Phase 2
- [ ] Settings → Tim & Role loads the roster with zero console errors on the production URL
- [ ] No role switcher of any kind exists anywhere in the app, for any session
- [ ] `loadRealSession()` root cause fixed and covered by a test
- [ ] Review with human before proceeding

---

## Phase 3 — Bug 3 (feature): Pipeline Closed Won → Create Sales Order

## Task 3.1: Add unique Quotation→SO lineage column (schema)

**Description:** No existing FK links `sales_orders` back to the `commercial_documents` row it originated from. Add one, additive at the schema level (column stays nullable — the no-Quotation repeat-order flow legitimately has no source document) but **unique** so a Quotation can be linked to at most one Sales Order, per user decision (mandatory 1:1). Blocked on open question 2 (plan doc) about Quotation revisions before finalizing which id (per-revision row vs. `quotationBaseNumber`) the constraint targets — resolve that first.

**Acceptance criteria:**
- [ ] New migration adds `sales_orders.source_commercial_document_id uuid references public.commercial_documents(id)`, nullable at the column level, with a `unique` constraint
- [ ] Column is indexed (the unique constraint provides this automatically)
- [ ] Existing rows unaffected (`null` for all pre-existing SOs); no backfill attempted (per CLAUDE.md's "no inferred legacy backfill" convention)
- [ ] RLS on `sales_orders` unchanged (column addition doesn't need new policies)
- [ ] Attempting to insert a second SO with the same `source_commercial_document_id` fails at the DB level with a clear constraint-violation error

**Verification:**
- [ ] `bunx supabase db reset` applies cleanly locally
- [ ] `bun run test` passes (existing sales-orders tests unaffected)
- [ ] Migration comment explains the purpose, matching this repo's migration-comment convention

**Dependencies:** None

**Files likely touched:**
- `supabase/migrations/<timestamp>_add_sales_order_source_quotation_link.sql`

**Estimated scope:** S (1 file)

---

## Task 3.2: Thread the lineage id through createSalesOrder / create_sales_order

**Description:** Accept an optional source document id end to end: RPC parameter, `CreateSalesOrderInput` type, `createSalesOrder()` call, and the `SalesOrderDocument` read-side type/mapping so it round-trips back out for display.

**Acceptance criteria:**
- [ ] `create_sales_order` RPC accepts an optional `p_source_commercial_document_id uuid default null` and writes it
- [ ] `CreateSalesOrderInput` (`src/lib/data/sales-orders.ts`) gains an optional `sourceCommercialDocumentId?: string`
- [ ] `SalesOrderDocument` (read side) exposes the field back out (e.g. `sourceCommercialDocumentId`) so detail pages can render a link
- [ ] Omitting the field (existing/repeat-order flow) behaves exactly as today — `null`, no error, no required-field prompt
- [ ] Attempting to create a second SO against a Quotation that already has one produces a clear, user-facing error (surfacing the DB unique-constraint violation as a real message, not a raw Postgres error)

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] New/updated test in `src/lib/data/sales-orders.test.ts` (or equivalent) proving a created SO with the field set round-trips correctly, and proving omitting it still works
- [ ] `bunx tsc --noEmit` clean

**Dependencies:** Task 3.1

**Files likely touched:**
- `supabase/migrations/<timestamp>_add_sales_order_source_quotation_link.sql` (RPC update, same or follow-up migration)
- `src/lib/data/sales-orders.ts`
- `src/lib/data/sales-orders.test.ts`

**Estimated scope:** M (2-3 files)

---

## Task 3.3: Accept a source-document prefill in CreateSalesOrderDialog

**Description:** `CreateSalesOrderDialog`'s `SharedProps` currently only takes `clientId`/`clientName`/`ownerId`. Extend it to optionally accept a source Quotation reference (id + display info) that gets threaded into the `createSalesOrder()` call from Task 3.2, and shown as read-only, locked context in the dialog ("Dari Quotation: QUO-...") when present — this field is not user-editable when set, since the Closed-Won flow (Task 3.4) requires it.

**Acceptance criteria:**
- [ ] `CreateSalesOrderDialog` accepts an optional `sourceCommercialDocument?: { id: string; quotationNumber?: string; projectName?: string }` prop
- [ ] When present, the dialog shows a read-only banner referencing the source Quotation (not editable/removable from within the dialog)
- [ ] The submit handler passes `sourceCommercialDocumentId` through to `createSalesOrder()`
- [ ] When absent (existing call sites: Client Detail quick-action, Quick Create), the dialog behaves exactly as today — no visual change, no required field

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] `bunx tsc --noEmit` clean
- [ ] Manual check: open the dialog from an existing call site (Client Detail) with no source prop — confirm unchanged

**Dependencies:** Task 3.2

**Files likely touched:**
- `src/components/clients/CreateRecordDialogs.tsx`

**Estimated scope:** S (1 file)

---

## Task 3.4: Hook confirmMove() to open the dialog on Closed Won; closeable, tracks a pending-SO status

**Description:** Mirror the existing `Closed Lost` → lost-reason pattern in `_app.pipeline.tsx`/`PipelineStageMoveDialog.tsx`. After a successful stage transition to `"Closed Won"`, open `CreateSalesOrderDialog` pre-filled with the moved card's client/owner and the source document reference. Per user decision (2026-08-06): the dialog **can be closed** without submitting. When closed unsubmitted, the card stays `Closed Won` but is now in a derived "SO belum dibuat" pending state — derived by checking whether any Sales Order references this Quotation as `source_commercial_document_id` (no new stored status column; a Closed Won Quotation with no linked SO *is* the pending state, computed live), so there's no second source of truth to keep in sync.

**Acceptance criteria:**
- [ ] Moving a card to `Closed Won` completes the stage transition exactly as today (unchanged), then opens `CreateSalesOrderDialog` pre-filled and locked to that Quotation
- [ ] Closing the dialog without submitting leaves the card `Closed Won`; the Pipeline board visibly flags it (e.g. a badge/indicator on the card, consistent with the board's existing visual language in `PipelineBoard.tsx`) as pending an SO
- [ ] The pending flag is a live derived check (no linked SO exists for this Quotation), not a stored status — resolves itself automatically once an SO is created through any path
- [ ] Re-opening a pending card offers a way back into the Create Sales Order flow (e.g. clicking the pending badge, or an action on the card)
- [ ] Moving to any other stage (including `Closed Lost`) shows no change in behavior
- [ ] The existing no-Quotation Sales Order creation paths (Quick Create, Client Detail) are completely unaffected

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] `bunx tsc --noEmit` and `bun run lint` clean
- [ ] Browser-verified: move a real Quotation card to Closed Won, close the dialog without submitting, confirm the card shows the pending flag and reload the page to confirm it's derived (not lost on refetch); complete the SO from the pending state and confirm the flag clears

**Dependencies:** Task 3.3

**Files likely touched:**
- `src/routes/_app.pipeline.tsx`
- `src/components/pipeline/PipelineStageMoveDialog.tsx`
- `src/components/pipeline/PipelineBoard.tsx` (pending-SO badge on the card)
- `src/lib/data/pipeline-metrics.ts` or `commercial-documents.ts` (query for "Closed Won with no linked SO")

**Estimated scope:** M–L (3-4 files — the derived-state query and board badge are the new surface area beyond the dialog hook itself)

---

## Task 3.6: Block revising a Quotation that already has a linked Sales Order

**Description:** Per user decision (2026-08-06): once a Quotation has a linked Sales Order, it can no longer be revised — price/discount changes must happen before the SO exists (before/at PO release). `ReviseQuotationDialog` (`src/components/clients/CreateRecordDialogs.tsx`) currently has no awareness of SO linkage; it needs to check for one and refuse.

**Acceptance criteria:**
- [ ] `ReviseQuotationDialog`'s trigger (or the dialog itself on open) checks whether the target Quotation has a linked Sales Order (`source_commercial_document_id` referencing it)
- [ ] If linked: the revise action is disabled/blocked with a clear inline explanation (e.g. "Quotation ini sudah punya Sales Order — revisi harga harus dilakukan sebelum SO dibuat")
- [ ] If not linked: revise behaves exactly as today, unchanged
- [ ] The `create_sales_order` RPC itself also rejects being pointed at an already-revised-away Quotation if such a state could otherwise occur (defense in depth — confirm whether this is reachable given Task 3.1's unique constraint, or if the UI-level block is sufficient alone)

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] New test: attempt to revise a Quotation with a linked SO, confirm it's rejected (both UI-level and, if applicable, RPC-level)
- [ ] `bunx tsc --noEmit` clean
- [ ] Browser-verified: create an SO from a Closed Won Quotation, then attempt to revise that Quotation, confirm it's blocked with a clear message

**Dependencies:** Task 3.2 (needs the lineage column to check against)

**Files likely touched:**
- `src/components/clients/CreateRecordDialogs.tsx`
- `src/lib/data/commercial-documents.ts` (revision RPC, if a server-side check is added)

**Estimated scope:** S (1-2 files)

---

## Task 3.5: Show the lineage link on Sales Order / Quotation detail pages

**Description:** Once an SO carries `sourceCommercialDocumentId`, surface it. On the Sales Order's detail view (`CommercialDetailPage.tsx` if SO detail reuses it, or wherever SO detail renders), show a link back to the source Quotation. On the Quotation's detail page, optionally show any SO(s) created from it.

**Acceptance criteria:**
- [ ] Sales Order detail shows a "Dari Quotation" link to the source document when `sourceCommercialDocumentId` is set, nothing when it's `null`
- [ ] Quotation detail shows a reverse link/list to any SO(s) referencing it as source (query by `source_commercial_document_id = this.id`)
- [ ] No visual change for SOs/Quotations with no lineage relationship

**Verification:**
- [ ] Tests pass: `bun run test`
- [ ] Browser-verified: create an SO via the Task 3.4 flow, confirm both directions of the link render correctly

**Dependencies:** Task 3.2, Task 3.4

**Files likely touched:**
- `src/components/commercial/CommercialDetailPage.tsx` (or SO-specific detail component)
- `src/components/commercial/CommercialDetailSidebar.tsx` (existing "Riwayat Revisi" sidebar section is the natural place to add this)
- `src/lib/data/sales-orders.ts` / `src/lib/data/commercial-documents.ts` (query for reverse lookup)

**Estimated scope:** M (3 files)

---

### Checkpoint: Phase 3
- [ ] Moving a Pipeline card to Closed Won opens Create Sales Order pre-filled with the client and locked to that Quotation
- [ ] Closing without submitting leaves a visible, self-resolving "SO belum dibuat" flag on the card
- [ ] A second SO cannot be linked to an already-linked Quotation (DB-enforced, surfaced as a clear UI error)
- [ ] A Quotation with a linked SO can no longer be revised (clear inline explanation, not a silent disable)
- [ ] The created SO stores a reference back to the Quotation; both detail pages show the link
- [ ] Creating a Sales Order directly with no Quotation (Quick Create / repeat-order flow) still works completely unchanged
- [ ] `bun run test`, `bunx tsc --noEmit`, `bun run lint` all clean; browser-verified end to end
- [ ] Review with human before shipping
