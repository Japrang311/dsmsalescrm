# Task 3 Independent Review

## Verdict

`CHANGES_REQUIRED`

[Pasti] The database contract, immutable four-role website boundary, data
mapper, actor/target attribution, and scope boundary are implemented correctly.
One route-level compatibility defect remains: the new Indonesian administrative
event label is rendered and exported but is not searchable, contrary to the
Task 3 implementation report and the requested search compatibility check.

This review was read-only with respect to implementation. I did not rerun any
reported tests, build, typecheck, lint, Supabase reset, schema lint, or advisor.
The only file written is this review.

## Critical findings

None.

## Important findings

### 1. Administrative event labels are omitted from the search haystack

[Pasti] `src/routes/_app.activity.tsx:417-432` assigns the Indonesian mapper
label to `FeedEvent.kindLabel`. The list, detail sheet, related-event list, and
export then use that label at `:804`, `:887`, `:1014`, and `:578-587`.
However, the search haystack at `:498-503` includes title, detail,
administrative reason, client, owner, actor, and target, but neither
`e.kindLabel` nor `KIND_META[e.kind].label`.

This is observable whenever an administrative event's title is not the same as
its display label. For example, a row with kind `team_member_created`, title
`team_member_created`, and display label `Anggota Tim Dibuat` renders and
exports as `Anggota Tim Dibuat`, but searching for `Anggota Tim Dibuat` filters
the row out. The mapper test itself creates exactly this title shape at
`src/lib/data/activity-log.test.ts:27-39`.

This contradicts the implementation report's claim at
`.superpowers/sdd/task-3-report.md:111-116` that search uses the new Indonesian
labels.

Required change: include the effective display label
(`e.kindLabel ?? KIND_META[e.kind].label`) in the search haystack and add a
focused regression test proving an administrative event can be found by its
Indonesian label when its title does not contain that label.

## Minor findings

### 1. The authenticated-column privilege boundary lacks a direct regression test

[Pasti] The SQL boundary is correct: the prior hardening migration grants
authenticated callers INSERT only on the nine existing business-event columns
(`supabase/migrations/20260718171152_harden_super_admin_rls_matrix.sql:210-223`),
and the Task 3 migration explicitly revokes INSERT on all three administrative
columns (`supabase/migrations/20260718173153_add_team_admin_audit_fields.sql:70-77`).
The original table-level service-role grant includes INSERT at
`supabase/migrations/20260718011409_activity_log.sql:74-75`, and the successful
administrative inserts through `adminClient` at
`supabase/tests/activity-log.test.ts:179-208` exercise that privileged path.

The focused test does not attempt an administrative-column insert through an
authenticated client and assert privilege denial. Static SQL and the reported
catalog inspection are strong evidence, so this does not independently block
Task 3, but a direct negative test would protect this security boundary from a
future broad table-level grant.

## Required-contract evidence

- **Enum transaction isolation — compliant.** [Pasti] All seven enum additions
  are isolated in the enum-only migration
  `20260718173152_add_team_admin_activity_kinds.sql:1-23`; the constraints that
  reference those values are in the next migration at
  `20260718173153_add_team_admin_audit_fields.sql:52-68`.
- **Administrative reason enforced by the database — compliant.** [Pasti] The
  named check requires non-null, non-whitespace reason text for every one of the
  seven administrative kinds at
  `20260718173153_add_team_admin_audit_fields.sql:52-68`. The focused test covers
  null, empty, and whitespace for every kind at
  `supabase/tests/activity-log.test.ts:210-231`.
- **Snapshot allowlist/no nested values — compliant.** [Pasti] The snapshot
  must be a JSON object; subtracting `name`, `email`, and `role` must leave an
  empty object; and each present field must be a JSON string at
  `20260718173153_add_team_admin_audit_fields.sql:13-50`. Therefore unknown or
  secret top-level keys and nested objects/arrays are rejected. The unsafe-key
  regression test is at `supabase/tests/activity-log.test.ts:233-259`.
- **Exact four snapshot roles — compliant.** [Pasti] A present role is limited
  to `sales`, `manager`, `executive`, or `super_admin` at
  `20260718173153_add_team_admin_audit_fields.sql:38-47`; invalid-role rejection
  is tested at `supabase/tests/activity-log.test.ts:261-285`.
- **Target deletion persistence — compliant.** [Pasti] The FK is `ON DELETE SET
NULL` at `20260718173153_add_team_admin_audit_fields.sql:1-5`, with a partial
  FK lookup index at `:7-11`. The integration test deletes the target and
  verifies a null target ID plus the exact persisted three-key snapshot and
  reason at `supabase/tests/activity-log.test.ts:287-365`.
- **Four-role immutability — compliant.** [Pasti] Sales, Manager, Executive, and
  Super Admin each attempt UPDATE and DELETE, and the original row is verified
  intact at `supabase/tests/activity-log.test.ts:139-177`. No Task 3 migration
  creates an UPDATE/DELETE policy or authenticated grant.
- **Authenticated versus service-role grants — compliant, with the Minor test
  gap above.** [Pasti] Authenticated callers cannot supply the three new
  server-owned columns, while service role retains the existing table INSERT
  grant. The implementation report's fresh catalog inventory independently
  records the same state at `.superpowers/sdd/task-3-report.md:214-232`.
- **Actor/target separation — compliant.** [Pasti] Actor name is resolved only
  from `a.actorId`; target name is resolved from `a.targetProfileId` and falls
  back to the snapshot at `src/routes/_app.activity.tsx:417-432`. List and
  related-event rows render `Aktor` and `Target` separately at `:825-835` and
  `:1025-1036`; the detail sheet uses distinct fields at `:905-930`. A deleted
  target snapshot is never used as actor attribution.
- **Rendering/export compatibility — compliant; search compatibility is not.**
  [Pasti] All new kinds share the `team_admin` presentation metadata at
  `src/routes/_app.activity.tsx:132-185`. The Indonesian per-kind label is used
  in list/detail/related UI and export. Search omits it as described in Important
  finding 1. Export remains structurally compatible via `kindLabel` at
  `src/routes/_app.activity.tsx:577-587` and
  `src/lib/export-activity.ts:67-93,101-174`.
- **No Task 4/5 scope creep — compliant.** [Pasti] Task 3 files add only enum
  values, audit columns/constraints/grants, tests, mapper fields/labels, and
  Activity Log presentation. They do not add lifecycle SQL primitives, Edge
  Function actions, Team & Role Settings UI, account-session handling, or
  ownership selectors. The separate enum migration is justified by PostgreSQL
  enum commit visibility, not by lifecycle scope.

## Verification assessment

[Pasti] The submitted evidence reports focused Activity Log database tests
`11/11`, Activity Log mapper test `1/1`, full Supabase suite `108/108`, focused
data suite `20/20`, changed-file ESLint clean, production build green, schema
lint clean, and local security/performance advisors clean
(`.superpowers/sdd/task-3-report.md:120-212`).

[Pasti] The reported project-wide typecheck has exactly two errors, both in
`src/components/commercial/CommercialViews.tsx`, and no Task 3 file appears in
the TypeScript output (`.superpowers/sdd/task-3-report.md:187-201`). Under the
review instruction, these two CommercialViews errors are treated as
pre-existing and are not a Task 3 blocker.

## Approval gate

Task 3 can be approved after Important finding 1 is fixed and its focused
search regression test passes. The Minor privilege-test gap is recommended but
does not block approval.

---

## Fix wave 1 re-review

### Verdict

`APPROVED`

[Pasti] The previous Important search finding and Minor privilege-test gap are
resolved. Fix wave 1 is narrowly scoped to the two requested corrections and
does not introduce Task 4/5 behavior.

This re-review did not rerun tests, build, typecheck, lint, Supabase commands,
or advisors. It inspected the appended evidence and current files only.

### Finding resolution

#### Important finding 1 — resolved

[Pasti] `src/lib/data/activity-search.ts:12-31` builds a case-insensitive
haystack containing every prior search field plus the effective event label at
`:21` (`event.kindLabel ?? fallbackKindLabel`). This preserves title, detail,
administrative reason, client, owner, actor, and target search at `:17-29`.

[Pasti] `src/routes/_app.activity.tsx:499-511` now delegates query matching to
that helper, passes the resolved client name, and supplies
`KIND_META[e.kind].label` as the fallback. Therefore real administrative rows
use their per-kind Indonesian `kindLabel`, while existing feed categories keep
their previous fallback label.

[Pasti] The focused regression at
`src/lib/data/activity-search.test.ts:4-16` uses the exact failure scenario from
the original review: technical title `team_member_created`, Indonesian label
`Anggota Tim Dibuat`, and a query for that Indonesian label. It would fail if
the effective label were removed from the haystack.

#### Minor finding 1 — resolved

[Pasti] `supabase/tests/activity-log.test.ts:210-232` signs in as the Sales
fixture and attempts a Data API insert containing the administrative kind and
all three protected fields. It asserts null data and PostgreSQL error `42501`.

This is a precise privilege-boundary test rather than an ambiguous RLS failure:
the row uses the authenticated Sales user as both owner and actor
(`:217-218`), so the existing Sales-own insert policy can pass; it also supplies
a valid snapshot and nonblank reason (`:219-226`), so the Task 3 checks can
pass. The remaining rejection source is the authenticated caller's missing
INSERT privilege on the protected administrative columns. The existing
service-role success loop remains at `:179-208`.

### Regression, quality, and scope assessment

- **Correctness — approved.** [Pasti] The helper is pure, its boundary is typed,
  the route passes the intended fields, and the regression test covers the
  originally failing behavior.
- **Security — approved.** [Pasti] The direct authenticated negative test now
  complements the existing service-role positive path and static column-grant
  evidence. No grant, policy, constraint, or migration was relaxed.
- **Readability/architecture — approved.** [Pasti] Extracting the search match
  into `src/lib/data/activity-search.ts` keeps the already-large route from
  accumulating another inline haystack and makes the behavior independently
  testable. No dependency was added.
- **Performance — approved.** [Pasti] The helper performs one bounded array
  join and lowercase substring match per already-filtered in-memory event,
  equivalent in complexity to the prior inline implementation.
- **Scope — approved.** [Pasti] Current Fix wave 1 files add only the search
  helper/test, route wiring, and the missing Data API regression test. They add
  no lifecycle primitive, Edge Function action, Team & Role UI, session logic,
  ownership selector, migration, RLS policy, or grant.

### Evidence assessment

[Pasti] The appended Task 3 report records focused tests `13/13`, full Supabase
suite `109/109`, focused data suite `21/21`, changed-file formatting/lint clean,
and production build green. It also records the same two project-wide
`CommercialViews.tsx` route-type errors with no Task 3 file in TypeScript
output. Under the review instruction, those unchanged non-Task-3 errors remain
pre-existing and do not block approval.

### Final approval gate

[Pasti] No Critical, Important, or unresolved Minor finding remains from this
review. Task 3 is approved for progression to the next gated task.
