-- Restore the column-level mutation boundary that existed before the Phase 11
-- table swap. The normalization migration granted table-wide UPDATE on the
-- replacement relations, which unintentionally made owner_id and
-- server-controlled numbering/revision fields browser-writable.

revoke update on table public.commercial_documents from authenticated;
grant update (
  stage,
  client_address,
  so_number,
  note,
  updated_at
) on table public.commercial_documents to authenticated;

revoke update on table public.commercial_document_items from authenticated;
grant update (
  product_name,
  description,
  qty,
  uom,
  unit_price,
  line_total,
  line_position
) on table public.commercial_document_items to authenticated;

revoke update on table public.sales_orders from authenticated;
grant update (
  customer_po_number,
  date,
  tax_type,
  updated_at
) on table public.sales_orders to authenticated;

revoke update on table public.sales_order_items from authenticated;
grant update (
  product_name,
  description,
  qty,
  uom,
  unit_price,
  line_total,
  line_position
) on table public.sales_order_items to authenticated;

-- Reassert the active-owner condition that the normalized replacement
-- policies accidentally omitted. Without it, privileged users could still
-- mutate a row after its owner was deactivated.
drop policy if exists "commercial_documents_update"
on public.commercial_documents;
create policy "commercial_documents_update"
on public.commercial_documents
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

drop policy if exists "sales_orders_new_update"
on public.sales_orders;
create policy "sales_orders_update"
on public.sales_orders
for update
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
)
with check (
  (select private.is_active_business_owner(owner_id))
  and (
    ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
    or (select public.current_user_role()) in ('manager', 'super_admin')
  )
);

-- The old view followed the OID of the legacy Sales Order table when that
-- table moved into private. Recreate it after the swap so it reads the
-- normalized header and keeps caller-scoped RLS through security_invoker.
drop view public.revenue_recognized;

create view public.revenue_recognized
with (security_invoker = true) as
select *
from public.sales_orders
where prototype_status is distinct from 'FOC';

revoke all privileges on table public.revenue_recognized
from public, anon, authenticated;
grant select on table public.revenue_recognized
to authenticated, service_role;
