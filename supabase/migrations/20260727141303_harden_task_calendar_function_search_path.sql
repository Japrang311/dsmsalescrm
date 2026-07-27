-- Task 17 verification hardening:
-- Supabase advisors flagged the Task Control Loop calendar functions as
-- role-mutable because Task 4 created them without an explicit search_path.
-- The functions already schema-qualify table/function references, so setting
-- an empty search_path changes only the execution environment, not behavior.

alter function public.is_business_day(date)
  set search_path = '';

alter function public.count_business_days_strictly_between(date, date)
  set search_path = '';

alter function public.business_calendar_incomplete(date, date)
  set search_path = '';

alter function public.compute_task_due_state(date, public.task_workflow_status, date)
  set search_path = '';
