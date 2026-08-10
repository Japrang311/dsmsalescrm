# Spec: Self-service Change Password + Admin Reset Password

## Implementation Status

IMPLEMENTED 2026-08-10. Deployed to production. Commit 2bcd346.

## Objective

Allow users to change their own password from Settings, and allow Super Admin to reset any team member's password from the Team & Role screen.

## Tech Stack

- Bun, Supabase (Auth + Postgres RPC + Edge Functions), TanStack Query/Router, Vercel
- Frontend: React 19, shadcn/ui components, sonner toasts

## Scope

1. **Self-service change password** — any authenticated user can change their own password from Settings page. Uses Supabase client SDK `supabase.auth.updateUser({ password })`. No backend/Edge Function needed.
2. **Admin reset password** — Super Admin can reset any team member's password from Settings → Tim & Role. Uses new `reset_password` action in existing `manage-team-member` Edge Function. Calls `auth.admin.updateUserById(targetId, { password })`.

## Out of Scope

- Forgot-password / email recovery flow (future feature — needs SMTP config)
- Force-change-on-first-login (future feature)
- Password strength meter / complexity rules beyond min 8 chars

## Data Model/Schema Changes

None. No new migrations. No new tables or columns. Password is managed entirely by Supabase Auth (`auth.users` table, not `profiles`).

## UI/UX Changes

### 1. Settings page — "Akun" section (new tab or section within existing Settings)

Add a "Ubah Kata Sandi" card in Settings page (`src/routes/_app.settings.tsx`). Place it as a new tab "Akun" alongside existing tabs (Tim & Role, Target, etc).

Contents:

- Current password field (for confirmation — required, validated via `signInWithPassword` before calling `updateUser`)
- New password field (min 8 chars)
- Confirm new password field (must match new password)
- Submit button "Ubah kata sandi"
- Success: toast "Kata sandi berhasil diubah", clear fields
- Error: toast with error message

Security: verify current password by calling `supabase.auth.signInWithPassword({ email, password: currentPassword })` before calling `updateUser({ password: newPassword })`. This prevents session-hijack password changes. After successful change, the session remains valid — don't sign out.

### 2. Team & Role — Member row action "Reset Kata Sandi"

Add a new action button on each member row (visible only to Super Admin, alongside existing edit/deactivate/delete actions). Opens a dialog with:

- New password field (min 8 chars)
- Confirm new password field
- Submit → calls `manage-team-member` Edge Function with new `reset_password` action
- Success: toast "{nama} kata sandi berhasil direset"
- Cannot reset own password via this path (SELF_RESET_FORBIDDEN)

## Edge Function Changes — `supabase/functions/manage-team-member/`

### contracts.ts

Add new action type:

```ts
| {
    action: "reset_password";
    id: string;
    password: string;
  }
```

Add parsing in `parseAdminAction` switch:

```ts
case "reset_password":
  requireExactKeys(decoded, ["action", "id", "password"]);
  return {
    action: "reset_password",
    id: requireUuid(decoded.id, "ID anggota tim"),
    password: requireString(decoded.password, "Password", 8, 128, false),
  };
```

Add error code:

```
SELF_RESET_FORBIDDEN: { status: 409, message: "Super Admin tidak dapat mereset kata sandi akun yang sedang digunakan." }
```

### handler.ts

Add `resetPassword` function:

```ts
async function resetPassword(
  action: Extract<AdminAction, { action: "reset_password" }>,
  actorId: string,
  dependencies: AdminDependencies,
): Promise<AdminResponse> {
  if (action.id === actorId) {
    throw new AdminHttpError(
      409,
      "SELF_RESET_FORBIDDEN",
      "Super Admin tidak dapat mereset kata sandi akun yang sedang digunakan.",
    );
  }
  await dependencies.updateAuthUserPassword(action.id, action.password);
  return success(action.id, action.action);
}
```

Add to `dispatch` switch:

```ts
case "reset_password":
  return resetPassword(action, actorId, dependencies);
```

Add to `AdminDependencies` type:

```ts
updateAuthUserPassword(id: string, password: string): Promise<void>;
```

### index.ts

Add to `createDependencies`:

```ts
async updateAuthUserPassword(id, password) {
  const { error } = await adminClient.auth.admin.updateUserById(id, { password });
  if (error) throw error;
},
```

## Client-side Data Layer — `src/lib/data/team.ts`

Add new function:

```ts
export async function resetTeamMemberPassword(
  id: string,
  password: string,
  client: TeamSupabaseClient = realTeamClient,
): Promise<ActionResult> {
  return invokeManageTeamMember(
    { action: "reset_password", id, password },
    client,
  );
}
```

## Settings page — `src/routes/_app.settings.tsx`

### New "Akun" tab with change-password form

Add a tab trigger "Akun" alongside existing tabs. Tab content: a Card with form fields for changing own password.

Form logic:

1. User enters current password, new password, confirm new password
2. Validate: new password >= 8 chars, confirm matches new
3. Call `supabase.auth.signInWithPassword({ email: realProfile.email, password: currentPassword })` to verify current password
4. If verification fails → toast error "Kata sandi saat ini tidak sesuai"
5. If verification succeeds → call `supabase.auth.updateUser({ password: newPassword })`
6. If updateUser fails → toast error
7. If success → toast "Kata sandi berhasil diubah" + clear fields
8. Import `supabase` from `@/lib/supabase` and `realProfile` from `useRole()` (already available via `ROLE_LABEL`/`useRole`)

### Reset password action on member rows

Add "Reset Kata Sandi" button to each member row's action area (visible to Super Admin only). Opens a dialog (reuse Dialog pattern) with new password + confirm fields. Calls `resetTeamMemberPassword(member.id, newPassword)`.

## Security Considerations

- Self-service change: must verify current password before allowing change (prevents session hijack → password change). Use `signInWithPassword` before `updateUser`.
- Admin reset: only Super Admin (already gated by Edge Function auth check). Cannot reset own password via this path.
- Min 8 chars enforced both client-side and server-side (contracts.ts `requireString(..., 8, 128, false)`).
- No password logging or toast exposure of the password value.

## Testing Strategy

### Edge Function tests — `supabase/functions/manage-team-member/index.test.ts`

Add test cases:

- `reset_password` action with valid super_admin token → 200
- `reset_password` action for self → 409 SELF_RESET_FORBIDDEN
- `reset_password` action from non-super_admin → 403
- `reset_password` action with short password → 400

### Client data layer tests — `src/lib/data/team.test.ts`

Add test for `resetTeamMemberPassword` invoking the Edge Function with correct payload.

### Settings page — manual QA

After implementation:

1. Login as regular user → Settings → Akun → change password → verify can login with new password
2. Login as Super Admin → Settings → Tim & Role → reset another member's password → verify that member can login with new password
3. Try resetting own password as Super Admin → should be blocked

## Acceptance Criteria

1. Any authenticated user can change their own password from Settings → Akun tab
2. Current password is verified before allowing the change
3. Super Admin can reset any team member's password from Tim & Role
4. Super Admin cannot reset their own password via Tim & Role (must use self-service)
5. Min 8 character password enforced both client and server side
6. `bun run test`, `bun run lint`, `bun run typecheck`, `bun run build` all pass
7. No new dependencies added

## Boundaries

- Do not implement forgot-password / email recovery
- Do not implement force-change-on-first-login
- Do not modify `login.tsx` beyond adding the "Lupa Password?" hint if desired (out of scope)
- Do not create new migrations
- Do not modify existing auth RBAC / RLS policies

## Open Questions

None — implementation path is clear from existing architecture.

## Post-Implementation Notes

What actually got built vs. planned:

- Shared password validation helper created at `src/lib/auth/password-validation.ts` (`isValidPassword`, `MIN_PASSWORD_LENGTH=8`, `MAX_PASSWORD_LENGTH=128`) — used by create-account, reset-password, and change-password flows. Not called out explicitly in the original spec, added for consistency across the three flows.
- Reset button disabled for inactive accounts (`accountStatus !== 'active'`) with tooltip "Akun nonaktif — aktifkan dulu untuk reset kata sandi".
- Reset button hidden on own row (`currentProfileId === m.id`), in addition to the server-side `SELF_RESET_FORBIDDEN` check.
- `autoComplete` attributes added: `current-password` for the old password field, `new-password` for the new and confirm fields.
- Handler tests added: success path (calls `updateAuthUserPassword`), self-reset 409, non-admin 403, short password 400 — 4 new tests.
- No new migrations needed. No new dependencies added.
- Codex review passed: 0 FAIL, 4 WARN (all addressed — see items above).
