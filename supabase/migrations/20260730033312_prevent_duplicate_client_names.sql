-- Block new client duplicates at the database boundary. Existing historical
-- duplicates are left untouched; this trigger only fires when a client is
-- inserted or when its name is changed.

create or replace function public.normalized_client_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^[:alnum:]]+', '', 'g')
$$;

create or replace function public.prevent_duplicate_client_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_normalized_name text;
begin
  v_normalized_name := public.normalized_client_name(new.name);

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
before insert or update of name on public.clients
for each row
execute function public.prevent_duplicate_client_name();

grant execute on function public.normalized_client_name(text) to authenticated;
grant execute on function public.normalized_client_name(text) to service_role;
revoke execute on function public.prevent_duplicate_client_name() from public;
