-- Add Propinsi/Kota (province/city) fields to clients, requested for the
-- company info section next to Alamat. Stored as plain text (the official
-- name from the searchable Indonesia region dropdown in
-- src/lib/indonesia-regions.ts), same flat-column pattern as address/
-- industry/website/notes — not a foreign key to a wilayah table, since the
-- app only needs to display/filter by name, not join further.
--
-- UPDATE on public.clients is column-level (see
-- 20260718164503_apply_super_admin_rls_matrix.sql:277-284) — every new
-- column must be added to a grant statement here, or edits will fail with
-- "permission denied for table clients".
alter table public.clients
  add column province text,
  add column city text;

grant update (
  province,
  city
) on table public.clients to authenticated;
