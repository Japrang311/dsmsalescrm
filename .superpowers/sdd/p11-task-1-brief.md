# Phase 11 Task 1 Brief: Lock the normalized schema contract, then create header/item tables

Source: `docs/superpowers/plans/2026-07-18-commercial-documents-numbering-implementation.md`, lines 54-221.

## Files

- Create: `supabase/tests/commercial-documents-schema.test.ts`
- Create via CLI: migration printed by `bunx supabase migration new normalize_commercial_documents`
- Modify: `supabase/seed.sql`

## Interfaces

- Produces tables `public.commercial_documents`, `public.commercial_document_items`, normalized `public.sales_orders`, `public.sales_order_items`.
- Produces enum `public.uom_type` with `Unit | Pcs | Set | Lot`.
- Produces private schema and `private.document_number_counters`.

## Steps

### Step 1: Write a failing schema contract test

Test exact table/column/nullability/type contracts through `information_schema` and `pg_catalog`. Include assertions that all four public tables have RLS enabled and `private.document_number_counters` is absent from `public`.

```ts
const expected = {
  commercial_documents: [
    "id", "client_id", "owner_id", "type", "source_flow", "document_date",
    "rfq_number", "quotation_number", "quotation_base_number",
    "quotation_revision", "is_current_revision", "supersedes_document_id",
    "stage", "client_address", "so_number", "note", "created_at", "updated_at",
  ],
  commercial_document_items: [
    "id", "commercial_document_id", "product_name", "description", "qty",
    "uom", "unit_price", "line_total", "line_position",
  ],
  sales_orders: [
    "id", "so_number", "customer_po_number", "date", "client_id", "owner_id",
    "type", "tax_type", "prototype_status", "source", "number_mode",
    "backdate_reason", "total_value", "created_at", "updated_at",
  ],
  sales_order_items: [
    "id", "sales_order_id", "product_name", "description", "qty", "uom",
    "unit_price", "line_total", "line_position",
  ],
};
```

### Step 2: Run the contract and observe RED

Run: `bun run test supabase/tests/commercial-documents-schema.test.ts`

Expected: FAIL because `commercial_documents`, `commercial_document_items`, and `sales_order_items` do not exist.

### Step 3: Generate the migration filename through the CLI

Run: `bunx supabase migration new normalize_commercial_documents`

Expected: one new path ending `_normalize_commercial_documents.sql`. Record the exact generated path in the task execution notes.

### Step 4: Implement the schema in the generated migration

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

### Step 5: Add explicit RLS policies

Enable RLS on each new public table. Header policies use:

```sql
using (owner_id = (select auth.uid()) or public.current_user_role() in ('manager', 'executive'))
```

Insert/update policies allow owning Sales or Manager and include both `using` and `with check` on updates. Item policies use `exists` against the parent header with the same ownership rule. Grant only `select, insert, update` to `authenticated`; executive remains blocked from writes by policy.

**Phase 12 constraint (binding, not in the plan's original Step 5 text — added since Phase 12 landed after this plan was written):** every new Phase 11 public-table policy must also include active Super Admin, matching the fail-closed four-role RLS pattern established in Phase 12 (`sales | manager | executive | super_admin`, all gated by `public.current_user_role()` which already returns `null` for an inactive profile — see `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql`). Do not write a three-role (`manager, executive`) policy here — extend every `in (...)` role check in this task to include `super_admin` alongside `manager, executive`, consistent with how Phase 12's RLS matrix migrations did it for every other exposed table.

### Step 6: Reset local DB and observe GREEN

Run: `bunx supabase db reset`

Run: `bun run test supabase/tests/commercial-documents-schema.test.ts`

Expected: PASS for columns, constraints, RLS, and grants.

### Step 7: Review checkpoint

Provide the generated migration filename, plain-language table map, schema-test result, and confirmation that no legacy table/data was deleted.

## Global Constraints (from plan, binding for this task)

- Work against local project `DSM_SALES_WEB_APP_V2`; no remote mutation without separate approval naming the target.
- Create every migration filename with `bunx supabase migration new <name>`; never invent a timestamp.
- Phase 12 (ADR-002 role and active-profile foundations) is complete and locally verified — see `.superpowers/sdd/task-7-report.md`. Every new Phase 11 public-table policy must include active Super Admin and preserve Manager/Sales/Executive scope; Activity Log remains immutable.
- One form submit creates one header and all items atomically. (Not directly exercised until Task 3, but keep schema compatible.)
- Product, Qty, and UOM are required for new items; Description is optional.
- Paid totals are derived from Qty × Unit Price; FOC money is `NULL`.
- Counters are independent per series/year; never implement client-side `max + 1`. (Not built until Task 3 — this task must not preempt or half-build the counter table beyond the bare `private.document_number_counters` existence check the schema test requires.)
- Preserve legacy Product as `NULL`, raw historical number formats, all task/follow-up/activity relationships, and read-only legacy evidence. (This task must not touch/drop any existing legacy table — it only adds new tables alongside them.)
- Do not initialize Git. This Lovable-connected folder has no `.git`; use review checkpoints instead of commit steps.
