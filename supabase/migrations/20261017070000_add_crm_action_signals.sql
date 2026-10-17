-- Task 12a: deterministic, read-only CRM action signals. This aggregate keeps
-- business rules server-side so counts are exact beyond the loaded page.
-- It does not create Tasks, mutate business status, or infer legacy timestamps.

create index if not exists activity_log_commercial_progress_idx
  on public.activity_log (commercial_document_id, created_at desc)
  where kind = 'commercial_item_stage_change' and event_data is not null;

create index if not exists follow_up_logs_commercial_progress_idx
  on public.follow_up_logs (commercial_document_id, fu_date desc)
  where commercial_document_id is not null;

create function public.crm_action_signals(
  p_as_of date default null,
  p_owner_id uuid default null,
  p_client_status public.client_status default null,
  p_limit integer default 50,
  p_after jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_user_role();
  v_owner_id uuid;
  v_as_of date := coalesce(
    p_as_of,
    (statement_timestamp() at time zone 'Asia/Jakarta')::date
  );
  v_cursor_priority integer;
  v_cursor_due date;
  v_cursor_value_known boolean;
  v_cursor_value numeric;
  v_cursor_entity uuid;
  v_cursor_rule text;
  v_totals jsonb;
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb;
begin
  if v_role is null or auth.uid() is null then
    raise exception 'ACTIVE_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_ACTION_SIGNAL_PAGE' using errcode = '22023';
  end if;

  if p_after is not null then
    if jsonb_typeof(p_after) <> 'object'
       or not (p_after ?& array[
         'priority', 'dueDate', 'valueKnown', 'value', 'entityId', 'ruleId'
       ])
       or exists (
         select 1
         from jsonb_object_keys(p_after) key
         where key not in (
           'priority', 'dueDate', 'valueKnown', 'value', 'entityId', 'ruleId'
         )
       )
    then
      raise exception 'INVALID_ACTION_SIGNAL_CURSOR' using errcode = '22023';
    end if;
    begin
      v_cursor_priority := (p_after ->> 'priority')::integer;
      v_cursor_due := nullif(p_after ->> 'dueDate', '')::date;
      v_cursor_value_known := (p_after ->> 'valueKnown')::boolean;
      v_cursor_value := nullif(p_after ->> 'value', '')::numeric;
      v_cursor_entity := (p_after ->> 'entityId')::uuid;
      v_cursor_rule := p_after ->> 'ruleId';
    exception when others then
      raise exception 'INVALID_ACTION_SIGNAL_CURSOR' using errcode = '22023';
    end;
    if v_cursor_priority < 1
       or v_cursor_rule not in (
         'won_without_so', 'expected_close_overdue',
         'quotation_expiry_due', 'deal_stagnant'
       )
       or v_cursor_value_known is distinct from (v_cursor_value is not null)
    then
      raise exception 'INVALID_ACTION_SIGNAL_CURSOR' using errcode = '22023';
    end if;
  end if;

  v_owner_id := case
    when v_role = 'sales' then auth.uid()
    when v_role = 'executive' then null
    else p_owner_id
  end;

  with documents as materialized (
    select
      d.id as entity_id,
      d.client_id,
      c.name as client_name,
      d.owner_id,
      p.name as owner_name,
      d.quotation_number,
      d.stage::text,
      d.expected_close_date,
      d.quotation_expired_date,
      items.total_value::numeric as total_value,
      won.won_event_date,
      greatest(progress.stage_date, progress.follow_up_date) as last_progress_date,
      so.has_active_sales_order
    from public.commercial_documents d
    join public.clients c on c.id = d.client_id
    join public.profiles p on p.id = d.owner_id
    cross join lateral (
      select sum(i.line_total) as total_value
      from public.commercial_document_items i
      where i.commercial_document_id = d.id
    ) items
    cross join lateral (
      select exists (
        select 1
        from public.sales_orders linked
        where linked.source_commercial_document_id = d.id
          and linked.deleted_at is null
      ) as has_active_sales_order
    ) so
    left join lateral (
      select max(al.created_at at time zone 'Asia/Jakarta')::date as won_event_date
      from public.activity_log al
      where al.commercial_document_id = d.id
        and al.kind = 'commercial_item_stage_change'
        and al.event_data ->> 'schema_version' = '1'
        and al.event_data ->> 'to_stage' = 'Closed Won'
        and nullif(al.event_data ->> 'from_stage', '') is not null
        and al.event_data ->> 'from_stage' <> 'Closed Won'
    ) won on true
    left join lateral (
      select
        (
          select max(al.created_at at time zone 'Asia/Jakarta')::date
          from public.activity_log al
          where al.commercial_document_id = d.id
            and al.kind = 'commercial_item_stage_change'
            and al.event_data ->> 'schema_version' = '1'
            and nullif(al.event_data ->> 'from_stage', '') is not null
            and nullif(al.event_data ->> 'to_stage', '') is not null
            and al.event_data ->> 'from_stage' <> al.event_data ->> 'to_stage'
        ) as stage_date,
        (
          select max(fu.fu_date)
          from public.follow_up_logs fu
          where fu.commercial_document_id = d.id
            and fu.result is not null
        ) as follow_up_date
    ) progress on true
    where d.type = 'Quotation'
      and d.is_current_revision
      and d.deleted_at is null
      and (v_owner_id is null or d.owner_id = v_owner_id)
      and (p_client_status is null or c.status = p_client_status)
  ), raw_signals as materialized (
    select
      d.*,
      'won_without_so'::text as rule_id,
      'active'::text as state,
      case when d.won_event_date is null
        then 'data_insufficient' else 'complete' end as data_state,
      1 as priority,
      case when d.won_event_date is null
        then 'Won tanpa Sales Order aktif; tanggal Won belum tersedia dari event valid.'
        else 'Closed Won ' || (v_as_of - d.won_event_date) || ' hari tanpa Sales Order aktif.'
      end as reason,
      d.won_event_date as base_date,
      d.won_event_date as due_date,
      case when d.won_event_date is null then null
        else greatest(v_as_of - d.won_event_date, 0) end as age_days,
      null::integer as threshold_days
    from documents d
    where d.stage = 'Closed Won' and not d.has_active_sales_order

    union all

    select
      d.*, 'expected_close_overdue', 'active', 'complete', 1,
      'Expected close lewat ' || (v_as_of - d.expected_close_date) || ' hari.',
      d.expected_close_date, d.expected_close_date,
      v_as_of - d.expected_close_date, null::integer
    from documents d
    where d.stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and d.expected_close_date < v_as_of

    union all

    select
      d.*, 'quotation_expiry_due', 'active', 'complete', 2,
      case
        when d.quotation_expired_date < v_as_of then
          'Quotation kedaluwarsa ' || (v_as_of - d.quotation_expired_date) || ' hari lalu.'
        when d.quotation_expired_date = v_as_of then
          'Quotation kedaluwarsa hari ini.'
        else
          'Quotation kedaluwarsa dalam ' || (d.quotation_expired_date - v_as_of) || ' hari.'
      end,
      d.quotation_expired_date, d.quotation_expired_date,
      greatest(v_as_of - d.quotation_expired_date, 0), 7
    from documents d
    where d.stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and d.quotation_expired_date <= v_as_of + 7

    union all

    select
      d.*, 'deal_stagnant',
      case when d.last_progress_date is null
        then 'data_insufficient' else 'active' end,
      case when d.last_progress_date is null
        then 'data_insufficient' else 'complete' end,
      4,
      case when d.last_progress_date is null
        then 'Data belum cukup: belum ada stage event atau follow-up valid.'
        else 'Tidak ada progress bermakna selama ' ||
          (v_as_of - d.last_progress_date) || ' hari.'
      end,
      d.last_progress_date,
      case when d.last_progress_date is null
        then null else d.last_progress_date + 14 end,
      case when d.last_progress_date is null
        then null else v_as_of - d.last_progress_date end,
      14
    from documents d
    where d.stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and (
        d.last_progress_date is null
        or v_as_of - d.last_progress_date >= 14
      )
  ), signals as materialized (
    select distinct on (entity_id, rule_id)
      *,
      coalesce(due_date, 'infinity'::date) as sort_due_date,
      (total_value is not null) as value_known,
      coalesce(-total_value, 0) as sort_value
    from raw_signals
    order by entity_id, rule_id
  ), after_cursor as materialized (
    select *
    from signals s
    where p_after is null
      or (
        s.priority,
        s.sort_due_date,
        case when s.value_known then 0 else 1 end,
        s.sort_value,
        s.entity_id,
        s.rule_id
      ) > (
        v_cursor_priority,
        coalesce(v_cursor_due, 'infinity'::date),
        case when v_cursor_value_known then 0 else 1 end,
        coalesce(-v_cursor_value, 0),
        v_cursor_entity,
        v_cursor_rule
      )
  ), page_rows as materialized (
    select *
    from after_cursor
    order by
      priority,
      sort_due_date,
      case when value_known then 0 else 1 end,
      sort_value,
      entity_id,
      rule_id
    limit p_limit + 1
  ), visible_rows as materialized (
    select *
    from page_rows
    order by
      priority,
      sort_due_date,
      case when value_known then 0 else 1 end,
      sort_value,
      entity_id,
      rule_id
    limit p_limit
  )
  select
    jsonb_build_object(
      'totalCount', count(*)::integer,
      'activeCount', count(*) filter (where state = 'active')::integer,
      'dataInsufficientCount', count(*) filter (
        where state = 'data_insufficient'
      )::integer,
      'incompleteEvidenceCount', count(*) filter (
        where data_state = 'data_insufficient'
      )::integer,
      'byRule', jsonb_build_object(
        'won_without_so', count(*) filter (
          where rule_id = 'won_without_so'
        )::integer,
        'expected_close_overdue', count(*) filter (
          where rule_id = 'expected_close_overdue'
        )::integer,
        'quotation_expiry_due', count(*) filter (
          where rule_id = 'quotation_expiry_due'
        )::integer,
        'deal_stagnant', count(*) filter (
          where rule_id = 'deal_stagnant'
        )::integer
      )
    ),
    case when v_role = 'executive' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'entityId', row.entity_id,
        'clientId', row.client_id,
        'clientName', row.client_name,
        'ownerId', row.owner_id,
        'ownerName', row.owner_name,
        'quotationNumber', row.quotation_number,
        'stage', row.stage,
        'ruleId', row.rule_id,
        'state', row.state,
        'dataState', row.data_state,
        'priority', row.priority,
        'reason', row.reason,
        'baseDate', row.base_date,
        'dueDate', row.due_date,
        'ageDays', row.age_days,
        'thresholdDays', row.threshold_days,
        'totalValue', row.total_value,
        'sourceHref', '/quotations/' || row.entity_id
      ) order by
        row.priority,
        row.sort_due_date,
        case when row.value_known then 0 else 1 end,
        row.sort_value,
        row.entity_id,
        row.rule_id)
      from visible_rows row
    ), '[]'::jsonb) end,
    case
      when v_role = 'executive'
        or (select count(*) from page_rows) <= p_limit
      then null
      else (
        select jsonb_build_object(
          'priority', row.priority,
          'dueDate', row.due_date,
          'valueKnown', row.value_known,
          'value', row.total_value,
          'entityId', row.entity_id,
          'ruleId', row.rule_id
        )
        from visible_rows row
        order by
          row.priority desc,
          row.sort_due_date desc,
          case when row.value_known then 0 else 1 end desc,
          row.sort_value desc,
          row.entity_id desc,
          row.rule_id desc
        limit 1
      )
    end
  into v_totals, v_items, v_next_cursor
  from signals;

  return jsonb_build_object(
    'asOfDate', v_as_of,
    'fetchedAt', statement_timestamp(),
    'totals', v_totals,
    'page', jsonb_build_object(
      'limit', p_limit,
      'returnedCount', jsonb_array_length(v_items)
    ),
    'nextCursor', v_next_cursor,
    'items', v_items
  );
end;
$$;

revoke all on function public.crm_action_signals(
  date, uuid, public.client_status, integer, jsonb
) from public, anon;
grant execute on function public.crm_action_signals(
  date, uuid, public.client_status, integer, jsonb
) to authenticated;

comment on function public.crm_action_signals(
  date, uuid, public.client_status, integer, jsonb
) is
  'Exact deterministic CRM exception aggregate with keyset pagination. Sales is owner-scoped, Manager/Super Admin can filter owner, and Executive receives aggregate counts without row detail.';
