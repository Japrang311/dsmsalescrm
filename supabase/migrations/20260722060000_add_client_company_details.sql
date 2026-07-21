-- Client database feature: company info + up to 3 contact persons per client.
--
-- Plain-language summary: the owner wants each client record to hold company
-- address/industry/website/notes plus Contact Person 1, 2, 3 (each with
-- name/email/phone/mobile), on top of the revenue/status data that already
-- works. Flat nullable columns, not a child table — the UI has exactly 3
-- fixed contact slots, and this way the existing `select("*")` reads and the
-- existing clients_select/update RLS policies cover the new columns
-- automatically. RLS is row-level, so no RLS policy changes are needed.
--
-- UPDATE on public.clients is column-level, not table-level (see
-- 20260718164503_apply_super_admin_rls_matrix.sql:277-284 — only name,
-- status, source, spending_ytd, last_fu, next_fu are currently grantable to
-- authenticated). Every new column below must be added to that grant here,
-- or every edit from the app will fail with "permission denied for table
-- clients" — same class of bug fixed for sales_order_items.description in
-- 20260721110000_fix_sales_order_items_description_grant.sql.
alter table public.clients
  add column address  text,
  add column industry text,
  add column website   text,
  add column notes    text,
  add column cp1_name   text,
  add column cp1_email  text,
  add column cp1_phone  text,
  add column cp1_mobile text,
  add column cp2_name   text,
  add column cp2_email  text,
  add column cp2_phone  text,
  add column cp2_mobile text,
  add column cp3_name   text,
  add column cp3_email  text,
  add column cp3_phone  text,
  add column cp3_mobile text;

grant update (
  address,
  industry,
  website,
  notes,
  cp1_name,
  cp1_email,
  cp1_phone,
  cp1_mobile,
  cp2_name,
  cp2_email,
  cp2_phone,
  cp2_mobile,
  cp3_name,
  cp3_email,
  cp3_phone,
  cp3_mobile
) on table public.clients to authenticated;

-- Note for future maintainers: client_search_index (see
-- 20260721000000_expand_client_search_index.sql) intentionally exposes only
-- id/name/owner_id to every active user regardless of ownership, so the
-- client picker can find any client by name. It must NOT be extended to
-- expose these new contact/company columns cross-owner.
