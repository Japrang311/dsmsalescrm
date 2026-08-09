-- Migration: sync_client_next_fu_from_tasks
--
-- clients.next_fu has never been written by the app since the Sales Task
-- Control Loop redesign (2026-07-27): record_task_progress() writes the
-- "next action" date onto tasks.next_action_date (and logs it in
-- follow_up_logs.next_fu_date), but nothing ever copies it back onto the
-- client row. Result: clients.next_fu is null for every real client
-- (confirmed live: 73/73 active clients), which is why the Dashboard's
-- Activity Compliance card reads 0% and the Clients table's Next FU
-- column/filter are always empty.
--
-- Fix: clients.next_fu becomes a derived value, kept in sync by a trigger
-- on public.tasks -- the EARLIEST next_action_date among that client's
-- still-open (not Done/Cancelled) tasks, or null if it has none. This
-- matches how the dashboard already computes "overdue"/"open tasks"
-- (from tasks.workflow_status), not the old flat single-value model.
--
-- security definer, private schema, no execute grants (matches
-- private.is_active_business_owner()-style internal helpers): this is a
-- system-maintained derived column, not something callers invoke
-- directly, and column-level clients_update RLS/grants don't reliably
-- cover every caller of record_task_progress (e.g. a manager progressing
-- a task on a client they don't own).

create or replace function private.recompute_client_next_fu(p_client_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.clients
  set next_fu = (
    select min(t.next_action_date)
    from public.tasks t
    where t.client_id = p_client_id
      and t.workflow_status not in ('Done', 'Cancelled')
      and t.next_action_date is not null
  )
  where id = p_client_id;
$$;

revoke all on function private.recompute_client_next_fu(uuid)
from public, anon, authenticated;

create or replace function private.trg_recompute_client_next_fu()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.client_id is not null then
      perform private.recompute_client_next_fu(old.client_id);
    end if;
    return old;
  end if;

  if new.client_id is not null then
    perform private.recompute_client_next_fu(new.client_id);
  end if;

  if tg_op = 'UPDATE' and old.client_id is not null
     and old.client_id is distinct from new.client_id then
    perform private.recompute_client_next_fu(old.client_id);
  end if;

  return new;
end;
$$;

revoke all on function private.trg_recompute_client_next_fu()
from public, anon, authenticated;

create trigger tasks_sync_client_next_fu
after insert or update of workflow_status, next_action_date, client_id or delete
on public.tasks
for each row
execute function private.trg_recompute_client_next_fu();

-- One-time backfill so existing tasks/clients are correct immediately,
-- not just from the next task update onward.
update public.clients c
set next_fu = (
  select min(t.next_action_date)
  from public.tasks t
  where t.client_id = c.id
    and t.workflow_status not in ('Done', 'Cancelled')
    and t.next_action_date is not null
);
