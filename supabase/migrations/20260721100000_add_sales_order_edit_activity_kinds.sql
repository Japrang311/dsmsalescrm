-- PostgreSQL does not allow enum values added inside a transaction to be used
-- until that transaction commits. Keep all enum extensions in this dedicated
-- migration boundary, same pattern as 20260718173152_add_team_admin_activity_kinds.sql.
alter type public.activity_kind
  add value if not exists 'sales_order_header_change';

alter type public.activity_kind
  add value if not exists 'sales_order_item_change';
