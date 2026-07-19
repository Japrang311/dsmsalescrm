# Phase 11 Task 1 Report: Normalize commercial-document schema

Status: **DONE**

## Migration filename

`supabase/migrations/20260719014036_normalize_commercial_documents.sql`
(generated via `bunx supabase migration new normalize_commercial_documents`, not hand-invented)

## Files touched

- Created: `supabase/tests/commercial-documents-schema.test.ts`
- Created: `supabase/migrations/20260719014036_normalize_commercial_documents.sql`
- `supabase/seed.sql`: **not modified.** Checked explicitly — the schema
  contract test only asserts structure via `information_schema`/`pg_catalog`
  (columns, nullability, types, constraints, RLS, grants), never row
  presence/counts on the four new tables, so no seed rows were needed for
  it to pass. Confirmed by running the full suite (below) with the
  untouched seed file — everything stayed green.

## Plain-language table map

- **`public.commercial_documents`** — one row per RFQ, Quotation (including
  each `_REV.n` revision), Direct Order, Prototype, or Customer PO header.
  Carries client/owner, type/source flow, the admin-assigned RFQ/Quotation/SO
  numbers, revision linkage (`quotation_base_number` + `quotation_revision`
  + `is_current_revision` + `supersedes_document_id`), pipeline `stage`, and
  free-text `note`.
- **`public.commercial_document_items`** — the line items belonging to a
  `commercial_documents` row (product, qty, UOM, unit price, line total,
  position). Cascade-deletes with its parent header.
- **`public.sales_orders_new`** (temp name — becomes `sales_orders` in Task
  2 after data conversion) — one row per normalized Sales Order header:
  SO/PO numbers, date, client/owner, Regular vs Prototype type, tax
  classification, prototype paid/FOC status, revenue source bucket, and the
  new `number_mode`/`backdate_reason` pair for HARIFF automatic-vs-audited
  backdate numbering.
- **`public.sales_order_items`** — the SO's line items, same shape as
  `commercial_document_items`.
- **`private.document_number_counters`** — bare empty table (id, series,
  year, last_value, timestamps, unique per series+year). No allocator logic,
  triggers, or seeded rows — that's Task 3.
- New enums: `public.uom_type` (`Unit | Pcs | Set | Lot`),
  `public.document_number_mode` (`Auto | Imported | Hariff Backdate`).

**No legacy table or data was touched.** `public.commercial_items` and
`public.sales_orders` (the original, row-per-item tables) are unchanged —
verified by an explicit test (`legacy commercial_items and sales_orders
tables are untouched (still exist)`) and by the fact this migration never
issues `alter`/`drop` against either.

## Design decisions beyond the brief's literal SQL (documented, not hidden)

The brief gave exact SQL for `commercial_documents`/`commercial_document_items`
only, and said "create the new Sales Order header/items using the exact
columns in the schema test" — so I had to choose types/nullability/
constraints for `sales_orders_new`/`sales_order_items` myself. Choices made,
all deliberately mirroring existing patterns already reviewed in this repo:

- `type`, `tax_type`, `prototype_status`, `source` reuse the *existing*
  enums (`so_type`, `tax_type`, `prototype_status`, `revenue_source`) from
  the legacy `sales_orders` migration rather than inventing new ones.
- `total_value` carries the same FOC money-shape check constraint as the
  legacy `sales_orders.value` column (`prototype_status = 'FOC'` ⇒ value is
  `NULL`, else required) — this is a straight port of an already-accepted
  invariant, not new business logic.
- Added one **new** check constraint not in the brief: `backdate_reason` is
  required exactly when `number_mode = 'Hariff Backdate'`, and must be empty
  otherwise. This encodes the CLAUDE.md rule "Backdate consumes no counter
  and does not move revenue... audited manual backdate numbering" as a
  column-shape invariant — it's a data-integrity constraint, not the
  allocator/revision logic itself, so I judged it in-scope for "keep schema
  compatible" rather than pre-building Task 3.
- `sales_order_items` mirrors `commercial_document_items` exactly (same
  nullable-until-app-enforces-required shape for product/qty/uom, same
  `line_position > 0` + unique-per-parent constraint).

Flagging these explicitly per house rules — happy to adjust if you want
different nullability/constraint choices before Task 2 builds on top of this.

## RLS

Every one of the four new tables got the Phase 12 four-role fail-closed
pattern (`sales | manager | executive | super_admin` via
`public.current_user_role()`), not the plan's original three-role snippet:

- **Header tables** (`commercial_documents`, `sales_orders_new`): SELECT —
  owner Sales or Manager/Executive/Super Admin company-wide. INSERT/UPDATE —
  owner Sales or Manager/Super Admin (Executive blocked by policy, matching
  "Grant only select, insert, update to authenticated; executive remains
  blocked from writes by policy").
- **Item tables** (`commercial_document_items`, `sales_order_items`): same
  rule via `exists` against the parent header, exactly as instructed.
- No DELETE policy on any of the four tables (archive-over-delete, same
  reasoning as every other exposed table in this repo).
- Grants: `authenticated` gets `select, insert, update` only;
  `service_role` gets full CRUD for admin/migration tooling.

## Schema contract test approach

`information_schema`/`pg_catalog` are not exposed through PostgREST, so the
test connects directly to the local Postgres instance using Bun's built-in
`SQL` client (`import { SQL } from "bun"`, available since Bun 1.2+; this
repo runs Bun 1.3.14). The connection string is a **hardcoded literal**
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres` — Supabase's
well-known local-only default) with **no env-var override**, so unlike the
existing `requireLocalSupabaseUrl` API guard (which allows an overridable
URL that then gets validated), this test has no code path that could ever
target a remote database — there's simply nothing to override. `127.0.0.1:54322`
is the local Postgres port from `supabase/config.toml`'s `[db]` section,
confirmed against `bunx supabase status`'s `DB_URL`.

75 assertions cover, per table (`commercial_documents`,
`commercial_document_items`, `sales_orders` logical/`sales_orders_new`
actual, `sales_order_items`):
- exact column set (no missing, no extra columns)
- per-column `data_type`/`udt_name`/`is_nullable` against the brief's exact
  column list
- `pg_class.relrowsecurity = true`
- `pg_policies` has SELECT/INSERT/UPDATE, no DELETE, and every policy's
  `qual`/`with_check` expression contains `super_admin` (proves the
  four-role pattern was actually used, not just presence of policies)
- `information_schema.role_table_grants` shows `authenticated` has
  SELECT/INSERT/UPDATE, not DELETE

Plus standalone assertions: `uom_type` enum values in order,
`document_number_mode` enum values in order, `private` schema exists,
`private.document_number_counters` exists in `private` and is absent from
`public`, legacy tables still exist, the partial unique index enforcing one
current Quotation revision, and unique `line_position` constraints on both
item tables.

## TDD evidence

**RED** (`bun run test supabase/tests/commercial-documents-schema.test.ts`,
before the migration existed):
```
2 pass
73 fail
75 expect() calls
Ran 75 tests across 1 file.
```
(The 2 passes were assertions that correctly expect *absence* — e.g. "legacy
tables exist" partially, "document_number_counters absent from public" — and
happened to pass trivially before the migration too; everything asserting
new-table presence failed as expected.)

**GREEN** (after `bunx supabase db reset` applied the new migration):
```
75 pass
0 fail
283 expect() calls
Ran 75 tests across 1 file.
```

## Verification output (exact, as requested)

```
$ bun run test supabase/tests/commercial-documents-schema.test.ts
 75 pass
 0 fail
 283 expect() calls
Ran 75 tests across 1 file.

$ bun run test
 268 pass
 0 fail
 991 expect() calls
Ran 268 tests across 31 files.
```
268 = the pre-existing 193 + this task's 75 new tests. 0 fail — full suite
stayed green.

```
$ bunx tsc --noEmit
src/components/commercial/CommercialViews.tsx(383,35): error TS2322 ...
src/components/commercial/CommercialViews.tsx(433,27): error TS2322 ...
supabase/tests/commercial-count-rpc.test.ts(87,42): error TS2769 ...
```
Exactly the 2 pre-existing errors named in the task brief (same file/line
numbers). No new errors introduced.

```
$ bun run lint
✖ 19 problems (6 errors, 13 warnings)
```
Exactly the pre-existing baseline (6 errors + 13 warnings, all in the same
Phase-11 route files / `commercial-count-rpc.test.ts` named in the brief).
My new test file initially tripped prettier formatting + `no-explicit-any`
(a `Row = Record<string, unknown>` type alias replaced every `any`); fixed
before this final lint run — zero lint issues remain in either new file.

```
$ bun run build
✓ built in 619ms
```
Production build succeeds.

## Confirmation

- No legacy table (`clients`, `profiles`, `commercial_items`, `sales_orders`)
  was touched, dropped, or had its data modified.
- No numbering allocator, revision transition, or transactional create/revise
  logic was built — `private.document_number_counters` is an empty, unwired
  table matching only the shape the schema test checks for.
- No `supabase link`/`db push`/remote mutation was run; everything ran only
  against the local `DSM_SALES_WEB_APP_V2` stack (`bunx supabase start` /
  `db reset`).
- No git operations — this directory has no `.git`, consistent with prior
  notes.

## Concerns / open questions for review

1. The `sales_orders_new`/`sales_order_items` column types/constraints
   (listed under "Design decisions" above) were my own judgment calls since
   the brief only gave exact SQL for the other two tables. Worth a quick
   look before Task 2 builds the data-conversion migration on top.
2. The `backdate_reason` check constraint is new (not in the brief's SQL,
   not explicitly requested) — flagging per house rules even though I judged
   it in-scope as a data-integrity invariant rather than allocator logic.
