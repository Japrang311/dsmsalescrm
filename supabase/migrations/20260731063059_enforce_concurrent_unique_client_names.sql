-- The existing duplicate-name trigger protects sequential writes, but two
-- concurrent transactions can both pass its EXISTS check before either row
-- commits. Add a nullable guard key plus a unique index so PostgreSQL itself
-- arbitrates concurrent inserts and renames.
--
-- Historical rows intentionally remain NULL. This lets the migration preserve
-- any legacy duplicate groups without merging or deleting audit-linked client
-- records. The trigger still checks every existing name, so a new write cannot
-- duplicate one of those historical rows.

alter table public.clients
add column name_dedupe_key text;

comment on column public.clients.name_dedupe_key is
  'Database-managed normalized name used only to prevent new concurrent duplicates; legacy rows remain null until renamed.';

create unique index clients_name_normalized_unique
on public.clients (name_dedupe_key);

create or replace function public.prevent_duplicate_client_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_normalized_name text;
begin
  v_normalized_name := public.normalized_client_name(new.name);
  new.name_dedupe_key := v_normalized_name;

  if tg_op = 'UPDATE'
    and public.normalized_client_name(old.name) = v_normalized_name then
    return new;
  end if;

  if exists (
    select 1
    from public.clients c
    where c.id <> new.id
      and public.normalized_client_name(c.name) = v_normalized_name
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'clients_name_normalized_unique',
      message = format('Client name already exists: %s', new.name),
      detail = 'CLIENT_NAME_DUPLICATE';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_client_name on public.clients;

create trigger prevent_duplicate_client_name
before insert or update of name, name_dedupe_key on public.clients
for each row
execute function public.prevent_duplicate_client_name();
