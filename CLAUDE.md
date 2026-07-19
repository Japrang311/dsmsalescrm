# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DSM Sales Execution & Client Revenue Tracking System — a TanStack Start (React 19) front-end built in Lovable with a real local Supabase Postgres backend. Phase 12 (explicit Super Admin authorization/account lifecycle) and Phase 11 (normalized RFQ/Quotation/Sales Order headers/items, importer, atomic numbering, revisions, forms, and grouped views) are locally verified complete as of 2026-07-19. See `.superpowers/sdd/task-7-report.md` and `.superpowers/sdd/p11-task-8-report.md`. The Phase 11 import's 55-entry review backlog was fully resolved and re-imported later the same day (586 headers, ≈Rp131.024.482.393 paid total, local-only) — see `.superpowers/sdd/p11-review-decisions-report.md` and `HANDOFF.md`. Read both ADRs, accepted specs, and implementation plans before touching roles, RLS, Settings, auth, or commercial schema. `tasks/plan.md` and `tasks/todo.md` define current status and sequencing.

- **The user is not a programmer and is building this solo.** Explain jargon in plain terms as it comes up; favor explicit checkpoints over silently making judgment calls on anything irreversible (schema changes, deleting mock data, touching a real Supabase project).
- Local Supabase project ID is `DSM_SALES_WEB_APP_V2`. Treat the exact remote target as unconfirmed for Phase 11: never run `supabase link`, `supabase db push`, or another non-local mutation without explicit approval naming the target project.
- **RLS is the real access-control boundary**, not app code. Migrations now implement `sales`/`manager`/`executive`/`super_admin` plus active-profile fail-closed checks across every exposed table (Phase 12, locally verified). Role-based UI filtering is never the security boundary.
- This repo is connected to **Lovable**: don't rewrite published git history (force-push, rebase/amend/squash already-pushed commits) — it desyncs the Lovable editor and can lose the user's project history (`AGENTS.md`). Note: as of the backend work starting, this directory is not actually a git repository yet (no `.git`) — flag this if it becomes relevant.

## Commands

Package manager is **bun** (`bun.lock`, `bunfig.toml`).

```bash
bun install        # install deps
bun run dev         # vite dev server
bun run build        # production build
bun run build:dev     # dev-mode build
bun run preview       # preview a build
bun run lint         # eslint .
bun run format        # prettier --write .
bun run test          # bun:test — RLS policy tests + data-layer tests, against the LOCAL Supabase stack only

bunx supabase start    # start local Supabase (Postgres+Auth+Studio, needs Docker Desktop running)
bunx supabase db reset # rebuild local DB from supabase/migrations/ + supabase/seed.sql
bunx supabase stop     # stop local Supabase
```

Note: `bun test` (bare, no `run`) will fail with a missing-env-var error — Bun intentionally skips `.env.local` in test mode. Always use `bun run test`, which passes `--env-file=.env.local` explicitly.

The repository uses `bun:test`; `bun run test` loads `.env.local` and includes RLS/data-layer/import tests against local Supabase where applicable.

`vite.config.ts` is intentionally minimal — `@lovable.dev/vite-tanstack-config` already wires TanStack devtools, `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, nitro, `@` path alias, and React/TanStack dedupe. Do not re-add any of those plugins manually or the app breaks with duplicate plugins.

## Architecture

### Routing

File-based routing via TanStack Start/Router in `src/routes/`. See `src/routes/README.md` for the full convention table. Key points:

- No `src/pages/`, no `_app/index.tsx`, no `app/layout.tsx` (those are Next/Remix conventions, not TanStack).
- `src/routes/__root.tsx` is the only app shell/root layout.
- `src/routeTree.gen.ts` is auto-generated — never hand-edit it.
- Route filenames use flat dot-segment naming (e.g. `_app.clients.$clientId.tsx`, `_app.customer-po.index.tsx`) under the `_app` layout route, one file per URL, dynamic segments as bare `$param`.

### Role and authorization state

The database enum now includes `super_admin` alongside `sales | manager | executive`, with active/inactive account state and real RLS enforcement (Phase 12, locally verified). `src/context/role-context.tsx` still carries a browser-only "Prototype Role" switcher used for pre-Phase-12 demo/UI convenience across the three non-Super-Admin roles — it is not wired to Super Admin and is never the authorization boundary; real role/session state comes from the authenticated Supabase profile. Do not add a browser-only Super Admin flag or treat the prototype role switcher as authorization.

### Accepted Super Admin rules (Phase 12; locally verified, implemented before Phase 11 schema)

- Source of truth: ADR-002, `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`, and its implementation plan.
- Only active Super Admin mutates Team & Role; Manager and Executive see the roster read-only, while Sales does not see it.
- Manager retains company-wide supported business editing. Super Admin also has company-wide supported business access but is not an owner and is excluded from targets/performance.
- Super Admin business corrections preserve `owner_id`; ownership changes use the explicit transfer action to an active Sales or Manager.
- Deactivate by default. Permanent delete only when the server proves zero business/audit references.
- Protect the logged-in Super Admin and the last active Super Admin from deactivation/deletion; never allow zero active Super Admins.
- Activity Log is append-only for all roles. Every admin action requires a reason and logs actor plus a safe target snapshot.
- `manage-team-member` now implements the Super-Admin-only lifecycle contract described above (create/update/role-change/deactivate/reactivate/transfer/delete). `bootstrap_manager_role.sql` is historical and superseded by `bootstrap_super_admin_role.sql` (ADR-002); do not use it to establish the production authority model.

### Data layer and canonical shared modules

`src/lib/data/` and Supabase are the source of truth for business domains.
Task 22 removed `src/lib/mock/` completely on 2026-07-19; see
`.superpowers/sdd/task-22-report.md`.

- `src/lib/domain.ts` — canonical entity, role, and date-range types.
- `src/lib/business-rules.ts` — stage/status constants and pure flow rules.
- `src/lib/app-time.ts` — deterministic prototype business clock.
- `src/lib/data/dashboard-selectors.ts` and `src/lib/report-selectors.ts` —
  pure selectors parameterized on fetched backend arrays.
- `src/lib/preferences-store.ts` — the deliberate local-only, per-device
  preference store; it contains no business targets or team state.
- `src/lib/no-mock-dependencies.test.ts` — prevents mock imports/directory
  from being reintroduced.

When extending business data, follow the three core business flows exactly (PRD §6):

- **Flow A (RFQ/New Product):** Client → RFQ → Quotation → Customer PO → Sales Order → Revenue
- **Flow B (Existing/Repeat Order):** Existing Client → (optional timeplan/price update) → Customer PO → Sales Order → Revenue
- **Flow C (Prototype):** Client → Prototype Request → Prototype Follow-Up → SO Prototype, outcome `Paid` (SO value filled, counts as revenue) or `FOC` (SO value empty, zero revenue contribution)
- Every paid Sales Order also carries a `PPN`/`Non-PPN` tax classification, independent of source flow and prototype payment status.

### Accepted commercial document rules (Phase 11)

- One UI submission creates one document header and all line items atomically.
- Target tables are `public.commercial_documents`, `public.commercial_document_items`, `public.sales_orders`, and `public.sales_order_items`; counters live in non-exposed `private.document_number_counters`.
- Product, Qty, and UOM are required for new RFQ/Quotation/SO items; Description is optional. FOC retains non-monetary items and stores money as `NULL`.
- Revenue is the paid Sales Order item grand total for the form Date. The administrative SO number never determines revenue value or period.
- QUO/SO/NP/PROTY numbers are generated atomically in PostgreSQL per series/year after Sheet-import seeding. Never implement browser-side `max + 1`.
- Quotation revisions use canonical `_REV.n`; only the latest revision enters forecast.
- HARIFF can use normal automatic numbering or audited manual backdate numbering. Backdate consumes no counter and does not move revenue to the embedded number year.
- The seven exact weighted stages are documented in PRD §7. Do not restore the obsolete `RFQ Received`/`Quotation Sent` pipeline as the forecast source.
- The importer now targets normalized headers/items and passes local fixture reconciliation. A real Sheet import remains a separately reviewed manual action; recalculate current maxima at import time.

### Component organization

`src/components/` is organized by domain area (`clients/`, `commercial/`, `dashboard/`, `pipeline/`, `reports/`, `shell/`, `tasks/`) plus `ui/` for shadcn/ui primitives (`components.json`: style `new-york`, base color `slate`, icons via `lucide-react`, path aliases `@/components`, `@/lib`, `@/hooks`, `@/components/ui`). Routes/hooks fetch through `src/lib/data/`; presentation components receive real typed data and use pure selectors.

### Export utilities

`src/lib/export-csv.ts`, `export-xlsx.ts`, `export-pdf.ts`, `export-activity.ts` implement client-side data export (PDF via `jspdf`/`jspdf-autotable`, spreadsheets via `xlsx`). Dashboard exports receive the same backend snapshot used by the visible Dashboard; never add hidden seed/mock fallbacks.

### Error handling

`src/lib/error-capture.ts` / `error-page.ts` and `src/lib/lovable-error-reporting.ts` wire SSR/client error capture into Lovable's error reporting pipeline — see `src/server.ts` for the SSR entry (referenced from `vite.config.ts`'s `tanstackStart.server.entry`).
