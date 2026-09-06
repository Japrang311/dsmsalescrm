-- PostgreSQL enum values added in a dedicated migration boundary so the
-- following migration can safely use the new value in constraints/views.
alter type public.activity_kind
  add value if not exists 'team_member_password_reset';
