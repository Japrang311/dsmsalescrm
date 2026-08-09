-- Stage 1 Task 1.1: structured audit payload for future analytics.
-- The column is nullable so historical text-only audit rows remain valid.
alter table public.activity_log
  add column event_data jsonb;

alter table public.activity_log
  add constraint activity_log_stage_event_data_valid
  check (
    event_data is null
    or (
      kind = 'commercial_item_stage_change'::public.activity_kind
      and jsonb_typeof(event_data) = 'object'
      and event_data ? 'schema_version'
      and event_data ? 'from_stage'
      and event_data ? 'to_stage'
      and event_data ? 'effective_at'
      and (event_data ->> 'schema_version') = '1'
      and jsonb_typeof(event_data -> 'from_stage') = 'string'
      and nullif(btrim(event_data ->> 'from_stage'), '') is not null
      and jsonb_typeof(event_data -> 'to_stage') = 'string'
      and nullif(btrim(event_data ->> 'to_stage'), '') is not null
      and (event_data ->> 'from_stage') <> (event_data ->> 'to_stage')
      and jsonb_typeof(event_data -> 'effective_at') = 'string'
      and nullif(btrim(event_data ->> 'effective_at'), '') is not null
    )
  );

grant insert (
  event_data
) on table public.activity_log to authenticated;
