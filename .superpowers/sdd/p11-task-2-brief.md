# Phase 11 Task 2 Brief: Convert legacy rows and repoint history safely

Source: `docs/superpowers/plans/2026-07-18-commercial-documents-numbering-implementation.md`, lines 222-294.

## Files

- Create: `supabase/tests/commercial-normalization.test.ts`
- Create: `scripts/verify-commercial-normalization.sql`
- Create via CLI: migration printed by `bunx supabase migration new migrate_commercial_document_data`
- Modify: `src/lib/data/tasks.ts`, `src/lib/data/follow-ups.ts`, `src/lib/data/activity-log.ts`

## Interfaces

- Produces one normalized header per RFQ/Quotation version/SO and all child items.
- Produces temporary `private.commercial_item_id_map` and `private.sales_order_id_map` for FK migration evidence.
- Changes app-facing FK names to `commercial_document_id`; `activity_log.sales_order_id` points to the new header.

## Steps

### Step 1: Write failing reconciliation tests

Seed a two-item RFQ, a base Quotation plus `_REV.1`, a two-item paid SO, and one FOC row in legacy tables. Assert target header counts, item counts, sums, revision state, and zero orphaned task/log links.

### Step 2: Run RED

Run: `bun run test supabase/tests/commercial-normalization.test.ts`

Expected: FAIL because legacy rows have not been converted or mapped.

### Step 3: Generate the data migration

Run: `bunx supabase migration new migrate_commercial_document_data`

### Step 4: Implement deterministic grouping and UUID maps

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

### Step 5: Repoint foreign keys in the same migration

Add and backfill `tasks.commercial_document_id`, `follow_up_logs.commercial_document_id`, and `activity_log.commercial_document_id`. Repoint `activity_log.sales_order_id` using the Sales Order map. Add new FKs only after zero-null/zero-orphan queries pass, then retire legacy FK columns from application use.

### Step 6: Preserve legacy evidence

Move old source tables to `private` with explicit names `legacy_commercial_items_20260718` and `legacy_sales_orders_20260718`, revoke all access from `anon`/`authenticated`, and finalize target table names. Do not drop evidence tables.

### Step 7: Run reconciliation and tests

Run: `bunx supabase db reset`

Run: `psql "$LOCAL_DATABASE_URL" -f scripts/verify-commercial-normalization.sql`

Run: `bun run test supabase/tests/commercial-normalization.test.ts supabase/tests/commercial-documents-schema.test.ts`

Expected: equal item counts and paid/FOC totals, zero orphaned FKs, exactly one current revision per base, all tests PASS.

### Step 8: Review checkpoint

Hand off the pre/post evidence packet and stop if any count/value/FK differs.

## Global Constraints (from plan, binding for this task)

- Work against local project `DSM_SALES_WEB_APP_V2`; no remote mutation without separate approval naming the target.
- Create every migration filename with `bunx supabase migration new <name>`; never invent a timestamp.
- Phase 12 (ADR-002 role and active-profile foundations) is complete and locally verified — every RLS policy touched or added in this task must use the four-role model (`sales | manager | executive | super_admin`), matching Task 1's already-reviewed pattern in `supabase/migrations/20260719014036_normalize_commercial_documents.sql`. Follow that migration's exact RLS style, including wrapping both `(select auth.uid())` and `(select public.current_user_role())` — Task 1's initial version had the latter unwrapped and a Task 1 code review flagged it as a performance-pattern inconsistency; the controller already fixed Task 1's migration to wrap both. Do not reintroduce the unwrapped form in this task's new/modified policies.
- Preserve legacy Product as `NULL`, raw historical number formats, all task/follow-up/activity relationships, and read-only legacy evidence.
- One form submit creates one header and all items atomically. (Not directly exercised until Task 3 builds the write path — this task is a one-time data conversion, not the ongoing write API.)
- Do not initialize Git. This Lovable-connected folder has no `.git`; use review checkpoints instead of commit steps.

## Context from Task 1 (already complete, independently reviewed, and locally verified)

Task 1 created the target schema this task migrates data into:
- `public.commercial_documents` / `public.commercial_document_items` — new, currently empty.
- `public.sales_orders_new` / `public.sales_order_items` — new, currently empty, **temporarily named**. This task's Step 6 is what finally renames `sales_orders_new` → `sales_orders` (after first renaming/relocating the *legacy* `sales_orders` table to `private.legacy_sales_orders_20260718`) — the brief's Step 6 language ("finalize target table names") means exactly this rename, since Task 1 deliberately deferred it to avoid a name collision during Task 1's own migration.
- `private.document_number_counters` — new, empty, unwired (Task 3's job, not this task's).
- Legacy `public.commercial_items` and legacy `public.sales_orders` — both currently still the live, authoritative, row-per-item tables this task must read from and then relocate to `private` (per Step 6) once migration is verified.

The migration file to read for the exact target schema (column names/types) this task must populate: `supabase/migrations/20260719014036_normalize_commercial_documents.sql`.
