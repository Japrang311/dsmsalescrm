-- Fix commercial ownership count predicate centralization (Phase 12 Task 5)
-- Replace pagination-based client-side count with protected server-side SQL function
-- using the exact same predicates as the Task 4 transfer logic.
--
-- Problem fixed:
-- - JavaScript trim() removes all whitespace (space, tab, newline, non-breaking-space)
-- - PostgreSQL btrim() only trims spaces
-- - Stage " \t closed won \t " (with tabs) is terminal on server but client misses it
-- - Offset pagination can skip/double-count rows if ownership changes between requests
--
-- Solution:
-- - Centralize count logic in SQL using the Task 4 predicate: lower(btrim(stage)) not in (...)
-- - Return aggregate count instead of walking rows in browser
-- - Single atomic call eliminates pagination stale-snapshot risk
-- - Function is browser-callable and checks caller role (manager/executive/super_admin only)

create or replace function private.count_active_commercial_items(target_owner_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.commercial_items
  where owner_id = target_owner_id
    and lower(btrim(stage)) not in (
      'closed won',
      'closed lost',
      'revenue recorded',
      'closed'
    );
$$;

revoke all privileges on function private.count_active_commercial_items(uuid)
from public, anon, authenticated;
grant execute on function private.count_active_commercial_items(uuid) to service_role;

-- Public RPC wrapper for authenticated browser clients with privileged roles.
-- security definer: runs with owner privileges; checks internal role gate.
-- Only managers/executives/super_admins can call this; all others get an exception.
create or replace function public.admin_count_active_commercial_items(p_owner_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role public.app_role;
begin
  -- Fetch the current user's role. If null, user is not authenticated or inactive.
  caller_role := public.current_user_role();
  if caller_role is null then
    raise exception using message = 'ACTIVE_PRIVILEGED_ROLE_REQUIRED';
  end if;

  -- Only manager/executive/super_admin can query team member ownership counts.
  if caller_role not in ('manager', 'executive', 'super_admin') then
    raise exception using message = 'INSUFFICIENT_PRIVILEGE';
  end if;

  return private.count_active_commercial_items(p_owner_id);
end;
$$;

revoke all privileges on function public.admin_count_active_commercial_items(uuid)
from public, anon, authenticated;
grant execute on function public.admin_count_active_commercial_items(uuid) to authenticated, service_role;
