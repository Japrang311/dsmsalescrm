-- Security hardening: revoke the implicit PUBLIC execute grant that Postgres
-- attaches to every function at creation time. reassign_client_owner and
-- task_control_loop_metrics were only ever `grant`ed to `authenticated`
-- (or not re-granted at all across a `create or replace`), so the default
-- PUBLIC grant was never removed -- Supabase's `anon` role could still call
-- both RPCs over PostgREST and reach their internal role-gate logic.
--
-- Both functions already reject non-privileged/NULL roles at the top of the
-- function body (see 20260728091500_fix_null_role_fail_open_gates.sql), so
-- this is not an active bypass. But relying solely on in-function logic for
-- authorization is exactly the fragile pattern that caused that fail-open
-- bug in the first place -- this adds the missing database-level ACL layer
-- so a future logic mistake can't reopen the gap by itself.

revoke execute on function public.reassign_client_owner(uuid, uuid)
from public, anon;

revoke execute on function public.task_control_loop_metrics()
from public, anon;

grant execute on function public.reassign_client_owner(uuid, uuid)
to authenticated;

grant execute on function public.task_control_loop_metrics()
to authenticated;
