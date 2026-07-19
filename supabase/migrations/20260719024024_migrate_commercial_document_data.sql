-- Migration: migrate_commercial_document_data
--
-- Phase 11 Task 2. One-time conversion of legacy row-per-item
-- `commercial_items` / `sales_orders` data into the normalized
-- `commercial_documents`/`commercial_document_items` and
-- `sales_orders`(formerly `sales_orders_new`)/`sales_order_items` schema
-- Task 1 created, plus FK repointing (tasks/follow_up_logs/activity_log)
-- and legacy table relocation to `private`.
--
-- Design note on WHEN conversion actually runs: `bunx supabase db reset`
-- always applies every migration BEFORE `supabase/seed.sql`, so at
-- migration-apply time the legacy tables are empty in local dev (no data
-- exists yet to convert). The grouping/insert logic therefore lives in a
-- reusable function, `private.migrate_commercial_document_data()`, which
-- this migration defines and calls once at the bottom (a no-op against 0
-- rows during a fresh `db reset`). `supabase/seed.sql` is updated to call
-- the same function again right after it seeds the (relocated) legacy
-- tables, so `bunx supabase db reset` still produces a fully populated,
-- reconciled local database end-to-end. Against a real/remote database
-- where commercial_items/sales_orders already hold live data, the single
-- call inside this migration converts that live data directly at deploy
-- time.
--
-- The function is idempotent and incremental: every run only pulls legacy
-- rows not already present in the id-map tables or the review table, so a
-- later call (e.g. from a test inserting more legacy rows) only converts
-- the newly-inserted rows, grouping them among themselves. The quotation
-- revision-chain fix-up re-evaluates full chains from `commercial_documents`
-- directly (not just the current batch), so it stays correct across calls.

create schema if not exists private;

-- -----------------------------------------------------------------------
-- Step 4: ID maps + collision/rejection review table
-- -----------------------------------------------------------------------

create table private.commercial_item_id_map (
  legacy_item_id uuid primary key,
  commercial_document_id uuid not null,
  commercial_document_item_id uuid not null
);

create table private.sales_order_id_map (
  legacy_sales_order_id uuid primary key,
  sales_order_id uuid not null,
  sales_order_item_id uuid not null
);

-- Legacy rows that cannot be safely converted: either a genuine grouping
-- collision (two rows that would share one document/SO but disagree on a
-- header field like client_id/owner_id/type/tax/prototype/source/date), or
-- a row missing a document number the target schema's check constraints
-- require for its type (e.g. an RFQ row with no rfq_number). These are
-- reviewed manually, never silently merged, guessed, or dropped.
create table private.commercial_document_migration_review (
  id uuid primary key default gen_random_uuid(),
  source_table text not null check (source_table in ('commercial_items', 'sales_orders')),
  legacy_id uuid not null,
  reason text not null,
  detail jsonb,
  created_at timestamptz not null default now(),
  unique (source_table, legacy_id)
);

revoke all privileges on table
  private.commercial_item_id_map,
  private.sales_order_id_map,
  private.commercial_document_migration_review
from public, anon, authenticated;

grant select, insert, update, delete on table
  private.commercial_item_id_map,
  private.sales_order_id_map,
  private.commercial_document_migration_review
to service_role;

-- -----------------------------------------------------------------------
-- Step 5 (part 1): new FK columns on tasks / follow_up_logs / activity_log.
-- Added nullable, no FK constraint yet -- the constraint is added later,
-- after the backfill, so it never has to validate against an empty target.
-- -----------------------------------------------------------------------

alter table public.tasks add column commercial_document_id uuid;
alter table public.follow_up_logs add column commercial_document_id uuid;
alter table public.activity_log add column commercial_document_id uuid;

-- Drop the existing sales_order_id FK now: it currently points at the
-- legacy `sales_orders` table (about to be relocated to `private`), and
-- must end up pointing at the new normalized Sales Order header instead.
-- Verified empirically (via psql \d) that Postgres FK constraints follow
-- the referenced table's OID, not its name/schema, so simply renaming the
-- legacy table would leave this FK silently pointing at the *archived*
-- table rather than the new one -- dropping and re-adding after the
-- rename and the value repoint below is the only way to get this right.
alter table public.activity_log drop constraint if exists activity_log_sales_order_id_fkey;

-- -----------------------------------------------------------------------
-- Step 6: relocate legacy evidence tables to `private`, finalize the new
-- Sales Order header table's name.
-- -----------------------------------------------------------------------

alter table public.commercial_items set schema private;
alter table private.commercial_items rename to legacy_commercial_items_20260718;

alter table public.sales_orders set schema private;
alter table private.sales_orders rename to legacy_sales_orders_20260718;

revoke all privileges on table
  private.legacy_commercial_items_20260718,
  private.legacy_sales_orders_20260718
from anon, authenticated;
grant select on table
  private.legacy_commercial_items_20260718,
  private.legacy_sales_orders_20260718
to service_role;

alter table public.sales_orders_new rename to sales_orders;

-- -----------------------------------------------------------------------
-- Phase 12 compatibility: lifecycle functions and owner invariants were
-- created against the legacy relations. PostgreSQL moves table triggers
-- with their table, while SQL/PLpgSQL bodies that use relation names must
-- be rebound to the normalized headers explicitly.
--
-- The JSON key `commercial_items` and the public RPC name are intentionally
-- retained as compatibility contracts for existing callers. Their value now
-- counts normalized commercial-document headers, not legacy line rows.
-- -----------------------------------------------------------------------

create or replace function private.account_reference_counts(target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with counts as (
    select
      (select count(*) from public.clients where owner_id = target_id) as clients,
      (select count(*) from public.tasks where owner_id = target_id) as tasks,
      (select count(*) from public.commercial_documents where owner_id = target_id) as commercial_items,
      (select count(*) from public.sales_orders where owner_id = target_id) as sales_orders,
      (select count(*) from public.follow_up_logs where owner_id = target_id) as follow_up_logs,
      (select count(*) from public.targets where sales_id = target_id) as targets,
      (select count(*) from public.activity_log where owner_id = target_id) as activity_log_owner,
      (select count(*) from public.activity_log where actor_id = target_id) as activity_log_actor,
      (select count(*) from public.activity_log where target_profile_id = target_id) as activity_log_target,
      (select count(*) from public.profiles where status_changed_by = target_id) as profile_status_changes
  ), totals as (
    select
      *,
      clients + tasks + commercial_items + sales_orders + follow_up_logs
        + targets + activity_log_owner + activity_log_actor
        + profile_status_changes as total_blocking
    from counts
  )
  select jsonb_build_object(
    'clients', clients,
    'tasks', tasks,
    'commercial_items', commercial_items,
    'sales_orders', sales_orders,
    'follow_up_logs', follow_up_logs,
    'targets', targets,
    'activity_log_owner', activity_log_owner,
    'activity_log_actor', activity_log_actor,
    'activity_log_target', activity_log_target,
    'profile_status_changes', profile_status_changes,
    'total_blocking', total_blocking,
    'total_all', total_blocking + activity_log_target
  )
  from totals;
$$;

create or replace function private.account_ownership_counts(target_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with counts as (
    select
      (select count(*) from public.clients where owner_id = target_id) as clients,
      (select count(*) from public.tasks where owner_id = target_id) as tasks,
      (select count(*) from public.commercial_documents where owner_id = target_id) as commercial_items,
      (select count(*) from public.sales_orders where owner_id = target_id) as sales_orders,
      (select count(*) from public.follow_up_logs where owner_id = target_id) as follow_up_logs,
      (select count(*) from public.targets where sales_id = target_id) as targets,
      (select count(*) from public.activity_log where owner_id = target_id) as activity_log_owner
  )
  select jsonb_build_object(
    'clients', clients,
    'tasks', tasks,
    'commercial_items', commercial_items,
    'sales_orders', sales_orders,
    'follow_up_logs', follow_up_logs,
    'targets', targets,
    'activity_log_owner', activity_log_owner,
    'total', clients + tasks + commercial_items + sales_orders
      + follow_up_logs + targets + activity_log_owner
  )
  from counts;
$$;

create or replace function private.transfer_active_ownership(
  source_id uuid,
  destination_id uuid,
  actor_id uuid,
  reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_profile public.profiles%rowtype;
  destination_profile public.profiles%rowtype;
  actor_profile public.profiles%rowtype;
  client_count integer := 0;
  task_count integer := 0;
  commercial_count integer := 0;
  transfer_counts jsonb;
begin
  if reason is null or btrim(reason) = '' then
    raise exception using message = 'ADMINISTRATIVE_REASON_REQUIRED';
  end if;
  if source_id = destination_id then
    raise exception using message = 'OWNERSHIP_SOURCE_EQUALS_DESTINATION';
  end if;

  perform id
  from public.profiles
  where id = any(array[source_id, destination_id, actor_id])
  order by id
  for update;

  select * into source_profile from public.profiles where id = source_id;
  select * into destination_profile from public.profiles where id = destination_id;
  select * into actor_profile from public.profiles where id = actor_id;

  if actor_profile.id is null
    or actor_profile.role <> 'super_admin'
    or actor_profile.account_status <> 'active'
  then
    raise exception using message = 'ACTIVE_SUPER_ADMIN_REQUIRED';
  end if;
  if source_profile.id is null
    or source_profile.role not in ('sales', 'manager')
  then
    raise exception using message = 'INVALID_OWNERSHIP_SOURCE';
  end if;
  if destination_profile.id is null
    or destination_profile.account_status <> 'active'
    or destination_profile.role not in ('sales', 'manager')
  then
    raise exception using message = 'INVALID_OWNERSHIP_DESTINATION';
  end if;

  update public.clients
  set owner_id = destination_id
  where owner_id = source_id
    and status <> 'Lost';
  get diagnostics client_count = row_count;

  update public.tasks
  set owner_id = destination_id
  where owner_id = source_id
    and status <> 'Done'
    and archived = false;
  get diagnostics task_count = row_count;

  update public.commercial_documents
  set owner_id = destination_id
  where owner_id = source_id
    and lower(btrim(stage)) not in (
      'closed won',
      'closed lost',
      'revenue recorded',
      'closed'
    );
  get diagnostics commercial_count = row_count;

  transfer_counts := jsonb_build_object(
    'clients', client_count,
    'tasks', task_count,
    'commercial_items', commercial_count,
    'total', client_count + task_count + commercial_count
  );

  insert into public.activity_log (
    kind,
    owner_id,
    actor_id,
    target_profile_id,
    target_profile_snapshot,
    administrative_reason,
    title,
    detail
  ) values (
    'team_member_ownership_transferred',
    destination_id,
    actor_id,
    source_id,
    jsonb_build_object(
      'name', source_profile.name,
      'email', source_profile.email,
      'role', source_profile.role
    ),
    reason,
    'Ownership anggota tim ditransfer',
    jsonb_build_object(
      'result', 'success',
      'before_owner_id', source_id,
      'after_owner_id', destination_id,
      'before', jsonb_build_object('owner_id', source_id),
      'after', jsonb_build_object('owner_id', destination_id),
      'counts', transfer_counts
    )::text
  );

  return transfer_counts;
end;
$$;

create or replace function private.count_active_commercial_items(target_owner_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)
  from public.commercial_documents
  where owner_id = target_owner_id
    and lower(btrim(stage)) not in (
      'closed won',
      'closed lost',
      'revenue recorded',
      'closed'
    );
$$;

-- The original triggers followed the archived relations. Recreate the
-- invariant on both normalized header tables.
create trigger commercial_documents_enforce_active_owner
before insert or update of owner_id on public.commercial_documents
for each row execute function private.enforce_active_business_owner('owner_id');

create trigger sales_orders_enforce_active_owner
before insert or update of owner_id on public.sales_orders
for each row execute function private.enforce_active_business_owner('owner_id');

-- -----------------------------------------------------------------------
-- Step 4/5 (part 2): the conversion function itself.
-- -----------------------------------------------------------------------

create or replace function private.migrate_commercial_document_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  grp record;
  item record;
  new_doc_id uuid;
  new_item_id uuid;
  pos integer;
  base_num text;
  rev_num integer;
  prev_doc_id uuid;
  doc_date date;
begin
  -- =====================================================================
  -- A) legacy commercial_items -> commercial_documents / _items
  -- =====================================================================

  create temporary table tmp_ci_pool on commit drop as
  select ci.*
  from private.legacy_commercial_items_20260718 ci
  where ci.id not in (select legacy_item_id from private.commercial_item_id_map)
    and ci.id not in (
      select legacy_id from private.commercial_document_migration_review
      where source_table = 'commercial_items'
    );

  -- Reject rows whose type requires a document number the target schema's
  -- check constraints need, that this row doesn't have.
  insert into private.commercial_document_migration_review (source_table, legacy_id, reason, detail)
  select 'commercial_items', id, 'MISSING_REQUIRED_DOCUMENT_NUMBER',
    jsonb_build_object('type', type, 'quotation_number', quotation_number, 'rfq_number', rfq_number)
  from tmp_ci_pool
  where (type = 'RFQ' and rfq_number is null)
     or (type = 'Quotation' and quotation_number is null)
  on conflict do nothing;

  delete from tmp_ci_pool
  where (type = 'RFQ' and rfq_number is null)
     or (type = 'Quotation' and quotation_number is null);

  -- Effective group key: RFQ groups by rfq_number, Quotation groups by the
  -- full imported quotation_number (revision suffix included), every other
  -- type has no defined grouping column so each row is its own singleton
  -- group (keyed by its own id).
  create temporary table tmp_ci_groups on commit drop as
  select *,
    case
      when type = 'RFQ' then rfq_number
      when type = 'Quotation' then quotation_number
      else id::text
    end as group_key
  from tmp_ci_pool;

  -- Reject whole groups that collide on a header field a single document
  -- must agree on, instead of silently merging/picking one.
  for grp in
    select group_key
    from tmp_ci_groups
    group by group_key
    having count(distinct client_id) > 1
        or count(distinct owner_id) > 1
        or count(distinct type) > 1
        or count(distinct source_flow) > 1
        or count(distinct coalesce(stage, '')) > 1
        or count(distinct coalesce(tax_type::text, '')) > 1
        or count(distinct coalesce(prototype_status::text, '')) > 1
  loop
    insert into private.commercial_document_migration_review (source_table, legacy_id, reason, detail)
    select 'commercial_items', id, 'INCOMPATIBLE_GROUP_COLLISION',
      jsonb_build_object('group_key', grp.group_key)
    from tmp_ci_groups where group_key = grp.group_key
    on conflict do nothing;

    delete from tmp_ci_groups where group_key = grp.group_key;
  end loop;

  -- Every remaining group is internally consistent. One commercial_documents
  -- row per group (deterministic order), one commercial_document_items row
  -- per member (ordered by legacy id).
  for grp in
    select
      group_key,
      min(client_id::text)::uuid as client_id,
      min(owner_id::text)::uuid as owner_id,
      min(type) as type,
      min(source_flow) as source_flow,
      min(stage) as stage,
      min(created_at) as document_date_src,
      min(quotation_number) as quotation_number,
      min(rfq_number) as rfq_number,
      min(so_number) filter (where so_number is not null) as so_number
    from tmp_ci_groups
    group by group_key
    order by group_key
  loop
    new_doc_id := gen_random_uuid();
    doc_date := grp.document_date_src::date;

    base_num := null;
    rev_num := 0;
    if grp.type = 'Quotation' then
      if grp.quotation_number ~ '_REV\.[0-9]+$' then
        base_num := regexp_replace(grp.quotation_number, '_REV\.[0-9]+$', '');
        rev_num := substring(grp.quotation_number from '_REV\.([0-9]+)$')::integer;
      else
        base_num := grp.quotation_number;
        rev_num := 0;
      end if;
    end if;

    insert into public.commercial_documents (
      id, client_id, owner_id, type, source_flow, document_date,
      rfq_number, quotation_number, quotation_base_number, quotation_revision,
      is_current_revision, stage, so_number, created_at, updated_at
    ) values (
      new_doc_id, grp.client_id, grp.owner_id, grp.type, grp.source_flow, doc_date,
      case when grp.type = 'RFQ' then grp.rfq_number else null end,
      case when grp.type = 'Quotation' then grp.quotation_number else null end,
      base_num, rev_num,
      case when grp.type = 'Quotation' then false else true end,
      grp.stage, grp.so_number, now(), now()
    );

    pos := 0;
    for item in
      select * from tmp_ci_groups where group_key = grp.group_key order by id
    loop
      pos := pos + 1;
      new_item_id := gen_random_uuid();
      insert into public.commercial_document_items (
        id, commercial_document_id, product_name, description, qty, unit_price, line_total, line_position
      ) values (
        new_item_id,
        new_doc_id,
        null,
        item.description,
        item.qty,
        case when item.prototype_status = 'FOC' then null else item.unit_price end,
        case when item.prototype_status = 'FOC' then null else item.estimated_value end,
        pos
      );
      insert into private.commercial_item_id_map (legacy_item_id, commercial_document_id, commercial_document_item_id)
      values (item.id, new_doc_id, new_item_id);
    end loop;
  end loop;

  -- Quotation revision chains: for every quotation_base_number, only the
  -- highest revision is current; each points supersedes_document_id at the
  -- previous revision. Re-evaluated over the *entire* table every call, not
  -- just the current batch, so a later-added revision still corrects an
  -- already-migrated chain.
  for grp in
    select distinct quotation_base_number
    from public.commercial_documents
    where type = 'Quotation' and quotation_base_number is not null
  loop
    prev_doc_id := null;
    for item in
      select id from public.commercial_documents
      where type = 'Quotation' and quotation_base_number = grp.quotation_base_number
      order by quotation_revision asc
    loop
      update public.commercial_documents
      set is_current_revision = false, supersedes_document_id = prev_doc_id
      where id = item.id;
      prev_doc_id := item.id;
    end loop;
    update public.commercial_documents
    set is_current_revision = true
    where id = prev_doc_id;
  end loop;

  -- =====================================================================
  -- B) legacy sales_orders -> sales_orders / sales_order_items
  -- =====================================================================

  create temporary table tmp_so_pool on commit drop as
  select so.*
  from private.legacy_sales_orders_20260718 so
  where so.id not in (select legacy_sales_order_id from private.sales_order_id_map)
    and so.id not in (
      select legacy_id from private.commercial_document_migration_review
      where source_table = 'sales_orders'
    );

  for grp in
    select so_number
    from tmp_so_pool
    group by so_number
    having count(distinct client_id) > 1
        or count(distinct owner_id) > 1
        or count(distinct type) > 1
        or count(distinct coalesce(tax_type::text, '')) > 1
        or count(distinct coalesce(prototype_status::text, '')) > 1
        or count(distinct source) > 1
        or count(distinct date) > 1
  loop
    insert into private.commercial_document_migration_review (source_table, legacy_id, reason, detail)
    select 'sales_orders', id, 'INCOMPATIBLE_SO_GROUP_COLLISION',
      jsonb_build_object('so_number', grp.so_number)
    from tmp_so_pool where so_number = grp.so_number
    on conflict do nothing;

    delete from tmp_so_pool where so_number = grp.so_number;
  end loop;

  for grp in
    select
      so_number,
      min(client_id::text)::uuid as client_id,
      min(owner_id::text)::uuid as owner_id,
      min(type) as type,
      min(tax_type::text) as tax_type,
      min(prototype_status::text) as prototype_status,
      min(source) as source,
      min(date) as date,
      sum(value) filter (where value is not null) as total_value,
      count(*) filter (where value is not null) as priced_count
    from tmp_so_pool
    group by so_number
    order by so_number
  loop
    new_doc_id := gen_random_uuid();
    insert into public.sales_orders (
      id, so_number, date, client_id, owner_id, type, tax_type, prototype_status, source,
      total_value, created_at, updated_at
    ) values (
      new_doc_id, grp.so_number, grp.date, grp.client_id, grp.owner_id, grp.type,
      nullif(grp.tax_type, '')::public.tax_type,
      nullif(grp.prototype_status, '')::public.prototype_status,
      grp.source,
      case when grp.priced_count > 0 then grp.total_value else null end,
      now(), now()
    );

    pos := 0;
    for item in
      select * from tmp_so_pool where so_number = grp.so_number order by id
    loop
      pos := pos + 1;
      new_item_id := gen_random_uuid();
      insert into public.sales_order_items (
        id, sales_order_id, product_name, description, qty, unit_price, line_total, line_position
      ) values (
        new_item_id, new_doc_id, null, null, item.qty, item.unit_price, item.value, pos
      );
      insert into private.sales_order_id_map (legacy_sales_order_id, sales_order_id, sales_order_item_id)
      values (item.id, new_doc_id, new_item_id);
    end loop;
  end loop;

  -- =====================================================================
  -- C) Backfill FK repoints on tasks / follow_up_logs / activity_log
  -- =====================================================================

  update public.tasks t
  set commercial_document_id = m.commercial_document_id
  from private.commercial_item_id_map m
  where t.commercial_item_id = m.legacy_item_id
    and t.commercial_document_id is distinct from m.commercial_document_id;

  update public.follow_up_logs f
  set commercial_document_id = m.commercial_document_id
  from private.commercial_item_id_map m
  where f.commercial_item_id = m.legacy_item_id
    and f.commercial_document_id is distinct from m.commercial_document_id;

  update public.activity_log a
  set commercial_document_id = m.commercial_document_id
  from private.commercial_item_id_map m
  where a.commercial_item_id = m.legacy_item_id
    and a.commercial_document_id is distinct from m.commercial_document_id;

  update public.activity_log a
  set sales_order_id = m.sales_order_id
  from private.sales_order_id_map m
  where a.sales_order_id = m.legacy_sales_order_id
    and a.sales_order_id is distinct from m.sales_order_id;
end;
$$;

revoke all privileges on function private.migrate_commercial_document_data()
from public, anon, authenticated;
grant execute on function private.migrate_commercial_document_data()
to service_role;

-- Convert whatever legacy data already exists right now (real data on a
-- real deploy; nothing on a fresh local `db reset`, since seed.sql hasn't
-- run yet at migration-apply time).
select private.migrate_commercial_document_data();

-- -----------------------------------------------------------------------
-- Step 5 (part 3): add FKs only now that the backfill above has already
-- run, so there is nothing for the constraint to fail validating against.
-- -----------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.tasks t
    where t.commercial_item_id is not null and t.commercial_document_id is null
  ) then
    raise exception 'ORPHANED_TASK_COMMERCIAL_ITEM_LINK';
  end if;

  if exists (
    select 1 from public.follow_up_logs f
    where f.commercial_item_id is not null and f.commercial_document_id is null
  ) then
    raise exception 'ORPHANED_FOLLOW_UP_LOG_COMMERCIAL_ITEM_LINK';
  end if;

  if exists (
    select 1 from public.activity_log a
    where a.commercial_item_id is not null and a.commercial_document_id is null
  ) then
    raise exception 'ORPHANED_ACTIVITY_LOG_COMMERCIAL_ITEM_LINK';
  end if;
end;
$$;

alter table public.tasks
  add constraint tasks_commercial_document_id_fkey
  foreign key (commercial_document_id) references public.commercial_documents (id);

alter table public.follow_up_logs
  add constraint follow_up_logs_commercial_document_id_fkey
  foreign key (commercial_document_id) references public.commercial_documents (id);

alter table public.activity_log
  add constraint activity_log_commercial_document_id_fkey
  foreign key (commercial_document_id) references public.commercial_documents (id);

alter table public.activity_log
  add constraint activity_log_sales_order_id_fkey
  foreign key (sales_order_id) references public.sales_orders (id);

create index tasks_commercial_document_id_idx on public.tasks using btree (commercial_document_id);
create index follow_up_logs_commercial_document_id_idx on public.follow_up_logs using btree (commercial_document_id);
create index activity_log_commercial_document_id_idx on public.activity_log using btree (commercial_document_id);
