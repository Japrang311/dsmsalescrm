# Super Admin Team and Role Management Design

Date: 2026-07-18
Status: Accepted

Decision record: `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`

## Goal

Add a fourth application role, `Super Admin`, that can manage team members and roles from Settings and can edit all business data, while preserving immutable audit history and preventing accidental loss of user-owned records.

## Current State and Conflict

The application currently has three database roles: `sales`, `manager`, and `executive`.

- The Settings `Tim & Role` tab is visible to Manager/Executive, but only Manager mutations succeed.
- `manage-team-member` accepts only a Manager caller and supports Sales/Manager targets.
- Most RLS policies implement Sales-own, Manager-all-write, Executive-all-read.
- The previous bootstrap baseline explicitly said there was no fourth in-app admin role.
- User removal currently means permanent Auth/profile deletion.

This accepted design supersedes those limits. Existing historical task records remain accurate for the implementation that existed at that time, but future behavior follows this specification.

## Confirmed Intent

- Super Admin is a system administrator, not a Sales team member.
- Super Admin has company-wide read/write access to business data and all Settings.
- Only Super Admin manages Team & Role.
- Sales Manager can view the team roster but cannot create, edit, deactivate, delete, or change roles.
- Super Admin is not assigned clients, RFQs, Quotations, Sales Orders, or targets and is excluded from Sales performance comparisons.
- When Super Admin edits business data, the original Sales owner remains unchanged unless an explicit ownership-transfer action is used.
- Activity Log is append-only for every role, including Super Admin.
- Every Super Admin administrative action is written to Activity Log.

## Role Matrix

| Capability                          | Sales     | Sales Manager | Top Executive | Super Admin  |
| ----------------------------------- | --------- | ------------- | ------------- | ------------ |
| Read own business data              | Yes       | Yes           | Company-wide  | Company-wide |
| Edit own business data              | Yes       | Yes           | No            | Company-wide |
| Edit other Sales data               | No        | Yes           | No            | Yes          |
| Read company reports                | Own scope | Company-wide  | Company-wide  | Company-wide |
| Own clients/targets                 | Yes       | Yes           | No            | No           |
| View Tim & Role                     | No        | Read-only     | Read-only     | Yes          |
| Create/update roles                 | No        | No            | No            | Yes          |
| Deactivate/reactivate accounts      | No        | No            | No            | Yes          |
| Transfer ownership                  | No        | No            | No            | Yes          |
| Permanently delete eligible account | No        | No            | No            | Yes          |
| View Activity Log                   | Own scope | Company-wide  | Company-wide  | Company-wide |
| Edit/delete Activity Log            | No        | No            | No            | No           |

Manager retains current company-wide business-data editing authority. The change removes only Manager's Team & Role mutation authority.

## Database Role and Account State

### Role value

Extend `public.app_role` with:

- Database value: `super_admin`
- UI label: `Super Admin`

Do not represent Super Admin as a Manager plus a client-side flag. RLS and server functions must recognize the database role explicitly.

### Profile account state

Extend `public.profiles` with:

| Meaning           | Column                 | Rule                                               |
| ----------------- | ---------------------- | -------------------------------------------------- |
| Account status    | `account_status`       | Enum `active` / `inactive`; default `active`       |
| Status changed at | `status_changed_at`    | Nullable timestamp                                 |
| Status changed by | `status_changed_by`    | Nullable FK to `profiles.id`, `ON DELETE SET NULL` |
| Required reason   | `status_change_reason` | Required for deactivate/reactivate                 |

`current_user_role()` must return no privileged role for an inactive profile. This makes existing RLS role checks fail closed even while an old Auth access token remains valid. The application also checks account state at session bootstrap, displays an unavailable-account message, signs out the inactive session, and never silently falls back to another role.

Deleting a Supabase Auth user does not by itself invalidate every existing token immediately. Deactivation therefore updates the database status first, revokes/signs out available sessions through the server-side admin path, and relies on RLS's active-profile check for immediate data denial.

## Team and Role Settings UX

### Super Admin view

Settings → `Tim & Role` provides:

- Active and inactive member filters.
- Name, email, current role, account status, owned active record counts, and last administrative change.
- `Tambah Anggota`.
- `Edit Profil & Role`.
- `Nonaktifkan Akun` / `Aktifkan Kembali`.
- `Transfer Ownership`.
- `Hapus Permanen` only when eligibility checks pass.

Role options are:

- Sales
- Sales Manager
- Top Executive
- Super Admin

The UI must explain that Super Admin does not own targets or Sales data.

### Manager and Executive view

Manager and Executive can read the team roster and account statuses. All mutation controls are absent/disabled with exact guidance: `Hanya Super Admin yang dapat mengelola anggota tim dan role.`

Sales does not see the Tim & Role tab.

## Server-Side Management Boundary

All team/role mutations remain server-side through an updated management Edge Function or equivalent protected server endpoint. The browser never receives a service-role key and cannot directly assign roles.

Supported actions:

- `create`
- `update_profile`
- `change_role`
- `deactivate`
- `reactivate`
- `transfer_ownership`
- `delete_eligible_account`

Every action:

1. Authenticates the caller.
2. Confirms the caller has an active `super_admin` profile.
3. Validates self-protection and last-Super-Admin rules.
4. Runs business/database changes atomically where multiple rows are affected.
5. Writes an append-only Activity Log event with actor, target snapshot, reason, and result.
6. Returns a safe response without secret keys, password hashes, or privileged tokens.

Managers calling any mutation receive HTTP 403 even if they bypass the UI.

## Super Admin Bootstrap and Protection

- The first Super Admin is promoted through a controlled manual bootstrap against the exact approved Supabase project.
- The bootstrap is idempotent, accepts an explicit Auth user UUID, and never embeds a default email/password.
- After bootstrap, only an active Super Admin can create or assign another Super Admin.
- A Manager can never promote anyone to Super Admin.
- The database/server rejects deactivation, deletion, or demotion when the target is the last active Super Admin.
- The logged-in Super Admin cannot deactivate or permanently delete their own account.
- Self-demotion is rejected when it would leave zero active Super Admins.

These protections are enforced server-side and tested; disabled buttons alone are insufficient.

## Account Lifecycle

### Deactivate — default removal action

- Requires a reason.
- Blocks data access immediately through active-profile RLS checks.
- Prevents new login/session use through the server-side auth management path.
- Preserves profile name, role snapshot, ownership history, and Activity Log attribution.
- Does not silently change client status or business document state.

### Ownership transfer

Before deactivation, Super Admin may transfer active ownership to another active Sales or Sales Manager account.

The transfer screen shows counts by domain and requires an explicit source and destination. One transaction updates the approved owner-bearing tables and records before/after owner IDs in Activity Log. Super Admin and Executive are invalid ownership destinations.

Historical Activity Log actor attribution is never rewritten. Completed/historical records retain their recorded owner unless the transfer scope explicitly includes them; the default scope is active/open business data.

### Permanent delete — restricted exception

Permanent deletion is available only when the target account has no references in business tables, ownership mappings, tasks/follow-ups, targets, or Activity Log. Eligibility is checked server-side immediately before deletion.

If any reference exists, deletion returns a conflict and instructs the Super Admin to deactivate the account instead. The system does not cascade-delete business or audit history to make a user deletable.

## Business-Data Authority

Every business table's RLS is updated so active Super Admin can select, insert, update, and—where the domain already permits hard deletion—delete company-wide rows.

Super Admin access does not automatically broaden deletion semantics. Domains that intentionally use archive/status transitions instead of hard delete continue to do so. “All Akses” means Super Admin can execute every supported business operation, not bypass referential integrity, immutable audit, or domain safety rules.

Super Admin edits preserve `owner_id` unless using the explicit transfer action. Activity events store Super Admin as `actor_id` and the business owner separately.

## Activity Log

Activity Log remains append-only:

- No update policy for any role.
- No delete policy for any role.
- Service-role maintenance does not become a website feature.

Administrative event kinds include:

- `team_member_created`
- `team_member_profile_updated`
- `team_member_role_changed`
- `team_member_deactivated`
- `team_member_reactivated`
- `team_member_ownership_transferred`
- `team_member_deleted`

Extend Activity Log to retain a target snapshot that survives an eligible account deletion:

| Meaning         | Column                                                                   |
| --------------- | ------------------------------------------------------------------------ |
| Target profile  | `target_profile_id` nullable, `ON DELETE SET NULL`                       |
| Target snapshot | `target_profile_snapshot` JSON/text containing safe name/email/role only |
| Required reason | `administrative_reason`                                                  |

No password, access token, refresh token, or secret is ever logged.

## RLS and Authorization Migration

The role change affects every exposed table. Migration must audit and test:

- `profiles`
- `clients`
- `tasks`
- commercial document headers/items
- Sales Order headers/items
- `follow_up_logs`
- `targets`
- `org_settings`
- `activity_log`
- any settings/import-review tables present at implementation time

Read policies add active Super Admin company-wide. Write policies add active Super Admin where writes are supported. Activity Log remains select/insert only, never update/delete. Team-management authority is not implemented as broad client-table update grants; role/status/Auth mutations remain behind the protected server function.

## Error Handling

- Inactive caller: 401/403 and forced sign-out guidance.
- Non-Super-Admin mutation: 403.
- Last active Super Admin protection: 409 with explicit explanation.
- Self-deactivate/delete protection: 409.
- Delete target has references: 409 with reference counts and `Nonaktifkan Akun` guidance.
- Ownership destination inactive or non-owning role: validation error.
- Partial ownership transfer failure: full transaction rollback.
- Auth update succeeds but profile/audit change fails: server function compensates where possible and reports an actionable failure; tests cover consistency.

## Verification

### Database/RLS

- Active Super Admin can read/write every supported business table company-wide.
- Sales/Manager/Executive permissions remain within the matrix.
- Manager cannot mutate Team & Role through direct API or Edge Function calls.
- Inactive user cannot read business data even with a previously issued token.
- No role can update/delete Activity Log.

### Team management

- Create each non-admin role and another Super Admin.
- Change roles and verify immediate permission changes.
- Reject Manager promotion attempts.
- Protect last Super Admin and current account.
- Deactivate/reactivate with reason and audit evidence.
- Transfer active ownership atomically and preserve historical actor attribution.
- Reject permanent deletion when references exist; allow it only for a clean unused account.

### UI/browser

- Super Admin sees all Settings tabs and mutation controls.
- Manager/Executive see read-only team roster guidance.
- Sales does not see Tim & Role.
- Super Admin is absent from Sales ownership pickers, targets, and performance charts.
- Super Admin business edits retain owner and show Super Admin as Activity Log actor.

## Documentation Impact

After written-spec approval, synchronize:

- `PRD.md`
- a new ADR for Super Admin authorization/lifecycle
- `specs/backend-data-layer.md`
- Phase 11 implementation plan constraints where role/RLS assumptions change
- `tasks/plan.md` and `tasks/todo.md`
- `CLAUDE.md`
- `HANDOFF.md`
- auth/bootstrap and Settings documentation

Historical completed task descriptions remain historical but receive superseded notes where they would mislead future implementation.

## Out of Scope

- A general permission-builder or arbitrary custom roles.
- Super Admin owning Sales clients, targets, pipeline, or revenue.
- Editing/deleting Activity Log.
- Cascading deletion of business history to remove a user.
- Public signup or self-service privilege elevation.
- Remote Supabase migration without a separate exact-target approval.
