# Sales Task Control Loop — Task 4 Completion Report

Task: implementation-plan Task 4 / project-tracker Task 49 — "Centralize
holiday calendar and derived due state"
Date: 2026-07-27
Scope: local Supabase migration + TypeScript mirror + tests only
Remote mutation: none
Depends on: Task 3 / Task 48 (done 2026-07-27)

## Outcome

New migration:
`supabase/migrations/20260727130000_add_business_calendar.sql`

- `public.business_calendar_holidays` — one row per holiday/cuti bersama
  date: `holiday_date` (unique), `label`, `source` (provenance), `synced_at`,
  `entered_by`. RLS: every authenticated role can SELECT; only Manager/Super
  Admin can INSERT/DELETE (spec §5.4). No UPDATE policy — a correction is a
  delete + insert of a new row, same append/replace pattern as
  `follow_up_logs`, so `entered_by`/`synced_at` stay trustworthy per row.
- `public.is_business_day(date)` — Mon–Fri and not a holiday row.
- `public.count_business_days_strictly_between(date, date)` — business days
  strictly between two dates, used for the escalation threshold.
- `public.business_calendar_incomplete(date, date)` — true if any calendar
  year spanned by the range has zero holiday rows. This is the explicit,
  visible fallback signal spec §5.5 requires instead of silently treating
  an unimported year as holiday-free or all-holiday.
- `public.compute_task_due_state(due_date, workflow_status, as_of default
today in Asia/Jakarta)` — returns `(due_state, calendar_incomplete)`.
  `due_state` is `Upcoming`/`Today`/`Overdue`/`Escalated`, or `null` for
  `Done`/`Cancelled` (spec §2.2). Escalation fires once 2 business days have
  fully elapsed since `due_date`, matching spec §5.2's worked example
  exactly (Monday due → Escalated starts Thursday).

New TypeScript mirror: `src/lib/data/business-calendar.ts` —
`computeTaskDueState()` plus its `isBusinessDay`/
`countBusinessDaysStrictlyBetween`/`businessCalendarIncomplete` building
blocks, implemented as pure functions on `"YYYY-MM-DD"` strings (never
`Date` objects for calendar math, to avoid the exact local-timezone drift
bugs already present in `_app.tasks.tsx`'s `bucketFor()` and the other
`setDate()` call sites Task 2 catalogued). Also exports
`listBusinessCalendarHolidays()`, a thin fetch of the calendar table as a
`Set<string>` for callers to feed into the pure functions.

**Deliberately not done in this migration:** seeding real Indonesian public
holidays/cuti bersama for any year. Spec §5.4 requires manual annual entry
by a Super Admin/Manager (via Settings UI, not built yet, or a controlled
seed) — guessing at a real government decree this session cannot verify
would risk silently wrong escalation dates. The table is correctly empty
after this migration; `calendar_incomplete` is expected to read `true` for
every real task until that data is entered, which is the intended fallback
behavior, not a gap.

## Test coverage

Shared fixture list (`supabase/tests/business-calendar-fixtures.ts`, 18
cases) is imported by both:

- `src/lib/data/business-calendar.test.ts` — runs every fixture through the
  pure TypeScript function.
- `supabase/tests/business-calendar.test.ts` — runs every fixture through
  the `compute_task_due_state` RPC (seeding/cleaning up each fixture's
  holiday rows per test), plus:
  - timezone-default test (`p_as_of` omitted resolves to the current
    Asia/Jakarta date, not UTC or server-local time),
  - a holiday-correction test proving due state recomputes live (insert a
    holiday → threshold shifts; delete it → threshold reverts, same call,
    no caching),
  - RLS: all four roles can read; Sales/Executive rejected on
    insert/delete; Manager/Super Admin can insert and delete.

Fixture categories cover every case Task 4's verification bullet lists:
Friday-to-Monday (weekend-only), consecutive holidays (2-day cluster),
single holiday/cuti bersama (1-day shift), year-end crossing into an
unimported year, leap day (2028-02-29), far-future year with zero calendar
data, and Done/Cancelled terminal states. Weekdays used in fixtures were
verified with the `date` CLI, not hand-computed, to rule out arithmetic
mistakes feeding wrong "expected" values into the test itself.

One deliberate scope boundary: fixtures use `2026-01-01` (New Year's Day —
a universal, non-guessable public holiday) and `2028-01-01` as anchor rows
so `calendar_incomplete` reads `false` for fixtures not specifically
testing the incomplete-calendar path. This is test-only seed data inserted
and deleted per test, not a claim about the real production calendar.

## Verification actually run

- `bunx supabase db reset` — clean, both new migrations applied with no
  errors (this task's migration stacks on Task 3's).
- Manual smoke test of `compute_task_due_state` against the spec §5.2
  worked example (Monday due date, Today/Overdue/Overdue/Escalated across
  four `as_of` values) and the holiday-shift/far-future/Done cases, before
  writing the full automated suite — all matched hand-derived expectations
  exactly.
- `bun run test supabase/tests/business-calendar.test.ts
src/lib/data/business-calendar.test.ts` → **41 pass, 0 fail** (18 shared
  fixtures × 2 consumers + timezone + correction + RLS tests).
- Full suite `bun run test` → **414 pass, 0 fail across 55 files.**
- `bunx tsc --noEmit` → clean.
- `bun run lint` → run separately; report to follow once it completes (a
  prior lint run from Task 3's verification ran unusually long — 24+
  minutes at high CPU with no output — and was killed as stale; a fresh
  run was started to cover today's new files cleanly).
- `git diff --check` — clean.
- No `supabase db push` / `apply_migration` / `execute_sql` / remote
  mutation. No file changed outside migrations/tests/the two new
  `business-calendar.ts`/`business-calendar-fixtures.ts` modules. No
  `.env.local` change. No dependency added. No commit, push, PR, or
  deployment performed this session.
