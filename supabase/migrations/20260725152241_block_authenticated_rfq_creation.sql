-- Keep historical RFQ rows readable, but reject new RFQ records and attempts
-- to turn another document into an RFQ through the authenticated Data API.
create or replace function private.reject_retired_rfq_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_user in ('authenticated', 'anon') and new.type::text = 'RFQ' then
    if tg_op = 'INSERT' then
      raise exception using
        errcode = '23514',
        message = 'RFQ_RETIRED: RFQ creation is no longer supported';
    elsif old.type is distinct from new.type then
      raise exception using
        errcode = '23514',
        message = 'RFQ_RETIRED: documents cannot be converted to RFQ';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.reject_retired_rfq_write() from public;

drop trigger if exists commercial_documents_reject_retired_rfq_write
  on public.commercial_documents;

create trigger commercial_documents_reject_retired_rfq_write
before insert or update of type on public.commercial_documents
for each row
execute function private.reject_retired_rfq_write();
