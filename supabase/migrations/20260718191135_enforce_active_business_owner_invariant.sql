-- Enforce operational ownership independently of RLS. Service-role imports,
-- lifecycle RPCs, and direct database maintenance must not be able to leave
-- business rows assigned to inactive or non-operational profiles.
--
-- FOR SHARE deliberately conflicts with the row lock taken by role/status
-- updates. FOR KEY SHARE would not conflict with a non-key profile update and
-- would leave a demotion/deactivation race open.

create or replace function private.enforce_active_business_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_id uuid;
  candidate_role text;
  candidate_status text;
begin
  if tg_nargs <> 1 or tg_argv[0] not in ('owner_id', 'sales_id') then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_BUSINESS_OWNER_TRIGGER_CONFIGURATION';
  end if;

  candidate_id := (to_jsonb(new) ->> tg_argv[0])::uuid;

  select p.role::text, p.account_status::text
  into candidate_role, candidate_status
  from public.profiles as p
  where p.id = candidate_id
  for share;

  if not found
    or candidate_status <> 'active'
    or candidate_role not in ('sales', 'manager')
  then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_BUSINESS_OWNER';
  end if;

  return new;
end;
$$;

revoke all privileges on function private.enforce_active_business_owner()
from public, anon, authenticated, service_role;

create trigger clients_enforce_active_owner
before insert or update of owner_id on public.clients
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger tasks_enforce_active_owner
before insert or update of owner_id on public.tasks
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger commercial_items_enforce_active_owner
before insert or update of owner_id on public.commercial_items
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger sales_orders_enforce_active_owner
before insert or update of owner_id on public.sales_orders
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger follow_up_logs_enforce_active_owner
before insert or update of owner_id on public.follow_up_logs
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger targets_enforce_active_sales
before insert or update of sales_id on public.targets
for each row execute function private.enforce_active_business_owner('sales_id');

comment on function private.enforce_active_business_owner() is
'Serialized database invariant: every current business owner is an active Sales or Manager profile.';
