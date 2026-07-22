-- Add "Jabatan" (job title/position) field to each of the 3 client contact
-- persons, requested right after the initial client-database feature shipped.
-- Same flat-column pattern as 20260722060000_add_client_company_details.sql.
--
-- UPDATE on public.clients is column-level (see
-- 20260718164503_apply_super_admin_rls_matrix.sql:277-284) — every new
-- column must be added to a grant statement here, or edits will fail with
-- "permission denied for table clients".
alter table public.clients
  add column cp1_position text,
  add column cp2_position text,
  add column cp3_position text;

grant update (
  cp1_position,
  cp2_position,
  cp3_position
) on table public.clients to authenticated;
