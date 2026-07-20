# Post-Import UX Fixes — Dashboard Crash, Search/Notifications, Sales Order Editing

Date: 2026-07-20
Environment: local Supabase at `127.0.0.1:54321` only. No operation was
performed against a remote Supabase project. Commit: `7aecd2e`.

## What this session did

Follow-on work after the Phase 11 import-review reconciliation
(`.superpowers/sdd/p11-review-decisions-report.md`), driven entirely by the
owner using the app and reporting concrete problems.

### 1. Dashboard crash fix

`localhost:8080/dashboard` threw `TypeError: Cannot read properties of
undefined (reading 'target')` and fell to the root error boundary. Root
cause: `dashboard-selectors.ts`'s `monthlyRevenueTrend`/`ytdCumulativeTrend`/
two other call sites indexed a per-member target array
(`targetArr[i].target`) without a bounds guard. When a member has no seeded
`targets` row, `targetsFor()` returns `[]`, so any index access throws. Fixed
all four unguarded sites to `targetArr[i]?.target ?? 0`. Verified fixed live
in a browser (two hard reloads, KPI cards render correctly).

### 2. Global search + notifications (previously fully decorative)

The topbar search `<Input>` had no `value`/`onChange` at all, and the Bell
button had no click handler and a hardcoded always-on red dot — both no-ops.
Built:

- **Global search** (`TopBar.tsx`'s new `GlobalSearch`): typing filters
  already-cached client/RFQ/quotation/SO data client-side (no extra network
  call — reuses `useDashboardData()`'s React Query cache) into a grouped
  Popover+Command dropdown, capped at 5 results per category; selecting a
  result navigates to its detail page. Scoped to exactly the four categories
  the placeholder text already promised.
- **Notifications** (`TopBar.tsx`'s new `NotificationsMenu`): derived from
  existing `tasks` with `status` `"Overdue"` or `"Today"` — no new table.
  Badge only shows when there are alerts; clicking an item navigates to that
  task's client.
- **Searchable client picker**: `ClientPickerField` (shared by every
  "create X for a client" dialog) was a plain scroll-only `<Select>`;
  rebuilt as a Popover+Command combobox. Also swapped in for `CreateTaskDialog`'s
  previously-separate, non-searchable client `<Select>`.
- Verified per-page search bars (Clients, Tasks, Activity, Commercial
  Documents) were already wired correctly in code — only the topbar one and
  notifications were dead.

### 3. Sales Order editing (previously fully read-only except tax type)

Triggered by the owner finding a real SO whose Klien field showed "—" for
its own sales owner. Investigation found the underlying data was correct —
the client's `owner_id` (set by the Phase 11 bulk sheet-import client-match
heuristic) just differed from the SO's own `owner_id`, so
`clients_select`'s RLS correctly hid it. Scale check: **21 of 189 imported
Sales Orders and 74 of 400 commercial documents** have this same owner
mismatch — a real, recurring pattern, not a one-off.

Built, after three explicit owner-decision checkpoints (who can edit; which
fields; and specifically reopening the `client_id`/`owner_id` column lock
that `20260719041351_harden_normalized_document_permissions.sql` had
deliberately closed):

- **Migration** `20260720000000_add_sales_order_edit_support.sql`:
  - `public.client_search_index` view (id+name only, all authenticated
    active users, fails closed via `current_user_role() is not null`) so
    the edit form's Klien field can find/correct a client regardless of
    who owns it — without loosening `clients_select` itself.
  - `grant update (client_id, owner_id) on sales_orders to authenticated`.
    RLS's existing `sales_orders_update` WITH CHECK remains the real
    boundary: sales may only keep `owner_id = auth.uid()` (cannot
    reassign to someone else), manager/super_admin unrestricted, executive
    still can't update the table at all.
  - New trigger `sales_order_items_recompute_total` (via
    `private.recompute_sales_order_total()`) keeps
    `sales_orders.total_value` in sync with the sum of its items'
    `line_total` whenever items change — this didn't exist before, so
    letting users edit item qty/price would otherwise have silently
    desynced the revenue figures Dashboard/Reports read.
  - Applied to the running local DB via `supabase migration up --local`,
    **not** `db reset` (a reset would have wiped the 586-document real
    import, which lives only as live rows, not in seed.sql/migrations).
- **Data layer**: `searchClients()` (clients.ts), `updateSalesOrderHeader()`
  and `updateSalesOrderItem()` (sales-orders.ts). Item edits always derive
  `line_total = qty × unitPrice` (same rule the Create dialogs already use)
  except Prototype FOC items, which keep `unitPrice`/`line_total` `null`.
- **UI** (`_app.sales-orders.$soId.tsx`): new `EditSalesOrderHeaderDialog`
  (Klien/Customer PO/Tanggal/Sales Owner) and per-row inline line-item
  editing, gated by `canEditOwnSo = manager | super_admin | (sales &&
so.ownerId === CURRENT_SALES_ID)`; owner reassignment specifically is
  manager/super_admin-only within the dialog.
- **Tests**: 4 pre-existing tests encoded the _old_ stricter contract (no
  one may ever touch `owner_id`/`client_id` on `sales_orders`) and needed
  updating to the _new_, deliberately narrower one — not deleted, rewritten
  to assert the accurate per-role behavior (including that RLS-blocked
  UPDATEs return 0 rows with no error, not a thrown error — a real subtlety
  found while fixing these). Added one new dedicated test using a fresh
  throwaway row (not the shared fixture row) to avoid cross-test pollution.

### 4. Mock/demo data cleanup

Deleted the twelve leftover mock/demo clients (`PT Astra Komponen
Nusantara`, `PT Sinar Baja Elektrik`, etc. — mirrors of the
`src/lib/mock/data.ts` array Task 22 already deleted in code on 2026-07-19)
and their mock tasks/commercial_items/sales_orders, both from the live local
DB (direct SQL, dependency-ordered, inside one transaction — not `db
reset`, same reasoning as above) and from `supabase/seed.sql` (so a future
reset won't recreate them). Verified first via SQL that none of the twelve
had any `number_mode = 'Imported'` rows attached (0 for all twelve) before
deleting — confirmed real data was untouched (409→397 `commercial_documents`
old count check, 209→189 `sales_orders`, matching exactly the real import's
own counts). **Kept** `PT. HARIFF DAYA TUNGGAL ENGINEERING` — initially
looked like mock data too, but has 16 real commercial documents / 27 real
`Imported` sales orders attached; it's the actual HARIFF customer.

### 5. Sales Performance dashboard composition (owner decision)

`dashboardSalesTeam()` (`dashboard-selectors.ts`): Andri Sutomo
(`profiles.role = 'sales'`) dropped from the Executive Dashboard's Sales
Performance table/export and the Reports page's sales breakdown/filter;
Adhitya Wirambara and Leli Al (`profiles.role = 'manager'`) added, since
they personally carry a sales book despite their title. Display-only — no
`profiles.role` values changed, no RLS/permission change.

### 6. Product Name / Description data correction (owner decision)

Original Phase 11 import deliberately left `product_name` `NULL` for every
historical row (no separate Product column existed in the source sheets;
`description` held the text) — see `p11-review-decisions-report.md`'s
mapping doc. Owner asked to reverse this: moved `description` into
`product_name` (clearing `description`) for every row where `product_name`
was empty and `description` wasn't. Scale: **383 of 383
`sales_order_items` (100%) and 719 of 723 `commercial_document_items`
(99.4%)** — i.e., effectively the entire historical import, 1,102 rows
total. One `commercial_document_items` row was left alone because it had
neither field populated (nothing to move). Applied via direct SQL on the
live DB (same reasoning as above — not a schema change, not seed-sourced).
Added a "Nama Product" column to the Sales Orders list page
(`_app.sales-orders.index.tsx`) to surface the now-populated field.

## Checkpoint (end of session)

- `bunx tsc --noEmit`: clean.
- `bun run lint`: 12 pre-existing warnings only, 0 errors.
- `bun run test`: **314/314 pass** (313 baseline + 1 new RLS test).
- `bun run build`: succeeds.
- `bunx supabase migration list --local`: all migrations through
  `20260720000000` applied.
- Git: committed as `7aecd2e` on `main`. Working tree clean. **Not pushed**
  to `origin` — push requires separate explicit approval per this repo's
  own rules (Lovable-connected remote).

## Known gaps / flagged for the owner, not yet acted on

1. **Activity Log doesn't cover the new Sales Order header/item edits.**
   The existing tax-change editor on the same page logs to `activity_log`
   (`sales_order_tax_change`); the new Klien/Owner/PO/Date/Item edits do
   not. Would need a new `activity_kind` enum value + a small migration.
   Deliberately deferred — flagged to the owner, not done without asking.
2. **The 95-document owner/client mismatch is not bulk-corrected.** The new
   edit form is a one-at-a-time tool, not an automated fix. No decision has
   been made on whether/how to correct the other ~94 documents.
3. **`public.profiles` is missing `Hendra Wijaya`** (the original seed
   manager account, id `11111111-...`) — 7 profiles found where 8 are
   expected from `seed.sql`. Not caused by this session's test suite (RLS
   test fixtures use fresh random-UUID auth users, never Hendra's fixed
   id) or by the mock-data cleanup (which never touched `profiles`).
   Origin unconfirmed — noted here for visibility, not investigated further
   as it was outside the scope of what was asked this session.
4. Chrome DevTools MCP was disconnected for most of this session; the
   dashboard crash fix and the mock-client-owner discovery were verified
   live in-browser earlier while it was still connected, but the search/
   notifications/SO-edit/product-name UI changes were verified only via
   `tsc`/`lint`/`test`/`build`, not a live click-through. Recommend a
   manual pass in the browser before treating this as fully done.

## Files touched this session

- `src/lib/data/dashboard-selectors.ts` — 4 unguarded `targetArr[i]` fixes;
  new `dashboardSalesTeam()`.
- `src/components/shell/TopBar.tsx` — new `GlobalSearch`,
  `NotificationsMenu`.
- `src/components/clients/ClientPicker.tsx` — `ClientPickerField` rebuilt
  as a searchable combobox; type widened to accept `{id,name}[]`.
- `src/components/tasks/CreateTaskDialog.tsx` — swapped in the shared
  `ClientPickerField`.
- `src/components/dashboard/SalesPerformanceTable.tsx`,
  `src/routes/_app.dashboard.tsx`, `src/routes/_app.reports.tsx` — use
  `dashboardSalesTeam()`.
- `src/routes/_app.sales-orders.$soId.tsx` — `EditSalesOrderHeaderDialog`,
  inline-editable `SalesOrderItemRow`, permission gating.
- `src/routes/_app.sales-orders.index.tsx` — new "Nama Product" column.
- `src/lib/data/clients.ts` — new `searchClients()`.
- `src/lib/data/sales-orders.ts` — new `updateSalesOrderHeader()`,
  `updateSalesOrderItem()`.
- `supabase/migrations/20260720000000_add_sales_order_edit_support.sql` —
  new.
- `supabase/seed.sql` — removed the twelve mock demo clients + their mock
  tasks/commercial_items/sales_orders blocks.
- `supabase/tests/commercial-documents-schema.test.ts`,
  `supabase/tests/super-admin-rls.test.ts` — updated to the new
  `sales_orders` column-grant contract.
- Live local DB (not file-based, so not in git): deleted 12 mock clients +
  relations; moved `description` → `product_name` for 1,102 line items.
