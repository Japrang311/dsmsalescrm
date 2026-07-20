-- activity_log's column-level INSERT grant (harden_super_admin_rls_matrix)
-- predates commercial_document_id, which Phase 11 normalization added to
-- this table afterward without granting it. Every logActivity() call for a
-- normalized commercial document (the only kind that exists post-Phase-11)
-- has been failing with "permission denied for table activity_log" as a
-- result. tasks/follow_up_logs already grant this column (table-wide
-- grants); activity_log is the one holdout with an explicit column list.

grant insert (
  commercial_document_id
) on table public.activity_log to authenticated;
