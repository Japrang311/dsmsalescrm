# Implementation Plan: SO Visibility Bug, Team & Role Error, Pipeline Closed-Won → SO

## Overview

Three unrelated reports bundled into one planning pass:

1. **Bug** — a Sales Order created today (`DSM-26SO164`, confirmed live in Activity Log) does not appear on the Sales Orders & Revenue list page.
2. **Bug** — Settings → Tim & Role throws `"e.from is not a function"` and fails to load, plus a complaint that a "test role" switcher is still present.
3. **Feature** — when a Pipeline card moves to `Closed Won`, the Create Sales Order form should open immediately so the resulting SO can be linked back to its originating Quotation. Creating a Sales Order with no Quotation must remain possible (repeat-order flow).

Each is independent — no shared files, no ordering dependency between them. They can be executed in any order or in parallel across sessions.

## Pre-Plan Investigation (already done)

Before writing tasks, the actual production data and code were checked directly (read-only) rather than guessed at:

**Bug 1 — ROOT CAUSE CONFIRMED (2026-08-06, via user screenshot):** the Sales Orders list at default filters shows `DSM-26SO160` as its newest row — `DSM-26SO161`-`164` (all dated today) are silently missing, even though `so_number desc` sort means they should be first. Cause: `isoDate()` (`src/lib/data/sales-orders.ts:256-258`, duplicated in `src/lib/data/sales-orders-metrics.ts:39-41`) does `date.toISOString().slice(0, 10)`. `.toISOString()` converts to **UTC**. `NOW` (`src/lib/app-time.ts:9`, `startOfLocalToday()`) is local-midnight in the server/browser's timezone. For any timezone **ahead of UTC** (GMT+7/Indonesia included), local midnight is still the *previous* day in UTC — so `to: NOW` becomes `.lte("date", "<yesterday>")`, excluding every row dated "today" from every date-range-filtered query that passes `NOW` as the upper bound. This is not cosmetic: it's a **calendar-date bug that silently drops same-day data** from every affected query.

This is wider than the Sales Orders list. The same `isoDate()` pattern in `sales-orders-metrics.ts` is what today's Dashboard KPI-row work (`getSalesOrdersMetrics({ to: NOW })`) is built on — meaning the Dashboard's "Achievement YTD", "Total Revenue YTD", "Revenue Source YTD" tiles are **currently undercounting today's revenue** in GMT+7 (and any other UTC+ timezone) production usage. Separately, several **"today" defaults used when writing data** (not just filtering) use the identical `.toISOString().slice(0, 10)` pattern on `new Date()`/`NOW` — e.g. `AddFollowUpDialog.tsx:117`, `LogCommercialFollowUpDialog.tsx:98`, `PipelineCardDrawer.tsx:339`, `_app.pipeline.tsx:348`, `clients.ts:370` — each of these **writes yesterday's date as "today"** for new follow-ups in the same affected timezones. That's a live data-correctness bug, not just a display bug.

Full list of `.toISOString().slice(0, 10)` call sites across `src/` (23 total) is in the todo file's Task 1.3 — most are genuinely fine (formatting an explicit, already-correct Date the user picked in a date field, where the UTC/local distinction doesn't matter because the Date object itself was constructed from that picked value, not from "now"). Only the ones deriving from `NOW`/`new Date()` (i.e., "what is today") are bugged.

Original DB-investigation findings (still true, ruled out other causes first):
- `DSM-26SO164`/162/161 all have `deleted_at is null`, `date = 2026-08-06` (today — inside the list page's default `[Jan 1, today]` filter), and `owner_id` = an **active** `manager` profile (Leli Al).
- `sales_orders_new_select` RLS policy confirmed live: `owner_id = auth.uid() OR current_user_role() IN ('manager','executive','super_admin')` — a Super Admin or Manager session sees every row unconditionally. RLS is not hiding it.
- Confirmed `DSM-26SO164` sorts as the literal **first row** under the list's `order by so_number desc` (checked the top 30 live `so_number` values — no mixed-padding numbers push it down).
- `defaultReportFilters()` (`src/components/reports/ReportFilterBar.tsx:51-60`) defaults every filter to `"all"` — not scoped to "mine" for any role.
- Cache invalidation on create (`src/components/clients/CreateRecordDialogs.tsx:461`) does `invalidateQueries({ queryKey: ["sales-orders"] })`, which is a valid prefix match against the list page's actual query key (confirmed via `listQueryKey()` in `src/lib/pagination-contracts.ts:140-146`, which always starts with the `"sales-orders"` string) — so a same-session stale-cache miss is not the obvious culprit either.
- **Conclusion: the database and default-filter state are both provably clean.** The most likely remaining explanation is either (a) the user had a **non-default filter** active (leftover date range or owner filter from an earlier session, since React state persists across SPA navigation without a full remount) when they went to check, or (b) a silent query failure that the page doesn't currently surface — `ordersPage.error` is fetched by `useQuery` but never rendered anywhere in `src/routes/_app.sales-orders.index.tsx`, so any real fetch error currently fails **silently** as an empty-looking list. Both are addressed below without requiring further guessing.

**Bug 2 — confirmed happening on production** (`dsmsalescrm.vercel.app`, per user). The `"e.from is not a function"` queryFn bug (bare `queryFn: listTeamMembers` losing its `client` default) was already fixed in commit `9d7e786`, present on current `main`/`HEAD`. `listTeamMembers` today calls `.rpc("admin_team_summary", {})`, not `.from(...)` — so even the *old*, already-fixed bug would throw `"e.rpc is not a function"`, not `"e.from is not a function"`. The exact error text the user is hitting **does not match any code path in the current checkout**. This points at a **stale production deployment** (Vercel serving a pre-fix bundle) rather than a live regression — needs deployment-timestamp confirmation, not a code fix, before assuming otherwise.

**"Test role" switcher — confirmed seen on production** (`dsmsalescrm.vercel.app`). Per CLAUDE.md and `role-context.tsx`, `import.meta.env.DEV` should statically strip `ROLE_LOGIN`/the dev switcher out of `bun run build` output — so a production sighting means either (a) the switcher genuinely renders because `authSource` failed to resolve to `"real"` for that session (a real bug in `loadRealSession()`'s error handling), or (b) the deployed bundle is stale, tying back into the same "is the current fix actually deployed" question as Bug 2. **User decision, confirmed 2026-08-06: fix the `loadRealSession()` root cause, AND remove the Prototype Role switcher UI entirely** — this supersedes CLAUDE.md's prior documented intent that it's a kept, permanent local-dev convenience; the user (product owner) wants it gone from the codebase, not just better-gated. Removing it also makes the root-cause question moot for production (nothing left to leak), but the `loadRealSession()` bug should still be fixed since the same failure-to-resolve-`authSource` pattern could affect other `authSource === "dev"` branches elsewhere in the app.

**Bug 3 — user decision: mandatory, one Quotation → one Sales Order** (not dismissible, and the FK should be unique, not just nullable). Confirmed no existing wiring: `confirmMove()` in `_app.pipeline.tsx` has no `"Closed Won"` branch (only the parallel `Closed Lost` → lost-reason flow, which is the template to copy). No FK from `sales_orders` back to a `commercial_documents` row exists in any migration — lineage needs a new nullable column.

## Architecture Decisions

- **Bug 1**: root cause is confirmed (UTC/local timezone bug in `isoDate()`). Fix: add a `toLocalIsoDate()` helper that reads local calendar parts (`getFullYear`/`getMonth`/`getDate`) instead of `.toISOString()`, and swap it in at every call site that derives from "now" (filtering AND write-defaults) — not at call sites that format an already-user-picked Date, which are unaffected. Also add error-surfacing (Task 1.2) regardless, since it's a real gap independent of this root cause.
- **Bug 2**: verify-before-fix for the Team & Role error, now narrowed. Deployment is confirmed to be where the error was seen — check the actual Vercel deployment timestamp against the fix commit before writing any further code. For the test-role switcher: fix `loadRealSession()`'s failure path AND delete the switcher UI/dev-login path entirely, per user decision — treat this as a real removal task, not just a gating improvement.
- **Bug 3**: mandatory + unique, per user decision. `sales_orders.source_commercial_document_id` becomes required in the Closed-Won-triggered UI path with a **unique** constraint (one Quotation → at most one SO), while the direct-create/repeat-order path leaves it `null` (column stays nullable at the schema level — a repeat-order SO legitimately has no source document). The stage-move dialog is **closeable**; closing without submitting leaves the card in a derived "Closed Won, SO belum dibuat" pending state rather than rolling back the move or silently losing the to-do. Once an SO is linked to a Quotation, `ReviseQuotationDialog` must refuse to revise that Quotation (price/discount changes only happen pre-SO).

## Task List

### Phase 1: Bug 1 — Sales Order / Dashboard KPI timezone date bug — DONE (2026-08-06)

- [x] Task 1.1: Add `toLocalIsoDate()` helper and fix all "now"-derived call sites (filtering + write-defaults)
- [x] Task 1.2: Surface list-query errors instead of failing silently
- [x] Task 1.3: Regression tests proving today's-date rows are included/written correctly in a UTC+ timezone

### Checkpoint: Phase 1
- [x] `DSM-26SO161`-`164` (or a freshly created same-day test SO) appear at the top of the Sales Orders & Revenue list with default filters — verified via new integration test in `sales-orders.test.ts`, and visually via the Quick Create dialog's Date field now defaulting to `2026-08-06` (today) instead of `2026-08-05`
- [x] Dashboard KPI row and Sales Orders metrics tiles include today's transactions — same `toLocalIsoDate()` fix in `sales-orders-metrics.ts`
- [x] A new follow-up/task created "today" stores today's actual calendar date, not yesterday's — fixed at every confirmed "now"-derived call site (`CreateRecordDialogs.tsx`, `AddFollowUpDialog.tsx`, `PipelineCardDrawer.tsx`, `LogCommercialFollowUpDialog.tsx`, `_app.pipeline.tsx`, `PipelineStageMoveDialog.tsx`, `TaskDetailDrawer.tsx`, `_app.tasks.tsx` ×3, `clients.ts` ×2, plus filename-only cosmetic sites in the four export modules and `_app.activity.tsx`)
- [x] Sales Orders page now shows a real error state (with retry) instead of an empty-looking table on a fetch failure
- [x] `bun run test` (571 pass, 0 fail), `bunx tsc --noEmit`, `bun run lint` all clean

**Note:** while fixing this, found and fixed an unrelated pre-existing bug in the *test* fixtures of `dashboard-metrics-reconciliation.test.ts` (same `.toISOString().slice(0,10)` pattern, dating fixtures "yesterday" instead of "today" — didn't affect prior test results only because the affected range check wasn't tight enough to expose it). Also found a **different**, unfixed latent bug in `monthlyRevenueTrendInRange` (Reports) — UTC end-of-day range boundaries can shift into the next local month in GMT+7, producing a phantom extra month row. Out of scope for this fix (flagged separately, task_e57ef088, not yet actioned).
- [ ] A simulated query failure renders a visible error state instead of an empty table
- [ ] `bun run test` passes, `bunx tsc --noEmit` clean

### Phase 2: Bug 2 — Team & Role error + test role (both confirmed on production) — DONE (2026-08-07)

- [x] Task 2.1: Confirm production deployment/migration state against the fix commit — **could not verify directly**: the Vercel MCP connector available in this session is authenticated to a different account (`list_projects`/`list_teams` return empty/unrelated results for `dsmsalescrm`), and no credentials were available to sign in to the live production URL. Superseded regardless — CLAUDE.md confirms Vercel auto-deploys every push to `main`, so pushing this phase's fix triggers a fresh production build independent of whatever the prior deployment state was.
- [x] Task 2.2: N/A — no redeploy action needed beyond the normal push (see above)
- [x] Task 2.3: Removed the Prototype Role switcher entirely, per user decision. `loadRealSession()` simplified to always require a real Supabase Auth session — no more dev-switcher fallback branch to race against or leak from. `DevRole`, `ROLE_LOGIN`, `SEED_EMAILS`, `signInForRole`, and `setRole` all deleted from `role-context.tsx`; `authSource` field removed from the context entirely (every session is now unconditionally a real one). Cleaned up the two downstream consumers (`TopBar.tsx`, `_app.clients.$clientId.tsx`) that had `authSource === "dev"`-gated fallback queries — both simplified to read `realProfile` directly.

### Checkpoint: Phase 2
- [x] Settings → Tim & Role loads the roster with zero console errors — verified locally (Sales Manager login, full 7-account roster renders correctly)
- [x] No role switcher of any kind exists in the app for any session — verified: profile dropdown now shows only "Signed in as [name] / [role] / Profile / Preferences / Sign out", confirmed via a fresh sign-out → real /login form (no seed-account auto-fallback) → sign back in round trip
- [x] `571 tests passing, `bunx tsc --noEmit`, `bun run lint` all clean
- [ ] Production verification (Settings → Tim & Role loading cleanly, switcher absent) still needs the user to check `dsmsalescrm.vercel.app` directly after this push deploys — not verifiable by the agent this session

### Phase 3: Bug 3 — Pipeline Closed Won → Create Sales Order (mandatory, 1:1, dismissible with a pending-SO status)

**User decisions, confirmed 2026-08-06:**
- Dialog is closeable. Closing without submitting leaves the card `Closed Won` with a new "SO belum dibuat" (pending SO) status — it does not roll back the stage move, and does not silently disappear as a to-do. Something on the board/card must surface this pending state until resolved.
- A Quotation that already has a linked Sales Order **can no longer be revised**. Price/discount changes must happen *before* the SO is created (i.e., before/at PO release) — once an SO exists, `ReviseQuotationDialog`'s revise action must be blocked for that Quotation. This makes the lineage question moot: the unique constraint targets the Quotation's `commercial_documents.id` directly (no revision-row ambiguity, since a revision can't be created post-SO anyway).

- [ ] Task 3.1: Add `source_commercial_document_id` column with a unique constraint (schema)
- [ ] Task 3.2: Thread the lineage id through `createSalesOrder`/`create_sales_order`, reject reuse against an already-linked Quotation
- [ ] Task 3.3: Accept a required source-document prefill in `CreateSalesOrderDialog` when reached via the Closed-Won flow
- [ ] Task 3.4: Hook `confirmMove()` to open the dialog on `Closed Won`; closeable, tracks a "SO belum dibuat" pending status when closed unsubmitted
- [ ] Task 3.5: Show the lineage link on the Sales Order / Quotation detail pages
- [ ] Task 3.6: Block `ReviseQuotationDialog` for any Quotation that already has a linked Sales Order

### Checkpoint: Phase 3
- [ ] Moving a Pipeline card to Closed Won opens Create Sales Order pre-filled with the client and locked to that Quotation
- [ ] Closing the dialog without submitting leaves the card visibly flagged "SO belum dibuat" on the board, resolvable later without re-triggering the full stage-move flow
- [ ] Attempting to link a second SO to an already-linked Quotation is rejected with a clear error
- [ ] Attempting to revise a Quotation that already has a linked SO is blocked with a clear explanation, before the SO exists revision still works normally
- [ ] The created SO stores a reference back to the Quotation; Sales Order/Quotation detail pages show the link both directions
- [ ] Creating a Sales Order directly with no Quotation (Quick Create / repeat-order flow) still works completely unchanged
- [ ] `bun run test`, `bunx tsc --noEmit`, `bun run lint` all clean; browser-verified end to end

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Timezone fix (Task 1.1) touches ~10 call sites across forms/exports/filters — regressing one of them is easy | Medium | Task 1.3 adds explicit regression tests with a forced UTC+ timezone; change call sites one at a time, re-run full suite after each |
| Bug 2 turns out to be a live code regression, not a stale deploy | Low | Task 2.1 checks both the deployed bundle and the remote migration state before concluding "already fixed" |
| "SO belum dibuat" pending status has no obvious home in the current Pipeline board/card data model — may need its own column or a derived state from "Closed Won + no linked SO" | Medium | Task 3.4 should prefer a **derived** state (Closed Won stage + `source_commercial_document_id is null` on any SO... actually derived from *absence* of a linked SO, checked live) over a new stored status enum, to avoid a second source of truth |
| Blocking revision on already-SO'd Quotations (Task 3.6) could surprise users used to the current unrestricted revise flow | Low | Clear inline explanation on why the button is disabled/blocked, referencing the linked SO |

## Open Questions

None remaining that block starting implementation. One design detail to settle during Task 3.4 build (not a blocker, just needs a call while coding): whether "SO belum dibuat" is shown as a board-level badge/filter or only inside the card detail drawer — pick whichever fits the existing Pipeline board's visual language (see `PipelineBoard.tsx`) rather than inventing a new pattern.
