# Handoff — DSM Sales Web App V2

Context dump for continuing this work in another tool (Codex). Written 2026-07-18; Phase 11/12 status refreshed 2026-07-19; Phase 11 import-review reconciliation session added 2026-07-19; post-import UX/bugfix session added 2026-07-20; second 2026-07-20 session (pipeline permissions/FK bugfixes) added 2026-07-20; Client Detail/Client List real-data wiring session added 2026-07-21; remote-migration-push + data-restoration session added 2026-07-21.

## Project basics

- TanStack Start (React 19) front-end with a real local Supabase Postgres backend (`src/lib/data/`). The production mock layer was fully removed on 2026-07-19.
- Package manager: **bun**. Key commands: `bun run dev`, `bun run test` (needs local Supabase running), `bun run lint`, `bun run build`, `bunx tsc --noEmit`.
- Local Supabase: `bunx supabase start` / `bunx supabase db reset` (rebuilds from `supabase/migrations/*.sql` + `supabase/seed.sql`) / `bunx supabase stop`.
- Git is present on branch `main`, connected to `github.com/Japrang311/dsmsalescrm`
  (the Lovable-connected remote). Working tree is clean as of commit
  `2c1c196` (2026-07-21) — see the bottom section for what that and the two
  commits before it (`77d637a`, `aad642f`) contain. **None of these commits
  have been pushed to `origin`** — push needs separate explicit approval.
  Still never rewrite history, rebase, amend, squash, or force-push on this
  repo.
- The user (Aditya) is not a programmer — explain things in plain terms, avoid silently making irreversible calls (schema changes, deleting data).

## Latest accepted direction — supersedes older deferred notes below

The two accepted changes below are implemented and locally verified. Neither has been applied to a remote project.

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
working tree clean; **not pushed**.

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

## Suggested next steps for Codex

1. Read this file's most recent session first (2026-07-21 remote migration push + data restoration, above) — it's the freshest state. Then the 2026-07-21 Client Detail/Client List wiring session, then the 2026-07-20 sessions. Then `.superpowers/sdd/p11-review-decisions-report.md` for the 55 import decisions that the corrected CSVs encode.
2. Remote is now fully provisioned: schema (28/28 migrations), 8 profiles (Adhitya+Leli managers; Nur, Feni, Siti, Andri sales; Triyanto executive; Super Admin), 69 clients with remote-mapped owner_ids, 189 SOs (Rp24.15B), 397 commercial docs / 720 items, 48 target rows — imported from the corrected CSVs via `import-sheets.ts --allow-remote`. Any FUTURE data re-import to remote still needs the owner's explicit go-ahead.
3. Do a live browser pass on global search, notifications, the Sales Order edit dialog/inline item editor, the Sales Orders list's "Nama Product" column, the Client Detail page (7 metric cards + 6 tabs), the Client List page (PPN/Non-PPN columns, Saved Views), and the client picker in all Create dialogs before assuming any of it is fully correct — see "Flagged, not yet acted on" sections in earlier sessions.
4. Preserve Activity Log immutability, ownership attribution, task/follow-up/activity foreign keys, and archived legacy evidence. If asked to log the new SO edits to Activity Log, that needs a new `activity_kind` enum value (small migration) before wiring `logActivity()` calls.
5. Git now has real commits through `2c1c196` plus this session's doc updates — treat it normally (stage intentionally, don't `add -A` blindly, never force-push/rewrite history on this Lovable-connected repo). Nothing has been pushed to `origin` yet.
