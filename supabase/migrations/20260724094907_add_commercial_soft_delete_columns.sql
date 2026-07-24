alter table public.commercial_documents
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);

alter table public.sales_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);

create index commercial_documents_active_owner_date_idx
  on public.commercial_documents (owner_id, document_date desc)
  where deleted_at is null;

create index sales_orders_active_owner_date_idx
  on public.sales_orders (owner_id, date desc)
  where deleted_at is null;

grant update (deleted_at, deleted_by)
  on table public.commercial_documents
  to authenticated;

grant update (deleted_at, deleted_by)
  on table public.sales_orders
  to authenticated;
