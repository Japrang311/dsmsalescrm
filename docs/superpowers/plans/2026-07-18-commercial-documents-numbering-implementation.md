# Commercial Documents and Atomic Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize RFQ/Quotation/Sales Order headers and line items, migrate historical data safely, allocate QUO/SO/NP/PROTY numbers atomically, and deliver the approved forms, revisions, forecast, and grouped views.

**Architecture:** PostgreSQL owns document identity, numbering, revision state, totals, and the one-form transaction boundary. Public header/item tables use RLS; counter state and privileged helpers live in non-exposed `private`. The existing row-per-item tables are migrated with UUID maps and preserved read-only until UAT approves later removal.

**Tech Stack:** Supabase PostgreSQL 17, Supabase CLI, RLS, PostgreSQL functions/triggers, TypeScript 5.8, React 19, TanStack Start/Query, React Hook Form, Zod, Bun test, local browser verification.

## Global Constraints

- Work against local project `DSM_SALES_WEB_APP_V2`; no remote mutation without separate approval naming the target.
- Create every migration filename with `bunx supabase migration new <name>`; never invent a timestamp.
- Implement ADR-002/Phase 12 role and active-profile foundations first. Every new Phase 11 public-table policy must include active Super Admin and preserve Manager/Sales/Executive scope; Activity Log remains immutable.
- One form submit creates one header and all items atomically.
- Product, Qty, and UOM are required for new items; Description is optional.
- Paid totals are derived from Qty × Unit Price; FOC money is `NULL`.
- Revenue uses the Create SO Date and paid item grand total; the administrative SO number never changes revenue.
- Counters are independent per series/year; never implement client-side `max + 1`.
- Quotation revisions use `_REV.n`; only the latest revision enters forecast.
- Preserve legacy Product as `NULL`, raw historical number formats, all task/follow-up/activity relationships, and read-only legacy evidence.
- Do not initialize Git. This Lovable-connected folder has no `.git`; replace commit steps with review checkpoints unless the user separately authorizes Git.

---

## File Structure

Create:

- `supabase/tests/commercial-documents-schema.test.ts` — table/type/RLS/FK contracts.
- `supabase/tests/document-numbering.test.ts` — allocation, concurrency, revision, HARIFF, and rollback contracts.
- `supabase/tests/commercial-normalization.test.ts` — pre/post legacy reconciliation.
- `scripts/verify-commercial-normalization.sql` — deterministic reconciliation queries.
- `src/lib/data/commercial-documents.ts` — normalized RFQ/Quotation reads and transactional writes.
- `src/lib/data/document-numbering.ts` — shared document-number types/format parsing.
- `src/lib/data/commercial-stages.ts` — exact weighted stage map and forecast helpers.
- `src/lib/data/commercial-stages.test.ts` — seven-stage and legacy-unmapped tests.
- `src/lib/data/commercial-grouping.ts` — header/item view models.
- `src/lib/data/commercial-grouping.test.ts` — grouping and totals tests.
- Sanitized `tests/fixtures/sheets-import/quotation.csv` plus normalized expected-output fixtures.

Modify:

- CLI-generated migrations for schema, data conversion, and atomic numbering.
- `supabase/seed.sql` and existing RLS test helpers.
- `scripts/import-sheets.ts`, `scripts/import-sheets/classify.ts`, `scripts/import-sheets/parse.ts`, `scripts/import-sheets.test.ts`.
- `src/lib/data/sales-orders.ts`, `src/lib/data/activity-log.ts`, `src/lib/data/tasks.ts`, `src/lib/data/follow-ups.ts`.
- `src/lib/mock/data.ts` only as a temporary shared-type compatibility seam.
- `src/components/clients/CreateRecordDialogs.tsx` and focused form tests.
- `src/components/commercial/CommercialViews.tsx`, `CommercialDetailPage.tsx`, pipeline/card consumers, and Sales Order routes.
- `PRD.md`, ADR-001, accepted spec, import mapping, task trackers, CLAUDE, and HANDOFF after as-built verification.

## Task 1: Lock the normalized schema contract, then create header/item tables

**Files:**

- Create: `supabase/tests/commercial-documents-schema.test.ts`
- Create via CLI: migration printed by `bunx supabase migration new normalize_commercial_documents`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces tables `public.commercial_documents`, `public.commercial_document_items`, normalized `public.sales_orders`, `public.sales_order_items`.
- Produces enum `public.uom_type` with `Unit | Pcs | Set | Lot`.
- Produces private schema and `private.document_number_counters`.

- [x] **Step 1: Write a failing schema contract test**

Test exact table/column/nullability/type contracts through `information_schema` and `pg_catalog`. Include assertions that all four public tables have RLS enabled and `private.document_number_counters` is absent from `public`.

```ts
const expected = {
  commercial_documents: [
    "id",
    "client_id",
    "owner_id",
    "type",
    "source_flow",
    "document_date",
    "rfq_number",
    "quotation_number",
    "quotation_base_number",
    "quotation_revision",
    "is_current_revision",
    "supersedes_document_id",
    "stage",
    "client_address",
    "so_number",
    "note",
    "created_at",
    "updated_at",
  ],
  commercial_document_items: [
    "id",
    "commercial_document_id",
    "product_name",
    "description",
    "qty",
    "uom",
    "unit_price",
    "line_total",
    "line_position",
  ],
  sales_orders: [
    "id",
    "so_number",
    "customer_po_number",
    "date",
    "client_id",
    "owner_id",
    "type",
    "tax_type",
    "prototype_status",
    "source",
    "number_mode",
    "backdate_reason",
    "total_value",
    "created_at",
    "updated_at",
  ],
  sales_order_items: [
    "id",
    "sales_order_id",
    "product_name",
    "description",
    "qty",
    "uom",
    "unit_price",
    "line_total",
    "line_position",
  ],
};
```

- [x] **Step 2: Run the contract and observe RED**

Run: `bun run test supabase/tests/commercial-documents-schema.test.ts`

Expected: FAIL because `commercial_documents`, `commercial_document_items`, and `sales_order_items` do not exist.

- [x] **Step 3: Generate the migration filename through the CLI**

Run: `bunx supabase migration new normalize_commercial_documents`

Expected: one new path ending `_normalize_commercial_documents.sql`. Record the exact generated path in the task execution notes.

- [x] **Step 4: Implement the schema in the generated migration**

Use these invariants in SQL:

```sql
create schema if not exists private;
create type public.uom_type as enum ('Unit', 'Pcs', 'Set', 'Lot');
create type public.document_number_mode as enum ('Auto', 'Imported', 'Hariff Backdate');

create table public.commercial_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  owner_id uuid not null references public.profiles(id),
  type public.commercial_type not null,
  source_flow public.source_flow not null,
  document_date date not null,
  rfq_number text,
  quotation_number text unique,
  quotation_base_number text,
  quotation_revision integer not null default 0 check (quotation_revision >= 0),
  is_current_revision boolean not null default true,
  supersedes_document_id uuid references public.commercial_documents(id),
  stage text not null,
  client_address text,
  so_number text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'RFQ' and rfq_number is not null) or type <> 'RFQ'),
  check ((type = 'Quotation' and quotation_number is not null and quotation_base_number is not null) or type <> 'Quotation')
);

create unique index commercial_documents_one_current_revision
  on public.commercial_documents(quotation_base_number)
  where type = 'Quotation' and is_current_revision;

create table public.commercial_document_items (
  id uuid primary key default gen_random_uuid(),
  commercial_document_id uuid not null references public.commercial_documents(id) on delete cascade,
  product_name text,
  description text,
  qty numeric check (qty is null or qty > 0),
  uom public.uom_type,
  unit_price numeric check (unit_price is null or unit_price > 0),
  line_total numeric check (line_total is null or line_total >= 0),
  line_position integer not null check (line_position > 0),
  unique (commercial_document_id, line_position)
);
```

Create the new Sales Order header/items using the exact columns in the schema test. Keep the old `sales_orders` table untouched in this first migration; create temporary target names `sales_orders_new`/`sales_order_items`, then finalize names only in Task 2 after data conversion.

- [x] **Step 5: Add explicit RLS policies**

Enable RLS on each new public table. Header policies use:

```sql
using (owner_id = (select auth.uid()) or public.current_user_role() in ('manager', 'executive'))
```

Insert/update policies allow owning Sales or Manager and include both `using` and `with check` on updates. Item policies use `exists` against the parent header with the same ownership rule. Grant only `select, insert, update` to `authenticated`; executive remains blocked from writes by policy.

- [x] **Step 6: Reset local DB and observe GREEN**

Run: `bunx supabase db reset`

Run: `bun run test supabase/tests/commercial-documents-schema.test.ts`

Expected: PASS for columns, constraints, RLS, and grants.

- [x] **Step 7: Review checkpoint**

Provide the generated migration filename, plain-language table map, schema-test result, and confirmation that no legacy table/data was deleted.

## Task 2: Convert legacy rows and repoint history safely

**Files:**

- Create: `supabase/tests/commercial-normalization.test.ts`
- Create: `scripts/verify-commercial-normalization.sql`
- Create via CLI: migration printed by `bunx supabase migration new migrate_commercial_document_data`
- Modify: `src/lib/data/tasks.ts`, `src/lib/data/follow-ups.ts`, `src/lib/data/activity-log.ts`

**Interfaces:**

- Produces one normalized header per RFQ/Quotation version/SO and all child items.
- Produces temporary `private.commercial_item_id_map` and `private.sales_order_id_map` for FK migration evidence.
- Changes app-facing FK names to `commercial_document_id`; `activity_log.sales_order_id` points to the new header.

- [x] **Step 1: Write failing reconciliation tests**

Seed a two-item RFQ, a base Quotation plus `_REV.1`, a two-item paid SO, and one FOC row in legacy tables. Assert target header counts, item counts, sums, revision state, and zero orphaned task/log links.

- [x] **Step 2: Run RED**

Run: `bun run test supabase/tests/commercial-normalization.test.ts`

Expected: FAIL because legacy rows have not been converted or mapped.

- [x] **Step 3: Generate the data migration**

Run: `bunx supabase migration new migrate_commercial_document_data`

- [x] **Step 4: Implement deterministic grouping and UUID maps**

Group legacy RFQ rows by non-null `rfq_number`; group Quotations by full imported `quotation_number`; group SO rows by `so_number` plus client/owner/type/tax/prototype/source/date compatibility. Reject incompatible collisions into a migration review table instead of merging them.

Use map tables with exact shape:

```sql
create table private.commercial_item_id_map (
  legacy_item_id uuid primary key,
  commercial_document_id uuid not null,
  commercial_document_item_id uuid not null
);

create table private.sales_order_id_map (
  legacy_sales_order_id uuid primary key,
  sales_order_id uuid not null,
  sales_order_item_id uuid not null
);
```

Set migrated `product_name = null`. Preserve legacy Description, Qty, Unit Price, totals, raw numbers, and FOC null money.

- [x] **Step 5: Repoint foreign keys in the same migration**

Add and backfill `tasks.commercial_document_id`, `follow_up_logs.commercial_document_id`, and `activity_log.commercial_document_id`. Repoint `activity_log.sales_order_id` using the Sales Order map. Add new FKs only after zero-null/zero-orphan queries pass, then retire legacy FK columns from application use.

- [x] **Step 6: Preserve legacy evidence**

Move old source tables to `private` with explicit names `legacy_commercial_items_20260718` and `legacy_sales_orders_20260718`, revoke all access from `anon`/`authenticated`, and finalize target table names. Do not drop evidence tables.

- [x] **Step 7: Run reconciliation and tests**

Run: `bunx supabase db reset`

Run: `psql "$LOCAL_DATABASE_URL" -f scripts/verify-commercial-normalization.sql`

Run: `bun run test supabase/tests/commercial-normalization.test.ts supabase/tests/commercial-documents-schema.test.ts`

Expected: equal item counts and paid/FOC totals, zero orphaned FKs, exactly one current revision per base, all tests PASS.

- [x] **Step 8: Review checkpoint**

Hand off the pre/post evidence packet and stop if any count/value/FK differs.

## Task 3: Implement atomic allocation, document transactions, and revisions

**Files:**

- Create: `supabase/tests/document-numbering.test.ts`
- Create via CLI: migration printed by `bunx supabase migration new add_atomic_document_numbering`
- Create: `src/lib/data/document-numbering.ts`
- Modify: `src/lib/data/commercial-documents.ts`, `src/lib/data/sales-orders.ts`

**Interfaces:**

```ts
export type DocumentSeries = "QUO" | "SO" | "NP" | "PROTY";
export type Uom = "Unit" | "Pcs" | "Set" | "Lot";

export async function createQuotation(
  input: CreateQuotationInput,
): Promise<CommercialDocumentWithItems>;
export async function reviseQuotation(
  documentId: string,
  input: ReviseQuotationInput,
): Promise<CommercialDocumentWithItems>;
export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<SalesOrderWithItems>;
```

- [x] **Step 1: Write RED tests for allocation and rollback**

Cover independent 2026 seeds (QUO 404, SO 143, NP 16, PROTY 8), 2027 reset, 20 concurrent creates per series, failed-item rollback, revision numbering, HARIFF manual duplicate rejection, and HARIFF non-consumption.

- [x] **Step 2: Run RED**

Run: `bun run test supabase/tests/document-numbering.test.ts`

- [x] **Step 3: Generate and implement allocator migration**

Run: `bunx supabase migration new add_atomic_document_numbering`

Create `private.document_number_counters(series text, year_code smallint, last_value integer, updated_at timestamptz, primary key(series, year_code))` and a private allocator that performs `insert ... on conflict ... do update set last_value = ... returning last_value` inside the caller transaction.

Format exactly:

```sql
case p_series
  when 'QUO' then format('DSM-%sQUO-%s', lpad(p_year::text, 2, '0'), lpad(v_next::text, 4, '0'))
  when 'SO' then format('DSM-%sSO%s', lpad(p_year::text, 2, '0'), lpad(v_next::text, 3, '0'))
  when 'NP' then format('DSM-%sNP%s', lpad(p_year::text, 2, '0'), lpad(v_next::text, 3, '0'))
  when 'PROTY' then format('DSM-%sPROTY%s', lpad(p_year::text, 2, '0'), lpad(v_next::text, 3, '0'))
end
```

- [x] **Step 4: Implement transactional create functions**

Functions validate `auth.uid()`, parent ownership, non-empty items, Product/Qty/UOM, paid prices, FOC null money, and HARIFF client/mode. They allocate/validate the number, insert header/items, calculate total, write activity log, and return the created ID in one transaction. Lock `search_path`; revoke execute from PUBLIC; grant only the intended authenticated call surface.

- [x] **Step 5: Implement transactional revision**

Lock the current Quotation header, compute `max(quotation_revision) + 1`, create canonical `<base>_REV.<n>`, set the old row `is_current_revision=false`, insert copied/edited items, and default stage to `Quotes Sent` in one transaction.

- [x] **Step 6: Run GREEN and advisors**

Run: `bun run test supabase/tests/document-numbering.test.ts`

Run: `bunx supabase db advisors --local`

Expected: all allocation/revision tests PASS; no security/performance advisor finding introduced.

## Task 4: Rebuild fixtures/importer and seed counters from reconciled maxima

**Files:**

- Create: `tests/fixtures/sheets-import/quotation.csv`
- Modify: all existing Sheet fixtures and expected-output docs
- Modify: `scripts/import-sheets.ts`, `scripts/import-sheets/parse.ts`, `scripts/import-sheets/classify.ts`, `scripts/import-sheets.test.ts`

**Interfaces:**

```ts
export type ImportedDocument = {
  header: ImportedCommercialHeader | ImportedSalesOrderHeader;
  items: ImportedLineItem[];
};

export function groupImportRows(rows: ClassifiedSheetRow[]): ImportResult;
export function deriveCounterSeeds(rows: ClassifiedSheetRow[]): CounterSeed[];
```

- [x] **Step 1: Expand fixtures and write failing golden tests**

Add QUOTATION base/revision/multi-item cases; all four UOMs; Qty values containing UOM; header conflicts; mismatched totals; HARIFF historical number; repeated rows; missing NP number gap; and max-number cases.

- [x] **Step 2: Run RED**

Run: `bun run test scripts/import-sheets.test.ts`

Expected: legacy parser output lacks normalized headers/items and counter seeds.

- [x] **Step 3: Implement parsing/classification/grouping**

Follow `scripts/import-sheets-mapping.md` exactly. Product remains `null` when the source only has Description. Preserve raw numbers and month-only date precision. Reject ambiguity to JSONL review.

- [x] **Step 4: Implement dry-run reconciliation output**

Print per tab: source rows, review rows, document headers, items, paid total, FOC count, revision groups, and proposed `(series, year_code, max)` seeds. Dry-run never writes headers, items, or counters.

As built, counter maxima are derived from all classified source rows, including
parseable official numbers on quarantined rows. This prevents the allocator
from reissuing a historical number that was excluded from document import.

- [x] **Step 5: Implement transactional local import**

Write normalized headers/items first; reconcile; then upsert counters using `greatest(existing.last_value, imported_max)`. A failed import transaction must not partially seed counters.

- [x] **Step 6: Run GREEN and local fixture import**

Run: `bun run test scripts/import-sheets.test.ts`

Run the documented dry-run for all five fixture tabs, then a real local fixture import, execute reconciliation SQL, and reset local DB. Expected next candidates match recomputed maxima.

## Task 5: Replace data-layer row APIs with document APIs

**Files:**

- Create: `src/lib/data/commercial-documents.ts`
- Modify: `src/lib/data/sales-orders.ts`, `src/lib/data/activity-log.ts`, `src/lib/data/tasks.ts`, `src/lib/data/follow-ups.ts`, `src/lib/mock/data.ts`
- Test: focused data-layer tests beside each module

**Interfaces:**

```ts
export type LineItemInput = {
  productName: string;
  description?: string;
  qty: number;
  uom: Uom;
  unitPrice?: number;
};

export type SalesOrderDocument = {
  id: string;
  soNumber: string;
  customerPoNumber: string;
  date: string;
  totalValue: number | null;
  items: SalesOrderLineItem[];
};
```

- [x] **Step 1: Write failing adapter tests**

Assert nested header/items, legacy null Product mapping, FOC null money, Date preservation, and activity/task/follow-up header IDs.

- [x] **Step 2: Run RED**

Run the focused `src/lib/data/*.test.ts` files.

- [x] **Step 3: Implement normalized queries and mutation wrappers**

Use nested Supabase selects for reads and RPCs for creates/revisions. Remove direct array inserts that repeat header fields. Keep Product placeholder formatting in presentation helpers; never write `Nama Product belum diisi` to PostgreSQL.

- [x] **Step 4: Run GREEN and full data-layer suite**

Run: `bun run test src/lib/data`

## Task 6: Update RFQ, Quotation, and Sales Order forms

**Files:**

- Modify: `src/components/clients/CreateRecordDialogs.tsx`
- Create/modify: focused form-schema/component tests

**Interfaces:**

- Consumes Task 5 transactional document APIs.
- Produces form values with `productName`, optional `description`, `qty`, `uom`, and conditional `unitPrice`.

- [x] **Step 1: Extract and test Zod schemas before changing JSX**

Write RED cases for required Product/UOM, optional Description, paid price, FOC null money, required No PO, Date, weighted defaults, and HARIFF mode/reason.

- [x] **Step 2: Run RED**

Run the focused form test file and observe missing fields/rules.

- [x] **Step 3: Implement shared item editor**

Render labels in order: Nama Product, Description/Deskripsi Project, Qty, UOM, Unit Price, Total. Use the four-value Select. FOC omits Unit Price/Total but still renders item rows.

- [x] **Step 4: Implement document headers**

Quotation renders generated-number read-only state, Date, Account, Client, Address, weighted Status, linked SO, Note. Sales Order renders compact Date, No PO, generated/manual SO state, classifications, and HARIFF mode only for the exact client.

- [x] **Step 5: Wire create/revision submissions**

Keep entered values on failure. On success invalidate normalized list/detail/activity/revenue queries and display the server-returned number.

- [x] **Step 6: Run focused tests and browser smoke**

Expected: form tests PASS; no console or failed application request in local browser smoke.

## Task 7: Build grouped list/detail and weighted forecast

**Files:**

- Create: `src/lib/data/commercial-stages.ts`, `src/lib/data/commercial-stages.test.ts`, `src/lib/data/commercial-grouping.ts`, `src/lib/data/commercial-grouping.test.ts`
- Modify: `src/components/commercial/CommercialViews.tsx`, `src/components/commercial/CommercialDetailPage.tsx`, pipeline card/drawer consumers, Sales Order list/detail routes

**Interfaces:**

```ts
export const COMMERCIAL_STAGE_WEIGHTS = {
  "Client Request for Quotes": 0.15,
  "Quotes Sent": 0.3,
  Negotiation: 0.55,
  "Hot Prospect": 0.75,
  Commit: 0.9,
  "Closed Won": 1,
  "Closed Lost": 0,
} as const;

export function forecastValue(total: number, stage: string): number | null;
```

- [x] **Step 1: Write RED helper/view-model tests**

Cover all weights, unmapped stage `null`, superseded exclusion, item ordering, total sums, Product-null placeholder, compact Date, and FOC money-column omission.

- [x] **Step 2: Run RED**

Run the new focused tests.

- [x] **Step 3: Implement helpers and update UI consumers**

Lists render one header card/row, item count, grand total, and current forecast. Details render line-item tables. Quotation history orders base then revisions and exposes `Buat Revisi` only from the current version.

- [x] **Step 4: Run GREEN, typecheck, and targeted lint**

Run focused tests, `bunx tsc --noEmit`, and ESLint only on touched files. Report pre-existing failures separately; do not relabel them as fixed.

## Task 8: Full local verification and documentation reconciliation

**Files:**

- Modify accepted documentation only after verified behavior is known.
- Create a dated evidence/checkpoint document under `docs/agent-checkpoints/` if that directory exists; otherwise add a verification section to HANDOFF.

- [x] **Step 1: Run complete automated verification**

Run local reset, migration/schema/RLS/reconciliation/counter/import/data/form/grouping tests, full `bun run test`, typecheck, lint, build, and database advisors.

- [x] **Step 2: Execute real-browser local UAT**

Create and inspect: RFQ, Quotation, `_REV.1`, PPN SO, NP SO, Prototype Paid, Prototype FOC, HARIFF automatic, and HARIFF backdate. Verify persisted header/items, server numbers, Date `18 Jul 2026`, totals, forecast, audit, and grouped views.

- [x] **Step 3: Prove cleanup and counter restoration**

Delete only captured QA IDs in FK-safe order and restore counter state captured before UAT. Requery for zero QA rows and baseline counts/totals.

- [x] **Step 4: Update as-built documentation**

Change target/pending language only for items proven complete. Record generated migration filenames, actual test counts, known failures, remaining gates, and whether legacy tables remain.

- [x] **Step 5: Final review checkpoint**

Do not propose a remote migration until the user separately identifies and approves the target project and reviewed commands.

## Plan Self-Review

- Spec coverage: Product/Description/Qty/UOM, Date, No PO, FOC, revenue, weighted stages, revisions, all number series, HARIFF, normalization, import seeding, FK preservation, RLS, grouping, and browser verification each map to a task.
- Placeholder scan: migration filenames are intentionally CLI-generated per Supabase rules; every other interface, table, command, and expected behavior is explicit.
- Type consistency: `Uom`, `LineItemInput`, document APIs, table names, number formats, and stage constants match the accepted spec and ADR.
- Execution boundary: documentation is complete; no schema/code/remote action is implied by this plan file.
