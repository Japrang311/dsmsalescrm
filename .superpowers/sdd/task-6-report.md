# Task 6 Report: session, role-aware navigation, ownership, targets, reporting

## Status: DONE

## Summary

Widened the canonical application `Role` union to `"sales" | "manager" | "executive" | "super_admin"`,
closed the real-session gap where an inactive `profiles.account_status` was never checked, and
extended the small set of business-edit checks that hard-coded `role === "manager"` to also cover
Super Admin where the domain supports company-wide corrections. Verified (rather than changed) that
Super Admin is already structurally excluded from the Sales owner/target/performance data path.

## Files changed

- `src/lib/mock/selectors.ts` — widened `Role` type; added a comment explaining why the existing
  `role === "sales" ? own : companyWide` branching pattern used throughout this file already covers
  `super_admin` correctly (falls into the company-wide branch, same as manager/executive) without
  per-function changes.
- `src/context/role-context.tsx` — real-session path now delegates to the new
  `account-status.ts` module instead of reading only `role` from `profiles`. Added `DevRole =
  Exclude<Role, "super_admin">` for the local dev switcher (`ROLE_LOGIN`, `signInForRole`, the
  `stored` fallback) since there is no seed Super Admin login. `setRole()` now explicitly guards
  against `"super_admin"` (console.warn + no-op) rather than silently mapping it into
  `signInForRole`. `ROLE_LABEL` gained `super_admin: "Super Admin"`.
- `src/lib/auth/account-status.ts` (new) — `fetchAccountStatus(userId, client?)` queries
  `role, account_status, name, initials, email` and returns a discriminated
  `AccountStatusResult` (`active` | `inactive` | `missing_profile`); only `active` carries a role,
  by construction. `signOutInactiveAccount(client?)` shows the exact Indonesian message and signs
  out. Both take an **optional injectable client** parameter (see Testing note below) defaulting to
  the real `supabase` client via a cast (`as unknown as ProfileQueryClient` /
  `AuthSignOutClient`) — a direct structural default-param comparison against the real
  `SupabaseClient` generic type hit `TS2589: Type instantiation is excessively deep`.
- `src/lib/auth/account-status.test.ts` (new) — 7 unit tests: active/inactive/missing-profile/error
  parsing, exact query shape (`role, account_status, name, initials, email` scoped by `id`), the
  toast message + signOut call, and the exact message string.
- `src/lib/data/clients.ts` — widened `OwnerLookup.role` to include `"super_admin"` (a Super Admin
  profile can legitimately appear in `listOwners()`'s full profile scan). Added a comment on
  `listSalesTeamProfiles()` documenting that its `.eq("role", "sales")` filter is the app's one
  enforcement point keeping Super Admin out of every owner/target/performance selector built from
  its output. **No behavior change** — verified this filter already existed and already excludes
  Super Admin.
- `src/lib/data/clients.test.ts` — added a regression test:
  `listSalesTeamProfiles() excludes Super Admin even though a Super Admin profile exists`, using the
  `fixtures.super_admin` fixture (already defined in `tests/fixtures/roles.ts`, unused by this file
  before now) to prove a real super_admin profile row is excluded from the result while a real sales
  row is included.
- `src/lib/data/targets.ts` — added a comment documenting the verified finding: `upsertYearlyTarget`
  needs no Super Admin exclusion of its own, because Settings' Targets tab always sources
  `salesId` from `listSalesTeamProfiles()` (sales-role-only), so a Super Admin id can never reach
  this function. **No behavior change.**
- `src/components/shell/TopBar.tsx` — the dev-switcher identity-display ternary previously had no
  explicit branch for `super_admin` and would have fallen through to the Sales seed account's
  identity if that role were ever reached there. Added an explicit `role === "sales"` check with a
  `super_admin` else-branch showing a neutral placeholder instead. This path is unreachable in
  practice (no dev seed login for Super Admin), but the guard satisfies "never map an unknown role
  to Manager or Sales."
- `src/components/shell/AppSidebar.tsx` — **no change.** Verified: `items = role === "executive" ?
  NAV_EXECUTIVE : NAV_FULL` already puts Super Admin on `NAV_FULL` (same as Manager/Sales — includes
  Settings), and the Commercial Items nav section's `role !== "executive"` condition already shows
  it to Super Admin too. No entry in either list is Manager-only or Sales-only, so Super Admin
  neither loses nor gains anything incorrect.
- `src/components/clients/ChangeStatusDialog.tsx` — `isManagerOverride` now also true for
  `super_admin` (client status corrections are a company-wide supported business-edit operation).
  Reworded the on-screen note to be role-agnostic ("Perubahan ini akan ditandai sebagai koreksi
  manajerial") since it previously said "Sales Manager" specifically.
- `src/components/commercial/CommercialDetailPage.tsx` — `canEditTax` now also true for
  `super_admin`; the manager-only correction note now also shows for Super Admin ("Manager dan
  Super Admin dapat mengoreksi pilihan Sales").
- `src/routes/_app.clients.$clientId.tsx` — `canEditStatus` (both occurrences) now also true for
  `super_admin`.
- `src/routes/_app.sales-orders.$soId.tsx` — `canEditTax` now also true for `super_admin`.
- `src/routes/_app.settings.tsx` — removed the `role as AppRole` "narrow bridge until Task 6"
  cast (comment explicitly named this task) and the resulting dead reference to `contextRole` in
  the "Login sebagai" badge; both now just use `role`/`ROLE_LABEL[role]` directly since `Role` is
  now the canonical four-role union.

## What was deliberately left unchanged (and why)

- **Dashboard route's `role === "manager" ? <SalesPerformanceTable/> : role === "executive" ? <...>
  : null` card-selection blocks** (`src/routes/_app.dashboard.tsx`) — Super Admin currently sees
  neither the Manager nor Executive card set. This is a product/UX call (which specific reporting
  cards a Super Admin should see) rather than a security-boundary gap — RLS already allows Super
  Admin the same company-wide reads as Manager/Executive, and no data leak exists. Changing it
  risks scope creep on a file not in the brief's file list, without an explicit product decision on
  which of the two card sets (or a new third set) is correct. Flagging for a follow-up decision
  rather than guessing.
- **`src/lib/data/dashboard-selectors.ts`** — no change needed. It already receives `salesTeam:
  SalesTeamMember[]` as a parameter from callers, and the only real caller
  (`src/hooks/use-dashboard-data.ts`) sources it from `listSalesTeamProfiles()` — already
  sales-only. Confirmed via reading; no test gap to close beyond the `clients.test.ts` regression
  test added above (which covers the actual enforcement point).
- **Export utilities** (`export-csv.ts`, `export-xlsx.ts`, `export-pdf.ts`, `export-activity.ts`) —
  still import from `src/lib/mock/selectors.ts` and operate on mock `TEAM`, not real profiles; this
  is a pre-existing gap unrelated to Task 6 (these exports haven't been migrated off mock data yet).
  Not in the brief's file list; left untouched.

## Testing

### TDD RED → GREEN for `account-status.ts`

1. Wrote `src/lib/auth/account-status.test.ts` first, importing a not-yet-existing
   `./account-status` — confirmed RED (`Cannot find module './account-status'`).
2. Implemented `src/lib/auth/account-status.ts` — confirmed GREEN (7/7 pass).

### Cross-file test isolation issue found and fixed

Initial implementation used `mock.module("@/lib/supabase", ...)` (matching the pattern in
`src/lib/data/team.test.ts`). This broke the **full** `bun run test` run (17 failures across
`tasks.test.ts`, `activity-log.test.ts`, `follow-ups.test.ts` — all `supabase.auth.setSession is
not a function`), even though the file ran clean in isolation. Root cause: Bun's `mock.module()`
replaces a module specifier's cache entry for the whole test process, and other test files (loaded
alphabetically after `src/lib/auth/...`) that `import { supabase } from "@/lib/supabase"` for real
local-Supabase integration tests got the mock instead — confirmed by reproducing with just two files
together, and confirmed a `mock.module` restore in `afterAll` did **not** fix it (module bindings in
already-loaded files don't reflect a later re-mock). Fixed by refactoring `fetchAccountStatus`/
`signOutInactiveAccount` to accept an **optional injectable client** parameter defaulting to the
real `supabase` client — tests now pass a plain fake object, no global module mock needed. Only
`sonner` is still mocked via `mock.module` (safe: no other test file imports it).

**Pre-existing risk noted, not fixed (out of scope):** `src/lib/data/team.test.ts` still uses
`mock.module("@/lib/supabase", ...)` without restoring it, and currently "gets away with it" only
because it's the alphabetically last file that needs the real client. Any future test file sorting
after it that needs the real client would break the same way. Flagging for awareness; not part of
this task's file list.

## Verification

```
bun test src/lib/auth/account-status.test.ts   → 7 pass, 0 fail
bun run test src/lib/data                       → 30 pass, 0 fail (across 10 files)
bun run test (full suite)                       → 193 pass, 0 fail (across 30 files)
bunx tsc --noEmit                                → 2 pre-existing errors only (see below), 0 new
bunx eslint <every file touched/created>         → 0 errors; 3 pre-existing warnings only
                                                    (react-refresh/only-export-components on
                                                    role-context.tsx and CommercialDetailPage.tsx —
                                                    both files already had non-component exports
                                                    before this task; shape of exports unchanged)
bun run build                                    → succeeds
```

### Pre-existing failures (not introduced by this task, not fixed)

- `src/components/commercial/CommercialViews.tsx:383,433` — `TS2322`, a TanStack Router typed-link
  literal-type mismatch on a template-string `to={...}` prop. Unrelated to Role/auth; file not
  touched by this task.
- `supabase/tests/commercial-count-rpc.test.ts:87` — `TS2769`, an `expect(...).toBe(possibly
  undefined)` overload mismatch. Unrelated to Role/auth; file not touched by this task.

Both confirmed present before any of this task's edits (same two errors, same line numbers,
reproduced from a clean state before touching `role-context.tsx`/`selectors.ts`).

## Open questions / follow-ups for the user

1. Dashboard route's Manager-specific vs Executive-specific report card sections currently show
   Super Admin neither set — is that acceptable, or should Super Admin get one of the two (or a
   dedicated view)? Left unchanged pending a product decision (see "deliberately left unchanged"
   above).
2. `src/lib/data/team.test.ts`'s unrestored `mock.module("@/lib/supabase", ...)` is fragile against
   future alphabetical test-file additions — worth a follow-up cleanup (apply the same
   dependency-injection or restore pattern used here) even though it isn't broken today.
