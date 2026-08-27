-- Manual edits to commercial_documents.quotation_number (enabled by
-- 20260728050300_grant_quotation_edit_columns.sql, used to match a client's
-- pre-existing/legacy quotation numbering that predates this app) never
-- touched private.document_number_counters. Once a manually-set number
-- exceeded the counter, the next atomically-allocated quotation eventually
-- collided with it (unique constraint violation on
-- commercial_documents_quotation_number_key).
--
-- 1) One-time reconciliation: raise each QUO/year counter to the real max
--    quotation_number already present, for every year currently in the
--    table (mirrors the GREATEST(...) upsert already used by
--    admin_import_normalized_documents for bulk import reconciliation).
-- 2) Trigger: keep it that way going forward by bumping the counter
--    whenever a quotation_number is inserted/updated to a value at or
--    above the counter, so manual edits can never desync it again.

insert into private.document_number_counters (series, year_code, last_value, updated_at)
select
  'QUO',
  substring(quotation_number from '^DSM-(\d{2})QUO-\d{4}$')::smallint,
  max(substring(quotation_number from '^DSM-\d{2}QUO-(\d{4})$')::integer),
  now()
from public.commercial_documents
where type = 'Quotation'
  and quotation_number ~ '^DSM-\d{2}QUO-\d{4}$'
group by 2
on conflict (series, year_code)
do update set
  last_value = greatest(private.document_number_counters.last_value, excluded.last_value),
  updated_at = now();

create or replace function private.sync_quotation_number_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year smallint;
  v_number integer;
begin
  if new.type <> 'Quotation' or new.quotation_number is null
    or new.quotation_number !~ '^DSM-\d{2}QUO-\d{4}$'
  then
    return new;
  end if;

  v_year := substring(new.quotation_number from '^DSM-(\d{2})QUO-\d{4}$')::smallint;
  v_number := substring(new.quotation_number from '^DSM-\d{2}QUO-(\d{4})$')::integer;

  insert into private.document_number_counters (series, year_code, last_value, updated_at)
  values ('QUO', v_year, v_number, now())
  on conflict (series, year_code)
  do update set
    last_value = greatest(private.document_number_counters.last_value, excluded.last_value),
    updated_at = now();

  return new;
end;
$$;

revoke all privileges on function private.sync_quotation_number_counter() from public, anon, authenticated;

drop trigger if exists sync_quotation_number_counter_trigger on public.commercial_documents;
create trigger sync_quotation_number_counter_trigger
after insert or update of quotation_number on public.commercial_documents
for each row
execute function private.sync_quotation_number_counter();
