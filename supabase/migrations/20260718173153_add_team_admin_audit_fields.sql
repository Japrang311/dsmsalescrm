alter table public.activity_log
  add column target_profile_id uuid
    references public.profiles (id) on delete set null,
  add column target_profile_snapshot jsonb,
  add column administrative_reason text;

-- Deleting an eligible unused profile must preserve the audit row and its
-- snapshot. This partial index also keeps the ON DELETE SET NULL lookup cheap.
create index activity_log_target_profile_id_idx
on public.activity_log using btree (target_profile_id)
where target_profile_id is not null;

-- Administrative snapshots are deliberately a narrow data contract. Unknown
-- top-level keys are rejected, and each permitted field must remain scalar
-- text so a secret cannot be hidden inside a nested object or array.
alter table public.activity_log
  add constraint activity_log_target_profile_snapshot_safe
  check (
    target_profile_snapshot is null
    or (
      jsonb_typeof(target_profile_snapshot) = 'object'
      and (target_profile_snapshot - 'name' - 'email' - 'role') = '{}'::jsonb
      and not (target_profile_snapshot ?| array[
        'password',
        'access_token',
        'refresh_token',
        'service_role_key'
      ])
      and (
        not (target_profile_snapshot ? 'name')
        or jsonb_typeof(target_profile_snapshot -> 'name') = 'string'
      )
      and (
        not (target_profile_snapshot ? 'email')
        or jsonb_typeof(target_profile_snapshot -> 'email') = 'string'
      )
      and (
        not (target_profile_snapshot ? 'role')
        or (
          jsonb_typeof(target_profile_snapshot -> 'role') = 'string'
          and target_profile_snapshot ->> 'role' in (
            'sales',
            'manager',
            'executive',
            'super_admin'
          )
        )
      )
    )
  );

alter table public.activity_log
  add constraint activity_log_administrative_reason_required
  check (
    kind not in (
      'team_member_created',
      'team_member_profile_updated',
      'team_member_role_changed',
      'team_member_deactivated',
      'team_member_reactivated',
      'team_member_ownership_transferred',
      'team_member_deleted'
    )
    or (
      administrative_reason is not null
      and btrim(administrative_reason) <> ''
    )
  );

-- Preserve Task 2's hardened website boundary. Authenticated callers retain
-- only the existing business-event INSERT columns; the protected lifecycle
-- service added later will use service_role for administrative audit fields.
revoke insert (
  target_profile_id,
  target_profile_snapshot,
  administrative_reason
) on table public.activity_log from authenticated;
