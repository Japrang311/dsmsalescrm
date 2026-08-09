create or replace function public.import_business_calendar_holidays(p_rows jsonb)
returns table (
  imported_count integer,
  min_date date,
  max_date date,
  affected_years integer[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if public.current_user_role() not in ('manager', 'super_admin') then
    raise exception using message = 'BUSINESS_CALENDAR_ADMIN_REQUIRED';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception using message = 'BUSINESS_CALENDAR_ROWS_ARRAY_REQUIRED';
  end if;

  create temporary table tmp_business_calendar_import (
    holiday_date date not null,
    label text not null,
    source text not null
  ) on commit drop;

  insert into tmp_business_calendar_import (holiday_date, label, source)
  select
    nullif(trim(row_value->>'holiday_date'), '')::date,
    nullif(trim(row_value->>'label'), ''),
    coalesce(nullif(trim(row_value->>'source'), ''), 'manual-import')
  from jsonb_array_elements(p_rows) as input(row_value);

  if exists (
    select 1
    from tmp_business_calendar_import
    where holiday_date is null
      or label is null
      or label = ''
      or source is null
      or source = ''
  ) then
    raise exception using message = 'BUSINESS_CALENDAR_INVALID_ROW';
  end if;

  if exists (
    select 1
    from tmp_business_calendar_import
    group by holiday_date
    having count(*) > 1
  ) then
    raise exception using message = 'BUSINESS_CALENDAR_DUPLICATE_DATE';
  end if;

  delete from public.business_calendar_holidays existing
  using tmp_business_calendar_import imported
  where existing.holiday_date = imported.holiday_date;

  insert into public.business_calendar_holidays (
    holiday_date,
    label,
    source,
    entered_by
  )
  select
    imported.holiday_date,
    imported.label,
    imported.source,
    v_actor_id
  from tmp_business_calendar_import imported
  order by imported.holiday_date;

  return query
  select
    count(*)::integer,
    min(holiday_date),
    max(holiday_date),
    array_agg(distinct extract(year from holiday_date)::integer order by extract(year from holiday_date)::integer)
  from tmp_business_calendar_import;
end;
$$;

comment on function public.import_business_calendar_holidays(jsonb) is
'Atomic Manager/Super Admin import for business calendar holidays. Validates rows and duplicate dates, replaces matching dates, and inserts all rows in one transaction under caller RLS.';

revoke all on function public.import_business_calendar_holidays(jsonb) from public, anon;
grant execute on function public.import_business_calendar_holidays(jsonb) to authenticated;
