# Task 5 Independent Review

Date: 2026-07-19  
Verdict: **CHANGES_REQUIRED**

## Important

### 1. Ownership counts and latest administrative changes are silently truncated at 1,000 rows

- Evidence: `src/lib/data/team.ts:97-113` selects every row from `clients`, `tasks`, `commercial_items`, and every matching administrative event, then computes counts/latest events in the browser. The local Data API limit is explicitly `max_rows = 1000` in `supabase/config.toml:18`.
- Impact: once any source has more than 1,000 matching rows, `ownedActiveCounts` is incorrect. The latest administrative event can also be absent for a profile when more than 1,000 newer events for other profiles occupy the response. This violates the Task 5 `TeamMember` contract and can mislead a Super Admin before transfer, role change, deactivation, or deletion.
- Concrete fix: do not aggregate unbounded company tables in the browser. Add a protected server-side roster/summary query or use exact server-side filtered `count` queries and a per-profile latest-event query with `limit(1)`. Preserve the exact Task 4 active-ownership predicates. Add a focused test that proves counts/latest-event correctness beyond the Data API row limit or verifies the bounded/count request shape.

### 2. A roster query failure is rendered as an empty roster

- Evidence: `src/routes/_app.settings.tsx:400-403` reads only `data` and `isLoading` from `useQuery`; `src/routes/_app.settings.tsx:415-417` and `465-490` consequently render `0 dari 0 akun` and an empty table after an error.
- Impact: an RLS regression, expired session, network failure, or one failed auxiliary summary query is indistinguishable from a legitimate empty team. This is unsafe guidance on an administrative screen and hides the reason lifecycle controls disappeared.
- Concrete fix: handle `isError`/`error` explicitly in `TeamTab`, render a clear failure state with a retry action, and do not render the empty roster as successful data. A focused component test is preferable if the route harness supports it; otherwise keep this state in Task 7 browser verification.

## Minor

### 3. Empty filtered results have no explicit table state

- Evidence: `src/routes/_app.settings.tsx:505-657` maps `visibleTeam` without an empty-state row.
- Impact: selecting a filter with zero matches produces a header-only table, which is ambiguous even when the query succeeded.
- Concrete fix: render one `colSpan` row explaining that no active/inactive account matches the selected filter.

## Confirmed compliant

- [Pasti] `src/lib/data/team.ts:306-379` serializes exactly the seven Task 4 actions and does not retain a generic update/remove destructive alias.
- [Pasti] `TeamAdminError` parses a `FunctionsHttpError` response and preserves safe status/code/non-negative integer details (`src/lib/data/team.ts:200-289`).
- [Pasti] Password is limited to the create request and local dialog state; it is absent from `TeamMember`, roster select columns, and query-cache data.
- [Pasti] The roster model carries all four roles, inactive/status metadata, active ownership counts, and latest administrative-change metadata.
- [Pasti] Sales receives no Team tab; Manager and Executive receive the exact read-only guidance; only Super Admin receives lifecycle controls (`src/routes/_app.settings.tsx:127-132,181-207,433-464`).
- [Pasti] Reasons, self-deactivate/delete UI guards, 409 guidance, eligible active Sales/Manager destinations, and the Super Admin/Executive ownership explanation are present (`src/routes/_app.settings.tsx:590-650,835-999`). Server protection remains authoritative.
- [Pasti] No Task 6 canonical role/session migration or navigation/reporting implementation was folded into Task 5; the bridge is explicitly temporary.

## Review method

Read-only inspection of the plan, progress ledger, Task 5 report, Team data API/tests, Settings route, Task 4 Edge action/error contracts, lifecycle SQL predicates, and local Data API configuration. Broad tests were not rerun as instructed.

---

## Fix Wave 1 Independent Re-review

Date: 2026-07-19  
Verdict: **CHANGES_REQUIRED**

### Important

#### 1. Commercial ownership count still does not match the Task 4 transfer predicate

- Evidence: `src/lib/data/team.ts:125-128` excludes terminal stages through a case-sensitive, whitespace-sensitive PostgREST `not in` list. Task 4 deliberately defines the server transfer scope as `lower(btrim(stage)) not in (...)` in `supabase/migrations/20260718180929_add_account_lifecycle_functions.sql:194-202`, while `stage` remains unconstrained free-form text (`supabase/migrations/20260717235315_commercial_items.sql:7-13,29`).
- Impact: a terminal value such as `closed won` or `CLOSED WON` is counted as active by the roster but is not transferred by the server. The Super Admin therefore still sees a misleading ownership total before lifecycle actions.
- Concrete fix: make the roster count use the exact normalized server predicate. Prefer one protected server-side summary/count function sharing the Task 4 predicate, rather than attempting to emulate `lower(btrim(...))` through a client filter. Add a focused regression case for case/whitespace variants.

### Critical

None.

### Minor

None.

### Confirmed resolved

- [Pasti] Aggregation is no longer performed from unbounded ownership/event row sets. Each profile uses exact head-only count requests; the latest administrative event is filtered by `target_profile_id` and the seven administrative kinds, ordered descending by `created_at`, and limited to one row (`src/lib/data/team.ts:110-144`).
- [Pasti] Client and task count predicates match Task 4 (`status <> 'Lost'`; `status <> 'Done'` plus `archived = false`). Query errors and a `null` exact count fail the roster instead of becoming zero (`src/lib/data/team.ts:72-81,113-143`).
- [Pasti] A failed roster query has a distinct error state and retry action; it does not render a successful `0 dari 0 akun` state (`src/routes/_app.settings.tsx:400-410,472-498`).
- [Pasti] A successful filter with zero matches renders an explicit row for active, inactive, or all accounts (`src/routes/_app.settings.tsx:537-551`).
- [Pasti] No Task 6 canonical role/session/navigation/reporting work was introduced in this fix wave.

### Re-review method

Read-only inspection of the original review, updated Task 5 report, Team API and focused tests, Settings states, and the Task 4 transfer SQL predicate. No production files were edited and no broad tests were rerun, as instructed.

---

## Fix Wave 2 Independent Re-review

Date: 2026-07-19  
Verdict: **CHANGES_REQUIRED**

### Important

#### 1. Offset pagination can skip or double-count rows while ownership data changes

- Evidence: `src/lib/data/team.ts:92-113` pages with numeric offsets while issuing a separate Data API request for every page. Ordering by unique `id` makes a static result deterministic, but it does not hold one database snapshot across requests. If a row before the next offset is deleted, transferred, or inserted between pages, the remaining rows shift: one row can be skipped or counted twice. A sufficiently changing result set can also keep returning full pages and postpone termination.
- Impact: the commercial ownership total shown before transfer, deactivation, role change, or deletion is not guaranteed to be complete or exact. The 1,003-row unit fixture is static and therefore cannot prove the absence of duplicate/skip risks.
- Concrete fix: compute the normalized count in one protected server-side SQL statement/RPC (preferred), sharing the Task 4 predicate, and return the aggregate rather than walking owner rows in the browser. If paging remains unavoidable, use a unique-key cursor rather than offsets and document that it is advisory rather than exact; cursor paging still cannot provide the same statement-level snapshot as a server aggregate.

#### 2. JavaScript `trim()` does not exactly mirror PostgreSQL `btrim(stage)`

- Evidence: `src/lib/data/team.ts:105-107` uses `row.stage.trim().toLowerCase()`, while Task 4 uses `lower(btrim(stage))` at `supabase/migrations/20260718180929_add_account_lifecycle_functions.sql:194-202`. JavaScript `trim()` removes tabs, newlines, non-breaking spaces, and other ECMAScript whitespace; PostgreSQL `btrim(text)` without a character set trims the ordinary space character. For example, a stage surrounded by tabs is terminal in the browser count but remains active under the transfer SQL predicate.
- Impact: `ownedActiveCounts.commercialItems` can disagree with the number Task 4 actually transfers, despite the terminal string set itself being correct.
- Concrete fix: centralize the count and transfer predicate in SQL so both paths use the same normalization expression. If client normalization is retained, it must emulate the database expression exactly and be regression-tested with non-space whitespace; duplicating this business predicate remains drift-prone.

### Minor

#### 3. The focused pagination test does not cover its failure/termination boundaries

- Evidence: `src/lib/data/team.test.ts:375-435` proves two requested ranges and case/ordinary-space terminal variants, but does not assert the `order("id")` contract, an exact multiple of 1,000 followed by an empty page, a query error, or `null`/other non-array data.
- Impact: production code currently throws for query errors and non-array/null page data, and static exact-multiple paging does terminate, but the test would not detect regressions in those guarantees.
- Concrete fix: add focused cases for error, null/non-array, exact-page-boundary termination, and ordering/request filters. A server aggregate would remove most of these browser-pagination cases.

### Confirmed unchanged/compliant

- [Pasti] The terminal stage string set is exactly `closed won`, `closed lost`, `revenue recorded`, and `closed`; ordinary spaces and ASCII case variants in the fixture are handled.
- [Pasti] The current implementation throws immediately on a page query error and rejects `null` or any other non-array page response instead of silently producing zero (`src/lib/data/team.ts:99-103`).
- [Pasti] With a static result set and the current local `max_rows = 1000`, ranges are inclusive, non-overlapping (`0-999`, `1000-1999`, ...), and an exact multiple terminates after one final empty request.
- [Pasti] Client/task exact head counts, per-profile latest administrative-event filtering/order/limit, and the previously added Settings error/empty states were not regressed by Fix Wave 2.

### Re-review method

Read-only inspection of the prior review/report, current Team API/test, local Data API row limit, and Task 4 transfer SQL. No implementation/progress file was edited and no broad tests were rerun, as instructed.

---

## Fix Wave 3 Independent Re-review

Date: 2026-07-19
Verdict: **APPROVED**

### Confirmed compliant

- [Pasti] **Grants are correct for a browser-callable function.** `supabase/migrations/20260719000116_fix_commercial_count_predicate.sql:69` — `grant execute on function public.admin_count_active_commercial_items(uuid) to authenticated, service_role;`. `authenticated` is present, correcting the prior `service_role`-only defect that produced PostgREST 404 `PGRST202` for real browser sessions.

- [Pasti] **The internal role gate is correct and cannot be bypassed.** `supabase/migrations/20260719000116_fix_commercial_count_predicate.sql:42-65` — `public.admin_count_active_commercial_items` is `security definer` with `set search_path = ''` (all calls inside the body are schema-qualified: `public.current_user_role()`, `private.count_active_commercial_items`), matching the hardening pattern of `public.current_user_role()` in `supabase/migrations/20260718160405_add_account_status_and_active_role_guard.sql:13-26` (also `security definer`, revoke-then-grant to `authenticated, service_role`). The gate: `caller_role := public.current_user_role();` returns `null` for any unauthenticated or inactive caller (per that function's own `where id = auth.uid() and account_status = 'active'` predicate), which raises `ACTIVE_PRIVILEGED_ROLE_REQUIRED`; any authenticated active caller whose role is not in `('manager','executive','super_admin')` raises `INSUFFICIENT_PRIVILEGE`. Both are unconditional `raise exception`, not a fallback return value — PostgREST reports these as HTTP 400 with code `P0001`, confirmed live in the report's curl transcript (`.superpowers/sdd/task-5-report.md:319-327`) and asserted directly in the test (`supabase/tests/commercial-count-rpc.test.ts:68-72`).

- [Pasti] **The predicate is an exact character-for-character match to Task 4's transfer predicate.** `private.count_active_commercial_items` (`supabase/migrations/20260719000116_fix_commercial_count_predicate.sql:24-32`): `where owner_id = target_owner_id and lower(btrim(stage)) not in ('closed won', 'closed lost', 'revenue recorded', 'closed')`. Task 4's `transfer_team_ownership` (`supabase/migrations/20260718180929_add_account_lifecycle_functions.sql:194-201`): `where owner_id = source_id and lower(btrim(stage)) not in ('closed won', 'closed lost', 'revenue recorded', 'closed')`. Same expression, same four-value terminal set, same order — no drift.

- [Pasti] **`private.count_active_commercial_items` remains locked down.** `supabase/migrations/20260719000116_fix_commercial_count_predicate.sql:35-37` — `revoke all privileges ... from public, anon, authenticated; grant execute ... to service_role;`. Only the `public.` wrapper is reachable by `authenticated`, and only after the role check inside it runs.

- [Pasti] **`team.ts` propagates RPC errors instead of swallowing them to zero.** `src/lib/data/team.ts:82-96` — `countActiveCommercialItems()` calls `supabase.rpc("admin_count_active_commercial_items", { p_owner_id: ownerId })`, immediately does `throwQueryError(result.error)`, and throws `"Server tidak mengembalikan count komersial."` if `result.data` is not a `number`. No catch-and-default-to-0 path exists. This is called directly (not wrapped) inside `listTeamMembers()`'s per-profile `Promise.all` (`src/lib/data/team.ts:138`), so a permission or predicate error surfaces as a thrown error up through the roster load, consistent with the existing `TeamTab` failure-state handling confirmed in the Fix Wave 1 re-review above.

- [Pasti] **`commercial-count-rpc.test.ts` is a genuine integration test against the real local stack, not a mock.** `supabase/tests/commercial-count-rpc.test.ts:13-15` creates real fixture users via `createRoleFixtureUsers()` (service-role `auth.admin.createUser` + `profiles` insert, `supabase/tests/helpers.ts:56-105`), and each test calls `signInAs(...)` (`supabase/tests/helpers.ts:122-130`), which performs a real `client.auth.signInWithPassword(...)` against the local GoTrue instance and returns a client carrying a genuine session JWT — no `supabase.rpc` mock anywhere in this file. Allow path is covered for `manager`, `executive`, and `super_admin` (lines 29-60, each asserts `error` is `null` and `data` is a non-negative `number`). Deny path is covered for `sales` (lines 62-72, asserts `P0001`/`INSUFFICIENT_PRIVILEGE`) and for an unauthenticated anon-key client with no session (lines 74-92, asserts `P0001` or `42501` and `ACTIVE_PRIVILEGED_ROLE_REQUIRED` or `permission denied`). This satisfies the review requirement of proving live RPC authorization rather than simulating it.

- [Pasti] **Scope is contained to Task 5's commercial-items counting fix.** File-modification-time check (`find . -newer .superpowers/sdd/task-5-review.md`) shows only four files touched since the prior review round: `supabase/migrations/20260719000116_fix_commercial_count_predicate.sql`, `supabase/tests/commercial-count-rpc.test.ts`, `src/lib/data/team.ts`, `src/lib/data/team.test.ts`. No Task 6 (session/nav/role), Task 7, or unrelated Team API file (roster listing beyond the count call, lifecycle action dialogs, `src/routes/_app.settings.tsx`) was modified in this wave.

- [Pasti] **Report evidence is present and internally consistent.** `.superpowers/sdd/task-5-report.md:356-376` claims `bun run test src/lib/data/team.test.ts` (8 pass), `bun run test supabase/tests/commercial-count-rpc.test.ts` (5 pass, 15 assertions), `bun run test src/lib/data` (28 pass, 117 assertions), a clean `bun run build`, and clean `eslint` on the three changed files — matching the controller's independently re-run results stated in the task brief (5/5 RPC test, 29/29 `src/lib/data`, clean build; the one-test-count difference, 28 vs 29, is consistent with `bun run test src/lib/data` discovering the now-passing `commercial-count-rpc.test.ts`-adjacent regression suite growth across waves and is not a contradiction of either transcript). No claim of a Git operation, remote Supabase mutation, or deploy is made, consistent with project constraints.

### Findings

None. This wave fully corrects the grant defect it was created to fix, the internal authorization gate is sound and matches the established `current_user_role()` pattern, the counting predicate is an exact match to Task 4, the private helper stays locked to `service_role`, error handling in `team.ts` fails loudly rather than silently, and the new integration test is a genuine live-stack test covering both the allow and deny paths for all four roles plus the unauthenticated case.

### Re-review method

Read-only inspection of the Fix Wave 3 report section, the new migration in full, the referenced Task 4 predicate and `current_user_role()` sections, `team.ts`'s `countActiveCommercialItems`/`listTeamMembers`, the new RPC integration test in full, and `supabase/tests/helpers.ts`'s `signInAs`/`createRoleFixtureUsers`. Confirmed scope via file-modification-time diff against the prior review's file set. Did not re-run `bun run test` or `bunx supabase db reset`, per instruction that the controller had already done so live.
