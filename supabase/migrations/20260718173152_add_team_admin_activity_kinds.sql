-- PostgreSQL does not allow enum values added inside a transaction to be used
-- until that transaction commits. Keep all enum extensions in this dedicated
-- migration boundary; the following migration adds constraints using them.
alter type public.activity_kind
  add value if not exists 'team_member_created';

alter type public.activity_kind
  add value if not exists 'team_member_profile_updated';

alter type public.activity_kind
  add value if not exists 'team_member_role_changed';

alter type public.activity_kind
  add value if not exists 'team_member_deactivated';

alter type public.activity_kind
  add value if not exists 'team_member_reactivated';

alter type public.activity_kind
  add value if not exists 'team_member_ownership_transferred';

alter type public.activity_kind
  add value if not exists 'team_member_deleted';
