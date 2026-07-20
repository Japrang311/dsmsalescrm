-- Sales Order edit support: client/owner correction + client search index +
-- total auto-recompute.
--
-- Plain-language summary: the Sales Order detail page was read-only except
-- tax type. The owner asked to make Klien, Customer PO, Tanggal, Sales
-- Owner, and Line Items editable, after finding a real imported record
-- whose client name failed to display for its own sales owner. Investigation
-- showed the underlying data was correct — client_id was set — but
-- clients_select RLS correctly hid that client because its registered
-- owner_id (from the bulk sheet-import client-matching heuristic) differs
-- from the Sales Order's own owner_id. Scale check on 2026-07-20: 21 of 189
-- imported Sales Orders and 74 of 400 commercial documents have this same
-- owner mismatch, so this is a real, recurring case, not a one-off.

-- 1. Client search index: lets any signed-in, active user look up id+name
--    for ANY client, regardless of clients_select's ownership rule, so the
--    Sales Order edit form's "Klien" field can find and correct a client
--    even when it is owned by a different sales rep. Exposes only id and
--    name — no status, source, spending, follow-up dates, or owner_id — so
--    it does not loosen access to real client detail/revenue data;
--    clients_select on the base table is unchanged. Fails closed for
--    inactive accounts via current_user_role(), which returns null when
--    the caller's own profile is not active.
create view public.client_search_index
with (security_invoker = false) as
select id, name
from public.clients
where public.current_user_role() is not null;

revoke all privileges on table public.client_search_index from public, anon;
grant select on table public.client_search_index to authenticated, service_role;

-- 2. Reopen client_id/owner_id as browser-editable columns on sales_orders.
--    These were deliberately excluded by
--    20260719041351_harden_normalized_document_permissions.sql after an
--    earlier table-wide grant made them unintentionally writable. Owner
--    decision 2026-07-20: reopen them because sales_orders_update's WITH
--    CHECK clause already enforces the real boundary — a sales-role caller
--    can only keep owner_id equal to their own auth.uid() (never reassign
--    to someone else), while manager/super_admin remain unrestricted. RLS
--    is the access-control boundary here, not this column grant.
grant update (client_id, owner_id) on table public.sales_orders to authenticated;

-- 3. Auto-recompute sales_orders.total_value whenever its items change.
--    sales_order_items has allowed column-level UPDATE (product_name,
--    description, qty, uom, unit_price, line_total, line_position) since
--    20260719041351, but nothing recomputed the parent header's cached
--    total_value — so editing an item's qty/price would silently desync
--    the total that Dashboard/Reports revenue figures read from. FOC rows
--    keep total_value null, matching the existing
--    sales_orders_new_foc_value_shape check constraint.
create or replace function private.recompute_sales_order_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_so_id uuid;
  is_foc boolean;
begin
  target_so_id := coalesce(new.sales_order_id, old.sales_order_id);

  select (prototype_status is not distinct from 'FOC')
  into is_foc
  from public.sales_orders
  where id = target_so_id;

  if not is_foc then
    update public.sales_orders
    set total_value = (
      select coalesce(sum(line_total), 0)
      from public.sales_order_items
      where sales_order_id = target_so_id
    )
    where id = target_so_id;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all privileges on function private.recompute_sales_order_total()
from public, anon, authenticated, service_role;

create trigger sales_order_items_recompute_total
after insert or update or delete on public.sales_order_items
for each row execute function private.recompute_sales_order_total();

comment on function private.recompute_sales_order_total() is
'Keeps sales_orders.total_value in sync with the sum of its non-FOC line items line_total.';
