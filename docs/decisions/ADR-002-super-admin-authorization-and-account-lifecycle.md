# ADR-002: Explicit Super Admin Authorization and Safe Account Lifecycle

## Status

Accepted

## Date

2026-07-18

## Context

DSM needs Team & Role management to run inside the website. The existing implementation has only `sales`, `manager`, and `executive`; Manager can mutate team accounts through an Edge Function, and removal permanently deletes the account. That model conflicts with the approved operating rules:

- Team and role mutations belong only to Super Admin.
- Super Admin needs company-wide access to supported business operations.
- Super Admin is a system administrator, not a Sales owner or performance participant.
- Account history and Activity Log attribution must survive staff changes.
- Activity Log must remain immutable even for the most privileged website role.
- An inactive user must lose database access immediately, including while an older Auth token might still be valid.

Authorization cannot rely on hidden UI controls or a Manager plus client-side flag because direct API calls would bypass those controls. Account removal also cannot default to permanent deletion because clients, tasks, commercial documents, targets, and audit events retain business meaning after a person leaves.

## Decision

Add `super_admin` as a fourth explicit value in `public.app_role`. An active Super Admin receives company-wide RLS access to every supported business operation and exclusive authority over protected Team & Role server actions.

Extend `public.profiles` with an `active`/`inactive` account state and status-change metadata. Role resolution and every exposed-table policy must require an active profile, so inactive accounts fail closed at the database boundary. The application also signs inactive sessions out and displays a clear unavailable-account state.

Team and role mutations remain behind a protected server endpoint using server-side Auth administration. The endpoint must authenticate an active Super Admin, require an administrative reason, enforce self/last-admin protections, execute multi-table changes atomically where applicable, and append an Activity Log event.

Account lifecycle follows these rules:

1. Deactivation is the default removal action and preserves history.
2. Active/open ownership can be transferred only to an active Sales or Sales Manager.
3. Permanent deletion is an exception for an unused account with zero business, ownership, target, follow-up, or audit references.
4. The current Super Admin cannot deactivate or delete their own account.
5. The last active Super Admin cannot be deactivated, deleted, or demoted.

Super Admin does not own clients, targets, RFQs, Quotations, Sales Orders, or revenue. A Super Admin correction preserves `owner_id`; only the explicit transfer action changes ownership. Activity Log stores the Super Admin as actor and the business owner separately.

Activity Log remains append-only for every role. Administrative events retain a safe target snapshot so attribution remains understandable after an eligible unused account is deleted. No password, token, or secret is logged.

The first Super Admin is promoted manually using an idempotent, explicit Auth-user UUID against the exact approved Supabase project. After bootstrap, only an active Super Admin can create or assign another Super Admin. Public signup and self-service privilege elevation remain prohibited.

## Alternatives Considered

### Keep Manager as the website administrator

- Advantage: smallest code change because current team management already checks Manager.
- Rejected: mixes Sales leadership with system-administration authority and contradicts the approved exclusive Super Admin boundary.

### Model Super Admin as Manager plus a client-side flag

- Advantage: avoids changing the database enum and some policies.
- Rejected: the flag is not a reliable authorization boundary, produces inconsistent direct-API behavior, and makes RLS auditing ambiguous.

### Permanently delete accounts on removal

- Advantage: simple visible lifecycle.
- Rejected: risks broken ownership/history, removes attribution, and encourages destructive cascading. Deactivation is safer and reversible.

### Give Super Admin unconditional database bypass

- Advantage: fewer explicit policies.
- Rejected: would bypass immutable Activity Log and domain safety rules. “All Akses” means every supported operation, not exemption from integrity controls.

### Build arbitrary custom permissions

- Advantage: maximum future flexibility.
- Rejected: unnecessary complexity for the confirmed four-role organization. A permission builder is out of scope.

## Consequences

- All role unions, seed/test fixtures, session bootstrap, RLS helpers, and policies must recognize `super_admin` and active account state.
- The existing Manager-driven `manage-team-member` contract is superseded and must reject Manager mutations after migration.
- Manager retains company-wide business editing but sees Team & Role read-only.
- Every public table requires a four-role RLS regression audit; Activity Log remains select/insert only.
- Team management needs explicit create, profile update, role change, deactivate, reactivate, ownership transfer, and eligible-delete actions.
- The bootstrap documentation and SQL helper must target the first Super Admin, not treat Manager as the highest role.
- Super Admin must be excluded from owner selectors, target assignment, and Sales performance calculations.
- Phase 12 should establish the role/status/RLS foundation before Phase 11 creates new commercial tables, so the new tables do not ship with obsolete three-role policies.

## Supersedes

This ADR supersedes the earlier constraint that the application has exactly three roles, the Manager-only Team & Role mutation design recorded in historical Task 29, and permanent deletion as the normal account-removal behavior. Those records remain historical evidence of the implementation that existed before this decision.

## References

- `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`
- `PRD.md` Sections 3, 9, and 15
- `specs/backend-data-layer.md`
- `docs/auth-bootstrap.md`
