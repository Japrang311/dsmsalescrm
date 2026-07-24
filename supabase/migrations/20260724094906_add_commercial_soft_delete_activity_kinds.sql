alter type public.activity_kind
  add value if not exists 'commercial_document_deleted';

alter type public.activity_kind
  add value if not exists 'commercial_document_restored';

alter type public.activity_kind
  add value if not exists 'sales_order_deleted';

alter type public.activity_kind
  add value if not exists 'sales_order_restored';
