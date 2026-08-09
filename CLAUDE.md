# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DSM Sales Execution & Client Revenue Tracking System — a TanStack Start (React 19) front-end built in Lovable with a real local Supabase Postgres backend. Phase 12 (explicit Super Admin authorization/account lifecycle) and Phase 11 (normalized RFQ/Quotation/Sales Order headers/items, importer, atomic numbering, revisions, forms, and grouped views) are locally verified complete as of 2026-07-19. As of 2026-07-25, RFQ is retired as an active app feature; Quotation is the first active commercial document in the new-product flow. See ADR-003, `specs/remove-rfq.md`, and `HANDOFF.md` before restoring anything named RFQ. The Phase 11 import's 55-entry review backlog was fully resolved and re-imported later the same day (586 headers, ≈Rp131.024.482.393 paid total, local-only) — see `.superpowers/sdd/p11-review-decisions-report.md` and `HANDOFF.md`. Read ADR-001, ADR-002, ADR-003, accepted specs, and implementation plans before touching roles, RLS, Settings, auth, or commercial schema. `tasks/plan.md` and `tasks/todo.md` define historical status and sequencing. The app is live in production, not just prototyped: Vercel project `dsmsalescrm` auto-deploys every push to `main` (`dsmsalescrm.vercel.app`), backed by the remote Supabase project `qhtfixgbcpcitokeryxb` — see the Supabase note below before assuming anything is local-only.

- **The user is not a programmer and is building this solo.** Explain jargon in plain terms as it comes up; favor explicit checkpoints over silently making judgment calls on anything irreversible (schema changes, deleting mock data, touching a real Supabase project).
- Local Supabase project ID is `DSM_SALES_WEB_APP_V2` (the `config.toml` `project_id` for the local Docker stack) — a separate environment from the **remote/production** Supabase project `qhtfixgbcpcitokeryxb` (dashboard name "dsmsalescrm", region ap-northeast-1, Free Plan), which is what the live Vercel deployment actually talks to. Never run `supabase link`, `supabase db push`, `apply_migration`, or another non-local mutation without explicit approval naming the target project. As of 2026-07-30, all local migrations are confirmed applied and in sync on `qhtfixgbcpcitokeryxb` (verified live via the Supabase MCP's `list_migrations`) — this includes the RFQ-retirement migrations `20260725151142` and `20260725152241`, which are no longer remote-pending. Two security-hardening migrations were added and applied to production the same day: `20260730120000_revoke_anon_execute_on_privileged_rpcs` (closed `anon`-callable `SECURITY DEFINER` RPCs `reassign_client_owner`/`task_control_loop_metrics`) and `20260730121500_pin_normalized_client_name_search_path`. Known accepted risks, deliberately left as-is — don't re-flag these without new information: `public.client_search_index` is an intentional `SECURITY DEFINER` view (cross-owner client picker, exposes only `id`/`name`/`owner_id`); Leaked Password Protection is off (needs Supabase Pro Plan, project is on Free); several foreign keys are unindexed (all tables under ~500 rows, no measurable impact yet).
- **RLS is the real access-control boundary**, not app code. Migrations now implement `sales`/`manager`/`executive`/`super_admin` plus active-profile fail-closed checks across every exposed table (Phase 12, locally verified, and reconfirmed against the live remote policies on 2026-07-30 — see `HANDOFF.md`). Role-based UI filtering is never the security boundary.
- This repo is connected to **Lovable**: don't rewrite published git history (force-push, rebase/amend/squash already-pushed commits) — it desyncs the Lovable editor and can lose the user's project history (`AGENTS.md`). This is a real git repo tracked on GitHub (`Japrang311/dsmsalescrm`, branch `main`) with Vercel auto-deploy on push — an older note here claiming "no `.git` yet" was stale and has been removed.

## Commands

Package manager is **bun** (`bun.lock`, `bunfig.toml`).

```bash
bun run test          # bun:test — RLS policy tests + data-layer tests, against the LOCAL Supabase stack only

bunx supabase start    # start local Supabase (Postgres+Auth+Studio, needs Docker Desktop running)
bunx supabase db reset # rebuild local DB from supabase/migrations/ + supabase/seed.sql
bunx supabase stop     # stop local Supabase
```

Note: `bun test` (bare, no `run`) will fail with a missing-env-var error — Bun intentionally skips `.env.local` in test mode. Always use `bun run test`, which passes `--env-file=.env.local` explicitly.

The repository uses `bun:test`; `bun run test` loads `.env.local` and includes RLS/data-layer/import tests against local Supabase where applicable.

`vite.config.ts` is the canonical manual Vite/TanStack Start wiring for this repo. It directly configures `tanstackStart`, `nitro`, `@vitejs/plugin-react`, `tailwindcss`, `vite-tsconfig-paths`, the `@` path alias, and React/TanStack dedupe. There is no `@lovable.dev/vite-tanstack-config` dependency in `package.json`; do not assume Lovable owns this config indirectly.

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

When extending business data, follow the current core business flows (PRD §6):

- **Flow A (New Product):** Client → Quotation → Customer PO → Sales Order → Revenue
- **Flow B (Existing/Repeat Order):** Existing Client → (optional timeplan/price update) → Customer PO → Sales Order → Revenue
- **Flow C (Prototype):** Client → Prototype Request → Prototype Follow-Up → SO Prototype, outcome `Paid` (SO value filled, counts as revenue) or `FOC` (SO value empty, zero revenue contribution)
- Every paid Sales Order also carries a `PPN`/`Non-PPN` tax classification, independent of source flow and prototype payment status.

### Accepted commercial document rules (Phase 11)

- One UI submission creates one document header and all line items atomically.
- Target tables are `public.commercial_documents`, `public.commercial_document_items`, `public.sales_orders`, and `public.sales_order_items`; counters live in non-exposed `private.document_number_counters`.
- Product, Qty, and UOM are required for new Quotation/SO items; Description is optional. FOC retains non-monetary items and stores money as `NULL`.
- Revenue is the paid Sales Order item grand total for the form Date. The administrative SO number never determines revenue value or period.
- QUO/SO/NP/PROTY numbers are generated atomically in PostgreSQL per series/year after Sheet-import seeding. Never implement browser-side `max + 1`.
- Quotation revisions use canonical `_REV.n`; only the latest revision enters forecast.
- HARIFF can use normal automatic numbering or audited manual backdate numbering. Backdate consumes no counter and does not move revenue to the embedded number year.
- Quotation stages start at `Quotes Sent`. Do not restore RFQ stages, `Client Request for Quotes`, obsolete `RFQ Received`/`Quotation Sent` labels, RFQ routes, RFQ quick-create, or RFQ search/dropdown options.
- The importer now targets normalized headers/items and passes local fixture reconciliation. A real Sheet import remains a separately reviewed manual action; recalculate current maxima at import time.

### Component organization

`src/components/` is organized by domain area (`clients/`, `commercial/`, `dashboard/`, `pipeline/`, `reports/`, `shell/`, `tasks/`) plus `ui/` for shadcn/ui primitives. Routes/hooks fetch through `src/lib/data/`; presentation components receive real typed data and use pure selectors.

### Export utilities

Dashboard exports receive the same backend snapshot used by the visible Dashboard; never add hidden seed/mock fallbacks.

### Error handling

`src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/server-monitoring.ts`, and `src/lib/browser-monitoring.ts` wire SSR/client error capture. Sentry is env-gated: set `SENTRY_DSN` for server monitoring and `VITE_SENTRY_DSN` for browser monitoring; without those DSNs the app keeps its local error-page fallback only. See `src/server.ts` for the SSR entry (referenced from `vite.config.ts`'s `tanstackStart.server.entry`).
