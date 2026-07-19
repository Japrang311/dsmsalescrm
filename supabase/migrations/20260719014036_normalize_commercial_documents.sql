-- Migration: normalize_commercial_documents
--
-- Phase 11 Task 1. Introduces the normalized commercial-document schema
-- (one header + N items per document, atomically-numbered) alongside the
-- existing legacy row-per-item tables (`commercial_items`, `sales_orders`).
-- This migration ONLY creates schema (tables/columns/constraints/RLS) — it
-- does not migrate any legacy data (Task 2) and does not build the atomic
-- numbering allocator/revision logic (Task 3). `private.document_number_counters`
-- is created empty, with no numbering logic wired to it yet.
--
-- The new Sales Order header/items tables are intentionally temp-named
-- `sales_orders_new` / `sales_order_items` here — the existing `sales_orders`
-- table is untouched in this migration and keeps its name until Task 2's
-- data conversion finalizes the rename.
--
-- RLS on every new table follows the Phase 12 four-role fail-closed pattern
-- (`sales | manager | executive | super_admin`, via public.current_user_role()
-- which returns null for an inactive profile) rather than the plan's
-- original three-role snippet — see
-- supabase/migrations/20260718164503_apply_super_admin_rls_matrix.sql and
-- 20260718171152_harden_super_admin_rls_matrix.sql for the established shape.

create schema if not exists private;

create type public.uom_type as enum ('Unit', 'Pcs', 'Set', 'Lot');
create type public.document_number_mode as enum ('Auto', 'Imported', 'Hariff Backdate');

-- -----------------------------------------------------------------------
-- commercial_documents / commercial_document_items
-- -----------------------------------------------------------------------

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

alter table public.commercial_documents enable row level security;
alter table public.commercial_document_items enable row level security;

create policy "commercial_documents_select"
on public.commercial_documents
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "commercial_documents_insert"
on public.commercial_documents
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

create policy "commercial_documents_update"
on public.commercial_documents
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

create policy "commercial_document_items_select"
on public.commercial_document_items
for select
to authenticated
using (
  exists (
    select 1 from public.commercial_documents d
    where d.id = commercial_document_items.commercial_document_id
      and (
        d.owner_id = (select auth.uid())
        or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
      )
  )
);

create policy "commercial_document_items_insert"
on public.commercial_document_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.commercial_documents d
    where d.id = commercial_document_items.commercial_document_id
      and (
        ((select public.current_user_role()) = 'sales' and d.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
);

create policy "commercial_document_items_update"
on public.commercial_document_items
for update
to authenticated
using (
  exists (
    select 1 from public.commercial_documents d
    where d.id = commercial_document_items.commercial_document_id
      and (
        ((select public.current_user_role()) = 'sales' and d.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
)
with check (
  exists (
    select 1 from public.commercial_documents d
    where d.id = commercial_document_items.commercial_document_id
      and (
        ((select public.current_user_role()) = 'sales' and d.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
);

-- -----------------------------------------------------------------------
-- sales_orders_new / sales_order_items (temp names; finalized in Task 2)
-- -----------------------------------------------------------------------

create table public.sales_orders_new (
  id uuid primary key default gen_random_uuid(),
  so_number text not null,
  customer_po_number text,
  date date not null,
  client_id uuid not null references public.clients(id),
  owner_id uuid not null references public.profiles(id),
  type public.so_type not null,
  tax_type public.tax_type,
  prototype_status public.prototype_status,
  source public.revenue_source not null,
  number_mode public.document_number_mode not null default 'Auto',
  backdate_reason text,
  total_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same FOC money-shape invariant as the legacy sales_orders table: a
  -- Prototype FOC row must never carry a value, and every other row must.
  constraint sales_orders_new_foc_value_shape check (
    (prototype_status is not distinct from 'FOC' and total_value is null)
    or (prototype_status is distinct from 'FOC' and total_value is not null)
  ),
  -- HARIFF backdate numbering is audited: a reason is required whenever
  -- number_mode records a manual backdate, and must stay empty otherwise.
  constraint sales_orders_new_backdate_reason_shape check (
    (number_mode = 'Hariff Backdate' and backdate_reason is not null)
    or (number_mode <> 'Hariff Backdate' and backdate_reason is null)
  )
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders_new(id) on delete cascade,
  product_name text,
  description text,
  qty numeric check (qty is null or qty > 0),
  uom public.uom_type,
  unit_price numeric check (unit_price is null or unit_price > 0),
  line_total numeric check (line_total is null or line_total >= 0),
  line_position integer not null check (line_position > 0),
  unique (sales_order_id, line_position)
);

alter table public.sales_orders_new enable row level security;
alter table public.sales_order_items enable row level security;

create policy "sales_orders_new_select"
on public.sales_orders_new
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
);

create policy "sales_orders_new_insert"
on public.sales_orders_new
for insert
to authenticated
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

create policy "sales_orders_new_update"
on public.sales_orders_new
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
);

create policy "sales_order_items_select"
on public.sales_order_items
for select
to authenticated
using (
  exists (
    select 1 from public.sales_orders_new so
    where so.id = sales_order_items.sales_order_id
      and (
        so.owner_id = (select auth.uid())
        or (select public.current_user_role()) in ('manager', 'executive', 'super_admin')
      )
  )
);

create policy "sales_order_items_insert"
on public.sales_order_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.sales_orders_new so
    where so.id = sales_order_items.sales_order_id
      and (
        ((select public.current_user_role()) = 'sales' and so.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
);

create policy "sales_order_items_update"
on public.sales_order_items
for update
to authenticated
using (
  exists (
    select 1 from public.sales_orders_new so
    where so.id = sales_order_items.sales_order_id
      and (
        ((select public.current_user_role()) = 'sales' and so.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
)
with check (
  exists (
    select 1 from public.sales_orders_new so
    where so.id = sales_order_items.sales_order_id
      and (
        ((select public.current_user_role()) = 'sales' and so.owner_id = (select auth.uid()))
        or (select public.current_user_role()) in ('manager', 'super_admin')
      )
  )
);

-- -----------------------------------------------------------------------
-- Explicit Data API grants: select/insert/update only, no delete. Same
-- boundary reasoning as every other exposed table (PRD §9: archive over
-- hard delete).
-- -----------------------------------------------------------------------

revoke all privileges on table
  public.commercial_documents,
  public.commercial_document_items,
  public.sales_orders_new,
  public.sales_order_items
from anon, authenticated;

grant select, insert, update on table
  public.commercial_documents,
  public.commercial_document_items,
  public.sales_orders_new,
  public.sales_order_items
to authenticated;

grant select, insert, update, delete on table
  public.commercial_documents,
  public.commercial_document_items,
  public.sales_orders_new,
  public.sales_order_items
to service_role;

-- -----------------------------------------------------------------------
-- private.document_number_counters: bare shape only. No numbering logic,
-- allocator functions, or triggers are wired up yet (Task 3's scope). Not
-- exposed to PostgREST since it lives outside the `public` schema.
-- -----------------------------------------------------------------------

create table private.document_number_counters (
  id uuid primary key default gen_random_uuid(),
  series text not null,
  year integer not null,
  last_value integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series, year)
);
