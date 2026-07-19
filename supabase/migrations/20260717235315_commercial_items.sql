-- Migration: commercial_items
--
-- Plain-language summary: this is the RFQ/Quotation/Order/Prototype/PO/SO
-- pipeline table (PRD.md §7 "Commercial Item"), mirroring
-- src/lib/mock/data.ts's CommercialItem type.
--
-- Note on `stage`: the mock type keeps this as a free-form string because
-- valid stages differ depending on `source_flow` (RFQ_STAGES vs
-- REPEAT_STAGES vs PROTOTYPE_STAGES are three different lists). Enforcing
-- "this stage is only valid for this flow" would need either a lookup
-- table or a conditional check constraint — more than what's asked for
-- right now, so `stage` stays a plain text column, exactly matching the
-- mock's own looseness here.
--
-- `tax_type` and `prototype_status` are created here but will be reused
-- as-is by the sales_orders table in Phase 5 — no need to recreate them.

create type public.commercial_type as enum ('RFQ', 'Quotation', 'Direct Order', 'Prototype', 'Customer PO', 'Sales Order');
create type public.source_flow as enum ('RFQ / New Product', 'Existing / Repeat Order', 'Prototype');
create type public.tax_type as enum ('PPN', 'Non-PPN');
create type public.prototype_status as enum ('Paid', 'FOC');

create table public.commercial_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  owner_id uuid not null references public.profiles (id),
  type public.commercial_type not null,
  source_flow public.source_flow not null,
  stage text not null,
  description text not null,
  project_name text,
  estimated_value numeric not null default 0,
  updated_at timestamptz not null default now(),
  -- Recorded manually by Sales — these numbers come from an external admin
  -- process (PRD §15), the app never generates them.
  quotation_number text,
  customer_po_number text,
  so_number text,
  tax_type public.tax_type,
  prototype_status public.prototype_status,
  next_action_date date,
  created_at timestamptz not null default now()
);

alter table public.commercial_items enable row level security;

create policy "commercial_items_select"
on public.commercial_items
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.current_user_role() in ('manager', 'executive')
);

create policy "commercial_items_insert"
on public.commercial_items
for insert
to authenticated
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

create policy "commercial_items_update"
on public.commercial_items
for update
to authenticated
using (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
)
with check (
  (public.current_user_role() = 'sales' and owner_id = auth.uid())
  or public.current_user_role() = 'manager'
);

-- No DELETE policy — same reasoning as clients/tasks (PRD §9: archive over
-- hard delete; a commercial item's lifecycle ends via stage, e.g. "Closed
-- Lost", not row removal).

grant select, insert, update on public.commercial_items to authenticated;
grant select, insert, update, delete on public.commercial_items to service_role;

-- Now that commercial_items exists, add the FK constraint tasks.sql
-- deliberately deferred (see that migration's comment).
alter table public.tasks
  add constraint tasks_commercial_item_id_fkey
  foreign key (commercial_item_id) references public.commercial_items (id);
