-- Enable Supabase Realtime for the tables the Pipeline board and Dashboard
-- subscribe to (see src/lib/realtime.ts). Without membership in the
-- supabase_realtime publication the client channel connects but never fires.
--
-- Idempotent: adding a table already in the publication raises an error, so
-- each add is guarded against pg_publication_tables.
do $$
declare
  t text;
begin
  foreach t in array array['commercial_documents', 'tasks', 'sales_orders']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', t
      );
    end if;
  end loop;
end
$$;
