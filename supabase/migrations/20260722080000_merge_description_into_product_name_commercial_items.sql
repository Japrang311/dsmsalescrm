-- Data fix: commercial_document_items has the same historical import shape
-- issue that sales_order_items had (see 20260721000001_merge_description_
-- into_product_name.sql) — most rows carry the real product name in
-- `description` with `product_name` left NULL. Move it over so the Nama
-- Product columns added on 2026-07-22 (Client Detail Quotations/Sales
-- Orders tabs) show real data instead of "—".
--
-- Only rows where product_name is empty and description has real content
-- are touched (718 of 721 rows in production as of 2026-07-22). The 1 row
-- that already has distinct, correct values in both columns (e.g.
-- product_name "Cable Tray", description "HDG Finish") is left alone, and
-- the 1 row with both empty is a no-op.
update public.commercial_document_items
set product_name = description,
    description = null
where product_name is null
  and description is not null
  and trim(description) <> '';
