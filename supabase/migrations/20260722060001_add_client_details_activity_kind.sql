-- PostgreSQL does not allow enum values added inside a transaction to be used
-- until that transaction commits. Keep all enum extensions in this dedicated
-- migration boundary, same pattern as
-- 20260721100000_add_sales_order_edit_activity_kinds.sql.
alter type public.activity_kind
  add value if not exists 'client_details_change';
