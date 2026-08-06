-- Security fix: 20260807010000_add_sales_order_source_quotation_link.sql
-- dropped public.create_sales_order's 11-parameter signature and recreated
-- it with a 12th parameter. The original signature had `anon`/`public`
-- EXECUTE explicitly revoked (see 20260719033236_add_atomic_document_
-- numbering.sql); DROP FUNCTION discards that grant along with the old
-- signature, and a fresh CREATE OR REPLACE reinstates Postgres's default
-- PUBLIC EXECUTE grant -- reopening the anon-callable gap the original
-- migration had closed. Restore the same revoke/grant on the new signature.

revoke all privileges on function public.create_sales_order(
  uuid,
  date,
  text,
  public.so_type,
  public.tax_type,
  public.prototype_status,
  public.revenue_source,
  public.document_number_mode,
  text,
  text,
  jsonb,
  uuid
) from public, anon;

grant execute on function public.create_sales_order(
  uuid,
  date,
  text,
  public.so_type,
  public.tax_type,
  public.prototype_status,
  public.revenue_source,
  public.document_number_mode,
  text,
  text,
  jsonb,
  uuid
) to authenticated;
