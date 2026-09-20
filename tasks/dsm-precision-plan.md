# DSM Precision — implementation plan

Spec: ../specs/dsm-precision-design.md

## 1. Theme and shared primitives
- Files: styles.css, __root.tsx, package.json/bun.lock, ui/card.tsx, ui/button-variants.ts.
- Acceptance: local Manrope, warm canvas/navy, distinct radii, focus and reduced-motion rules.
- Verify: dependency resolution, typecheck and rendered theme.

## 2. Shell and responsive controls
- Files: MobileNavigation.tsx, _app.tsx, TopBar.tsx, PageContainer.tsx, FilterBar.tsx.
- Acceptance: role-aware bottom navigation, safe-area space, solid header, compact mobile filters.
- Verify: desktop/mobile navigation and filter disclosure.

## 3. Dashboard work hierarchy
- Files: _app.dashboard.tsx, KpiCard.tsx, TodaysFollowUpList.tsx, DateRangePicker.tsx, PageSkeleton.tsx.
- Acceptance: compact hero, priority before secondary analytics, export panel, actionable follow-up link, skeleton.
- Verify: role-aware rendering, currency layout, export period/action access.

## 4. Tasks focus
- Files: _app.tasks.tsx, shared FilterBar.
- Acceptance: compact status row, search above collapsed advanced controls; counts/reset preserve filtering behavior.
- Verify: task-controller tests, history switches and filtered views.

## 5. Pipeline work views
- Files: _app.pipeline.tsx, PipelineBoard.tsx, PipelineFilterBar.tsx.
- Acceptance: responsive default view, selectable stage list, board and analytics switch, reuse existing card callbacks and pagination.
- Verify: pipeline filter tests, keyboard details, stage selection, load more.

## 6. Polish and verification
- Files: shared sheet/dialog primitives, focused tests, this plan and report.
- Acceptance: consistent motion, contrast and mobile controls; shared styles extend to remaining modules.
- Verify: targeted tests then lint/typecheck/build, real browser local checks at 360/390/768/1440; document blockers.

Dependencies: 1 → 2 → 3 → 4 → 5 → 6. Review each slice before continuing. No agent delegation needed.

## Risks
- Existing historical tasks/plan.md and tasks/todo.md must not be overwritten; this scoped plan supplements them.
- Financial filters must not silently change KPI semantics. Retain export-only labeling and loaded-data scope.
- Global touch sizes can disturb dense calendars/tables; scope them to shared controls and verify.
- Local auth may lack a session. Use existing local test setup if available; never copy production session tokens or bypass application auth.
