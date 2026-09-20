# DSM Precision — development specification

Status: approved direction A; implementation authorized 2026-09-20.

## Purpose

Make the CRM feel premium, calm and precise for sales and managers. Prioritize the next sales action, preserve financial meaning, and make mobile a usable workspace. This implementation follows the user's explicit instruction to proceed from specification to execution; no additional mockup approval gate is required.

## Scope and invariants

- Shared light theme, Manrope typography, buttons, cards, overlays, page spacing and mobile navigation. Existing dark tokens remain supported.
- Dashboard: one primary monthly achievement field, compact YTD/PO context, immediate follow-up access, role-aware order, secondary analytics below the work area, export period inside an export panel.
- Tasks: compact status tabs, visible search and collapsible advanced filters with active count/reset. Keep personal/team separation and history pagination.
- Pipeline: Board / Daftar / Analitik; default mobile to Daftar, desktop to Board. Stage selector for list, shared card actions, existing per-stage pagination and explicit loaded-data scope. Analytics remain available.
- Clients, Quotations, Sales Orders and Reports inherit shared visual controls and responsive filter behavior; preserve their domain layouts and actions.
- No schema, RLS, auth, financial calculations, stage rules, remote data writes, deployment or Git publication as part of design work.
- Reuse Lucide icons already present rather than introduce a second icon library. Use Tailwind and semantic tokens. Self-host the font through Fontsource.

## Visual contract

- Canvas #F5F5F2; surface white; foreground/navy #183244; blue primary retained for continuity; slate secondary text; existing semantic status colors.
- Manrope variable, weights 400/500/600/700. Body 14–16px, metadata minimum 13px, inputs 16px on mobile. Titles 24px mobile / 30px desktop. Tabular currency, no mid-value wrapping.
- Radius: controls 8px, cards 12px. Subtle borders; shadows only for floating UI and selected emphasis. No glass blur, animated backgrounds or decorative number count-up.
- Spacing: 4px base, page padding 16px mobile / 24–32px desktop. Content must shrink within flex/grid containers.
- Mobile bottom navigation: Beranda, Tugas (Clients for executive), Pipeline, Lainnya (existing sidebar). Respect role restrictions and safe-area insets. Reserve bottom space and keep overlays above navigation.

## Interaction contract

- Target mobile controls at least 44px tall/wide where applicable; visible focus rings and semantic selected states.
- Button feedback 100–150ms, content fade 180ms, drawers 240ms. Animate opacity/transform, respect prefers-reduced-motion; actions never wait for animation.
- Loading skeletons reflect final structure. Existing errors remain visible. No empty-state message before loading finishes.
- Dashboard follow-up links open the existing task workflow; do not present a nonfunctional Mark Done button.
- Filters retain selections while collapsed, show active count and provide reset. Pagination and loaded-data disclosures remain visible in pipeline list/board.

## Acceptance criteria

1. At 390×844 dashboard priority heading appears within the first viewport; monthly KPI and YTD/PO context remain readable. Sales see follow-up before chart; managers see priority and chart side by side on wide screens, priority first on mobile.
2. Pipeline first card appears within the first viewport at 390×844 with default filters when data exists; mobile list shows only selected stage. Desktop board still offers all stages, drag/drop, details and load more.
3. Tasks status controls occupy one horizontal row; advanced filters are initially collapsed; search remains immediately accessible. Task/team scopes and history behavior remain unchanged.
4. No document horizontal overflow at 360/390/768/1440px; intentional board/table scrolling remains contained. Navigation does not cover actions.
5. Export supports the same PDF/CSV/Excel actions and period semantics through its new panel.
6. Keyboard navigation, focus visibility, drawer closure, mobile navigation and reduced motion work. Existing business tests, typecheck, lint and build pass.

## Evidence boundaries

Audit baseline was live authenticated manager UI, not a local-build test. Validate changes locally; report authenticated or physical-device blockers explicitly. Do not equate a fixture preview with real backend verification.
