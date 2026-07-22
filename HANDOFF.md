# Handoff — DSM Sales Web App V2

Context dump for continuing this work in another tool (Codex). Written 2026-07-18; Phase 11/12 status refreshed 2026-07-19; Phase 11 import-review reconciliation session added 2026-07-19; post-import UX/bugfix session added 2026-07-20; second 2026-07-20 session (pipeline permissions/FK bugfixes) added 2026-07-20; Client Detail/Client List real-data wiring session added 2026-07-21; remote-migration-push + data-restoration session added 2026-07-21; browser-verification + spending_ytd fix + SO edit audit trail session added 2026-07-21; unused-code cleanup + client database (company info/contacts) feature session added 2026-07-22; contact position + Client Detail product/description fixes + commercial item product-name migration reconciliation added 2026-07-22; dynamic per-month sales target UI/calculation update added 2026-07-22.

## Project basics

- TanStack Start (React 19) front-end with a real local Supabase Postgres backend (`src/lib/data/`). The production mock layer was fully removed on 2026-07-19.
- Package manager: **bun**. Key commands: `bun run dev`, `bun run test` (needs local Supabase running), `bun run lint`, `bun run build`, `bunx tsc --noEmit`.
- Local Supabase: `bunx supabase start` / `bunx supabase db reset` (rebuilds from `supabase/migrations/*.sql` + `supabase/seed.sql`) / `bunx supabase stop`.
- Git is present on branch `main`, connected to `github.com/Japrang311/dsmsalescrm`
  (the Lovable-connected remote). Working tree was clean and `main` matched
  `origin/main` at commit `816a7fe` on 2026-07-22 during this handoff refresh
  (`git status --short --branch` showed `## main...origin/main`). Do not trust
  older "local-only / pending push" notes below without rechecking git first.
  Still never rewrite history, rebase, amend, squash, or force-push on this repo.
- Remote Supabase target in prior sessions was `qhtfixgbcpcitokeryxb` (DSM Sales
  Web App V2). Never run remote schema/data mutations without an explicit owner
  approval for that target. During this handoff refresh, `bunx supabase migration
  list --linked` confirmed local and remote migrations matched through
  `20260722080000`.
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
  periodically — any *new* code that copies an older call site risks
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
- Impact: `updateSalesOrderItem()` always includes `description` in its `UPDATE` SET list, and Postgres denies the *entire* statement if privilege is missing on *any* column in the SET list — so every SO item edit failed with "permission denied for table sales_order_items" for every role.
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
