-- The Quotation detail edit feature (commit 296fe05, "feat: enable commercial
-- detail edits") lets a user correct Quotation Number, Quotation Date, and
-- Expired Date via updateCommercialDocument(). That feature shipped after
-- 20260719041351_harden_normalized_document_permissions.sql locked
-- commercial_documents UPDATE down to a column allowlist that never
-- included these columns (quotation_expired_date did not even exist yet),
-- so every save of those fields fails with a permission-denied error.
-- Row-level access is still governed by the existing commercial_documents_update
-- RLS policy; this only adds columns to the allowlist that policy applies to.

grant update (
  quotation_number,
  quotation_base_number,
  document_date,
  quotation_expired_date
) on table public.commercial_documents to authenticated;
