# Sales Task Control Loop — Task 7 Completion Report

Task: implementation-plan Task 7 / project-tracker Task 52 — "Deliver Task
creation and owner lifecycle"
Date: 2026-07-27
Scope: UI components + data-layer, plus manual browser verification
Remote mutation: none
Depends on: Task 6 / Task 51 (done 2026-07-27)

## Outcome

**`src/lib/domain.ts`** — `Task.clientId` widened to optional (`string`
→ `string | undefined`), finally making Client genuinely optional
end-to-end (spec §2.1). Task 6/51 deliberately deferred this because none
of its own acceptance criteria required it and widening it then broke
`tsc` in files outside its scope; Task 7/52 explicitly requires "a Task
may omit Client," so the ripple is fixed here instead:
`src/components/shell/TopBar.tsx` (notification list guards a missing
`clientId` before navigating/looking up a name) and
`src/routes/_app.tasks.tsx` (4 call sites null-guard `clientsById[...]`
lookups). `src/lib/data/follow-ups.ts`'s `FollowUpLog.clientId` and
`logFollowUp()`'s input were widened the same way, since
`follow_up_logs.client_id` is nullable too (Task 3/48) and
`LogFollowUpDialog.tsx` (out of scope, not rewired) passes `task.clientId`
straight through.

**`src/lib/data/tasks.ts`** — `createTask()` accepts optional `clientId`
(inserts `null`) and optional `category`.

**`src/components/tasks/CreateTaskDialog.tsx`** — Client field is now
optional (zod schema, form default, submit payload); added a Category
`<Select>` (7 values, defaults `"Other"`).

**`src/components/tasks/TaskDetailDrawer.tsx`** — split into two
independent sections matching the domain model's own split (spec
§3.1-§3.2):
- **Detail Task**: title/dueDate/method/priority/category, saved via
  `updateTask()` (plain correction fields, unchanged mechanism).
- **Catat Progress** (new): a `workflowStatus` target selector: `Open`/
  `In Progress`/`Waiting External` show Next Action + Next Action Date
  fields (required); `Cancelled` shows a required Cancellation Reason
  instead (pre-filled with the existing reason when the Task is already
  Cancelled, so reopening the drawer shows why it was cancelled); a Note
  field folds in what used to be a separate "Tambah catatan" section
  (that section wrote directly to `activity_log` only, bypassing
  `follow_up_logs` entirely — removed in favor of one path through the
  RPC). Saved exclusively via `recordTaskProgress()` — the only way to
  change `workflowStatus`/`nextAction`/`nextActionDate`/
  `cancellationReason`, satisfying Task 6's "direct multi-write progress
  code is no longer exported for UI use." The quick "Tandai selesai"
  button now calls `recordTaskProgress(..., workflowStatusTarget: "Done")`
  instead of the legacy `updateTask({status: "Done"})`. Reopening a Done/
  Cancelled Task requires picking an active status and filling a fresh
  next action, per spec §2.4a — there's no separate one-click "reopen"
  button; it goes through the same Progress form.

**Deliberately not touched**: `_app.tasks.tsx`'s own list-level quick
actions (`handleDone`, `handleSnooze`, `handleUndo`,
`handleCreateChildTask`) still call the legacy `updateTask({status})`
path, not `recordTaskProgress()`. These are a separate, redundant shortcut
UI; the Task Detail Drawer (this task's actual deliverable) is the
complete, correct interface for every lifecycle transition Task 7
requires. Migrating those list shortcuts is more appropriately Task 8's
or Task 11-15's concern, and rewiring a ~1600-line file's several
independent code paths in the same turn as this task's core deliverable
risked more than it was worth.

## Real bugs found and fixed via required manual browser verification

Per the implementation plan's own verification bullet ("Manual local
browser check verifies create/edit/archive flows for Sales and
Manager"), this task was tested end-to-end in a real browser
(`bun run dev` + chrome-devtools MCP) against the two real seeded
accounts (`nur@local.dsm.test` / Sales, `adhitya@local.dsm.test` /
Manager) rather than only unit/integration tests. This surfaced three
real bugs automated tests missed entirely:

1. **`CreateTaskDialog.tsx` sent `client_id: ""` to `activity_log`,
   crashing with `22P02 invalid input syntax for type uuid`.**
   `createTask()`'s own call correctly did `v.clientId || undefined`, but
   the follow-up `logActivity()` call two lines later passed
   `v.clientId` raw — react-hook-form's field defaults to `""`, not
   `undefined`, even when the zod schema marks it optional. The Task
   itself was created (the first insert succeeded); only the audit-log
   entry silently failed. Fixed by applying the same `|| undefined` guard
   to that call.
2. **`listTaskHistory()` filtered activity_log by
   `kind IN ('task_created', 'task_status_change')`, excluding the new
   `'task_progress'` kind** (Task 5/50) entirely. Every real
   `recordTaskProgress()` call succeeded and wrote a correct audit row,
   but the drawer's "Riwayat" section showed 0 entries regardless. Fixed
   by adding `'task_progress'` to the `kind` filter in
   `src/lib/data/activity-log.ts`.
3. **Local Progress-form state went stale after a successful save.**
   `submitProgress()`/`markDone()` call `recordTaskProgress()` then
   `invalidate()`, refetching the Task -- but the component's `useEffect`
   that seeds `nextAction`/`nextActionDate`/`progressTarget` only reruns
   on `task.id`/`open` changing, neither of which happens on a same-Task
   save. Reopening a form immediately after cancelling, for example,
   showed the previous (now server-nulled) next action instead of empty
   fields. Fixed by explicitly resetting the relevant local state in both
   success paths.

None of these were caught by `bunx tsc --noEmit` or the automated test
suite — all three are runtime-only, data-shape or state-timing issues
that only a real browser session exercising the actual click-through flow
would surface. This is exactly why the implementation plan requires this
verification step rather than treating type-checks and unit tests alone
as sufficient for UI tasks.

## Manual browser verification performed

Logged in as both real seeded accounts (not the browser-only Prototype
Role switcher, which CLAUDE.md notes is never the authorization
boundary):

- **Sales (`nur@local.dsm.test`)**: created a standalone Task with no
  Client and category `Internal/Admin`; recorded progress to
  `In Progress` with a next action/date; cancelled with a reason (legacy
  `status` correctly dual-wrote to `Done`, confirming Task 5/50's mapping
  end-to-end in the live UI); reopened to `Open` with a fresh next action
  (confirmed the stale-state bug above, then confirmed the fix); marked
  Done via the quick action; archived (confirmed workflow status
  unaffected, satisfying "archive never changes workflow status").
- **Manager (`adhitya@local.dsm.test`)**: created a Task owned by
  themselves (Owner picker enabled and defaulting to self, unlike Sales
  where it's disabled/locked); recorded progress to `Waiting External`
  with a next action/date — confirming "Manager can operate personal
  Task flows exactly as Sales can."
- Confirmed no console errors and no unexpected network requests
  throughout (checked via chrome-devtools MCP's console/network
  inspection after every mutating action).

One automation-only caveat worth recording: chrome-devtools MCP's `fill`
tool did not reliably trigger React's `onChange` on native
`<input type="date">` elements (it updates the DOM value but not React's
controlled state) — filling those required the native property-setter +
dispatched-event technique instead. This is a testing-tool limitation,
not an application bug; real user typing/date-picker interaction is
unaffected.

## Test coverage

- `src/lib/data/tasks.test.ts` — new test: `createTask()` with no
  `clientId` and an explicit `category` persists correctly (`clientId`
  undefined, `category` and default `workflowStatus: "Open"` verified
  against the DB); new test: `updateTask()` persists a `category`
  correction.

## Verification actually run

- `bunx tsc --noEmit` → clean throughout (checked after every source
  edit, including the three bug fixes above).
- `bunx supabase db reset` — clean.
- Full suite `bun run test`, run twice on a fresh reset → **435 pass, 0
  fail across 57 files**, both times.
- Manual browser verification as described above, covering create,
  progress (all five workflow states reachable), cancel-with-reason,
  reopen-with-next-action, quick-complete, and archive, for both Sales
  and Manager.
- `git diff --check` — clean.
- No `supabase db push` / `apply_migration` / `execute_sql` / remote
  mutation. No `.env.local` change. No new dependency. No commit, push,
  PR, or deployment performed this session. Dev server and browser
  session were stopped/closed at the end of verification.
