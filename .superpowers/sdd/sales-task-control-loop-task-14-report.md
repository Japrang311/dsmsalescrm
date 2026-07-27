# Sales Task Control Loop Task 14 Report

Date: 2026-07-27

Task: Migrate Pipeline, Client Detail, and commercial follow-up paths

## Result

Completed locally.

- Added `src/lib/data/task-relations.ts` to centralize Client-related and
  commercial-related Task selectors.
- Pipeline next-action fallback now uses active commercial-linked Tasks through
  `workflowStatus`/archive semantics, not legacy `status !== "Done"`.
- Client Detail now shows only Tasks whose `clientId` matches the Client, so
  standalone Tasks remain valid elsewhere without leaking into Client records.
- Client Detail active action badges and Task table now display workflow status
  and due state separately.
- Commercial Detail now shows only explicitly linked commercial Tasks instead
  of every Task on the same Client.
- Pipeline drawer, Pipeline drag/drop next-action creation, and commercial
  follow-up creation no longer pass `status: "Upcoming"` from UI call sites;
  the adapter keeps the legacy compatibility default in one place.

## Files Changed

- `src/lib/data/task-relations.ts`
- `src/lib/data/task-relations.test.ts`
- `src/routes/_app.pipeline.tsx`
- `src/routes/_app.clients.$clientId.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx`
- `src/components/commercial/CommercialDetailPage.tsx`
- `tasks/sales-task-control-loop-todo.md`
- `HANDOFF.md`

## Verification

- `bun --env-file=.env.local test src/lib/data/task-relations.test.ts src/lib/dashboard-export-data.test.ts src/lib/report-selectors.test.ts src/lib/data/dashboard-selectors.test.ts src/lib/data/tasks.test.ts`
  - 31 pass, 0 fail
- `bunx tsc --noEmit`
  - pass
- `bunx eslint src/lib/data/task-relations.ts src/lib/data/task-relations.test.ts src/routes/_app.pipeline.tsx src/routes/_app.clients.$clientId.tsx src/components/pipeline/PipelineCardDrawer.tsx src/components/commercial/LogCommercialFollowUpDialog.tsx src/components/commercial/CommercialDetailPage.tsx`
  - pass
- `bun run build`
  - pass; existing warnings only: Node `module.register()` deprecation,
    `vite-tsconfig-paths` redundancy notice, and large chunk warnings.
- Static inspection:
  - Task 14 surfaces no longer contain `t.status`, `task.status`,
    `status: "Upcoming"`, or `status !== "Done"` Task logic.
  - Remaining `status` matches in these files are Client status UI, not Task
    legacy status.
- Runtime/browser check:
  - Started local dev server at `http://127.0.0.1:8081`.
  - Captured Playwright Chromium screenshots for `/pipeline` and `/clients`
    after a 6 second wait; both routes rendered, and RFQ was not visible.
  - `curl` runtime HTML checks for `/pipeline` and `/clients` also found no
    `RFQ`/`rfq` text.

## Boundary

- No remote Supabase mutation was performed.
- No Git push or deployment was performed.
- Playwright Chromium was downloaded into the local Playwright cache for
  browser verification; `package.json` and `bun.lock` were not changed.
