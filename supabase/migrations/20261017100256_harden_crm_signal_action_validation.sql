-- Reject forged actions for rules that are not active on the quotation. This
-- trigger keeps the invariant at the persistence boundary, including calls
-- made through the SECURITY DEFINER command.

create function private.assert_crm_action_signal_is_active()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stage text;
  v_expected_close_date date;
  v_quotation_expired_date date;
  v_last_progress_date date;
  v_has_active_sales_order boolean;
  v_as_of date := (statement_timestamp() at time zone 'Asia/Jakarta')::date;
  v_is_active boolean := false;
begin
  select
    d.stage::text,
    d.expected_close_date,
    d.quotation_expired_date,
    greatest(
      (
        select max(al.created_at at time zone 'Asia/Jakarta')::date
        from public.activity_log al
        where al.commercial_document_id = d.id
          and al.kind = 'commercial_item_stage_change'
          and al.event_data ->> 'schema_version' = '1'
          and nullif(al.event_data ->> 'from_stage', '') is not null
          and nullif(al.event_data ->> 'to_stage', '') is not null
          and al.event_data ->> 'from_stage' <> al.event_data ->> 'to_stage'
      ),
      (
        select max(fu.fu_date)
        from public.follow_up_logs fu
        where fu.commercial_document_id = d.id
          and fu.result is not null
      )
    ),
    exists (
      select 1
      from public.sales_orders so
      where so.source_commercial_document_id = d.id
        and so.deleted_at is null
    )
  into
    v_stage,
    v_expected_close_date,
    v_quotation_expired_date,
    v_last_progress_date,
    v_has_active_sales_order
  from public.commercial_documents d
  where d.id = new.entity_id
    and d.type = 'Quotation'
    and d.is_current_revision
    and d.deleted_at is null;

  if not found then
    raise exception 'ACTION_SIGNAL_ENTITY_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_is_active := case new.rule_id
    when 'won_without_so' then
      v_stage = 'Closed Won' and not v_has_active_sales_order
    when 'expected_close_overdue' then
      v_stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and v_expected_close_date < v_as_of
    when 'quotation_expiry_due' then
      v_stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and v_quotation_expired_date <= v_as_of + 7
    when 'deal_stagnant' then
      v_stage in ('Quotes Sent', 'Negotiation', 'Hot Prospect', 'Commit')
      and (
        v_last_progress_date is null
        or v_as_of - v_last_progress_date >= 14
      )
    else false
  end;

  if not coalesce(v_is_active, false) then
    raise exception 'ACTION_SIGNAL_NOT_ACTIVE' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.assert_crm_action_signal_is_active()
from public, anon, authenticated;
grant execute on function private.assert_crm_action_signal_is_active()
to service_role;

create trigger assert_crm_action_signal_is_active
before insert on public.crm_action_signal_actions
for each row execute function private.assert_crm_action_signal_is_active();

comment on function private.assert_crm_action_signal_is_active() is
  'Prevents pre-snooze or feedback on a D06 rule that is not active at command time.';
