-- Security hardening: pin the mutable search_path on normalized_client_name.
-- It only calls builtins (regexp_replace, lower, coalesce), which always
-- resolve via pg_catalog regardless of search_path, so an empty path is
-- safe and closes the search_path-hijack surface the linter flags.

alter function public.normalized_client_name(text) set search_path = '';
