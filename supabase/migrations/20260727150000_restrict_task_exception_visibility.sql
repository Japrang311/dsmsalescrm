-- Migration: restrict_task_exception_visibility
--
-- Sales Task Control Loop implementation-plan Task 10 / project-tracker
-- Task 55. Narrows Executive row-detail visibility to active, non-archived,
-- Manager-owned Task exceptions while preserving company-wide Task metrics via
-- an aggregate-only RPC.

create or replace function private.is_manager_task_exception(
  p_owner_id uuid,
  p_due_date date,
  p_workflow_status public.task_workflow_status,
  p_archived boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    not p_archived
    and p_workflow_status in ('Open', 'In Progress', 'Waiting External')
    and exists (
      select 1
      from public.profiles p
      where p.id = p_owner_id
        and p.account_status = 'active'
        and p.role = 'manager'
    )
    and exists (
      select 1
      from public.compute_task_due_state(p_due_date, p_workflow_status) ds
      where ds.due_state = 'Escalated'
    ),
    false
  );
$$;

comment on function private.is_manager_task_exception(
  uuid, date, public.task_workflow_status, boolean
) is
'True only for active, non-archived, Manager-owned Tasks whose derived due state is Escalated. Used by Executive detail RLS boundaries.';

grant execute on function private.is_manager_task_exception(
  uuid, date, public.task_workflow_status, boolean
) to authenticated, service_role;

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select"
on public.tasks
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
  or (
    (select public.current_user_role()) = 'executive'
    and private.is_manager_task_exception(owner_id, due_date, workflow_status, archived)
  )
);

drop policy if exists "follow_up_logs_select" on public.follow_up_logs;
create policy "follow_up_logs_select"
on public.follow_up_logs
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
  or (
    (select public.current_user_role()) = 'executive'
    and task_id is not null
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and private.is_manager_task_exception(
          t.owner_id, t.due_date, t.workflow_status, t.archived
        )
    )
  )
);

drop policy if exists "activity_log_select" on public.activity_log;
create policy "activity_log_select"
on public.activity_log
for select
to authenticated
using (
  ((select public.current_user_role()) = 'sales' and owner_id = (select auth.uid()))
  or (select public.current_user_role()) in ('manager', 'super_admin')
  or (
    (select public.current_user_role()) = 'executive'
    and task_id is not null
    and exists (
      select 1
      from public.tasks t
      where t.id = task_id
        and private.is_manager_task_exception(
          t.owner_id, t.due_date, t.workflow_status, t.archived
        )
    )
  )
);

create or replace function public.task_control_loop_metrics()
returns table (
  total_tasks bigint,
  active_tasks bigint,
  upcoming_tasks bigint,
  today_tasks bigint,
  overdue_tasks bigint,
  escalated_tasks bigint,
  done_tasks bigint,
  cancelled_tasks bigint,
  archived_tasks bigint,
  calendar_incomplete_tasks bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
begin
  if v_role not in ('manager', 'executive', 'super_admin') then
    raise exception 'task_control_loop_metrics is not available for role %', v_role
      using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint as total_tasks,
    count(*) filter (
      where t.workflow_status in ('Open', 'In Progress', 'Waiting External')
        and not t.archived
    )::bigint as active_tasks,
    count(*) filter (where ds.due_state = 'Upcoming' and not t.archived)::bigint as upcoming_tasks,
    count(*) filter (where ds.due_state = 'Today' and not t.archived)::bigint as today_tasks,
    count(*) filter (where ds.due_state = 'Overdue' and not t.archived)::bigint as overdue_tasks,
    count(*) filter (where ds.due_state = 'Escalated' and not t.archived)::bigint as escalated_tasks,
    count(*) filter (where t.workflow_status = 'Done')::bigint as done_tasks,
    count(*) filter (where t.workflow_status = 'Cancelled')::bigint as cancelled_tasks,
    count(*) filter (where t.archived)::bigint as archived_tasks,
    count(*) filter (where ds.calendar_incomplete)::bigint as calendar_incomplete_tasks
  from public.tasks t
  cross join lateral public.compute_task_due_state(t.due_date, t.workflow_status) ds;
end;
$$;

comment on function public.task_control_loop_metrics() is
'Aggregate-only Task Control Loop metrics for Manager, Executive, and Super Admin. Returns counts only: no task ids, owner ids, titles, notes, or timestamps.';

revoke execute on function public.task_control_loop_metrics() from public;
grant execute on function public.task_control_loop_metrics() to authenticated;
