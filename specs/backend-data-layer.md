# Spec: Supabase Backend & Data Layer

> **Current architecture update (2026-07-19):** The normalized commercial schema, four-role authorization model, safe account lifecycle, and full mock-layer removal are implemented and verified locally. ADR-001 and ADR-002 remain the decision sources. Remote migration/import remains separately gated.

## Objective

Replace the mock data layer (`src/lib/mock/`) with a real Supabase Postgres backend, so the DSM Sales app becomes the master database for client, follow-up/task, commercial item, Sales Order, and revenue data — per `PRD.md` §14 (Codex/Claude Handoff Notes) and §15 (Confirmed Implementation Decisions).

**Who:** Sales, Sales Manager, Top Executive, and Super Admin. The code and local database implement all four roles plus the active/inactive account boundary.

**Why:** Client data currently lives scattered across Google Sheets with no single source of truth. Sales reps need a live shared client/pipeline view; managers need real team visibility; executives need accurate revenue/target reporting that isn't manually reconciled.

**Success looks like:** the UI renders from live Supabase queries instead of `src/lib/mock/*`, every write goes through RLS-enforced role scope, commercial headers and line items persist atomically, numbers are allocated by PostgreSQL, and §15 revenue rules are computed from paid line-item totals instead of trusted client totals.

## Tech Stack

- Existing: TanStack Start (React 19), Vite, TypeScript, `@tanstack/react-query`
- New: Supabase (Postgres + Auth + RLS), `@supabase/supabase-js` (add to `package.json` — bunfig.toml's 24h supply-chain guard applies; if this or any dep needs the guard bypassed, confirm with the user before adding to `minimumReleaseAgeExcludes`)
- Migrations managed via the Supabase CLI (`supabase/migrations/`), not ad hoc SQL run by hand
- Local Supabase is initialized as project ID `DSM_SALES_WEB_APP_V2` in `supabase/config.toml`. Local migration verification (`supabase start` / `db reset`) remains the default. The remote project reference must be confirmed before any remote migration; no documentation approval alone authorizes `supabase link`, `db push`, or another remote mutation.
- Google Sheets import: Node/TS script invoked manually (not a scheduled job) using the Sheets API, configurable by spreadsheet ID and sheet/tab name. The real DSM spreadsheet is the source of truth for column mapping and final acceptance verification; running a real import requires credentials and is always an explicit manual operation. CI and automated tests never touch live Sheets — they run against sanitized, deterministic fixtures derived from the real sheet structure (see Testing Strategy).

## Commands

```bash
bun install                          # install deps (adds @supabase/supabase-js)
bunx supabase start                  # local Supabase stack (Postgres, Auth, Studio)
bunx supabase db reset               # rebuild local DB from migrations + seed
bunx supabase migration new <name>   # scaffold a new migration file
bunx supabase db push                # apply local migrations to linked remote project
bun run dev                          # vite dev server (reads Supabase env vars)
bun run build                        # production build
bun run lint                         # eslint .
bun run test                         # backend/RLS test suite (bun:test — see Testing Strategy)
                                      # (plain `bun test` won't see .env.local — Bun skips it in test
                                      # mode by design — so the "test" script wires --env-file explicitly)
```

Env vars (add to `.env.local`, never commit): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Service-role key (for the import script only) stays out of the Vite-bundled env — load it server-side/CLI-only.

## Project Structure

```
supabase/
  migrations/         → SQL migration files (schema, RLS policies), Supabase CLI-managed
  seed.sql            → deterministic local dev seed data
scripts/
  import-sheets.ts    → one-time/manual Google Sheets → Postgres import (service-role key, run via bun, never in the browser bundle)
src/lib/data/         → NEW: real Supabase query/mutation layer, one module per domain
  clients.ts
  commercial-documents.ts → target normalized RFQ/Quotation header+item access
  sales-orders.ts
  tasks.ts
  team.ts
  targets.ts
  activity-log.ts     → added post-Phase 5 (not in the original domain list — see Addendum below)
src/lib/supabase.ts   → NEW: Supabase client singleton (anon key, browser-safe)
src/lib/domain.ts      → shared backend-compatible domain types
src/lib/business-rules.ts → stage/status constants and pure business rules
src/lib/app-time.ts    → deterministic prototype business clock
tests/fixtures/        → sanitized Sheets fixtures and RLS test data; test-only, never imported by production code
```

Domain components and routes consume `src/lib/data/*`; shared non-stateful contracts live in the canonical modules above. `src/lib/mock/` no longer exists.

## Code Style

Match the existing codebase: TypeScript strict mode, no unnecessary abstraction, `@/` path alias, no comments beyond non-obvious WHY (per this repo's `CLAUDE.md`).

Example — a data module returns the canonical domain shape and relies on RLS for scope:

```ts
// src/lib/data/clients.ts
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/domain";

export async function listClients(): Promise<Client[]> {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) throw error;
  return (data ?? []).map(toClient);
}
```

RLS policies live in migration SQL, not application code. The unscoped query above returns only the rows authorized for the current active profile.

## Testing Strategy

The repository uses **`bun:test`** for data adapters, pure selectors, import logic, Edge Function contracts, schema/RLS, and architectural guards:

- **RLS policy tests** (`supabase/tests/` or `scripts/*.test.ts` run against `bunx supabase start`'s local stack, using `tests/fixtures/` seed data): verify a `sales` JWT cannot read/write another sales rep's clients, `executive` JWT is read-only, `manager` JWT sees all team data.
- **Revenue classification unit tests** (`src/lib/data/*.test.ts`): the §15 rules — `SO Prototype FOC` must have null value and excluded from revenue; historical Sheets rows that can't be classified are flagged, never silently included.
- **Import script tests**: golden-file test against `tests/fixtures/` — sanitized, deterministic spreadsheet fixtures derived from the real sheet's column structure (never the live sheet). Asserts correct PPN/Non-PPN and Paid/FOC classification per §15's historical-import rules. CI must never require live Google Sheets credentials or network access.

Production code must never import from `tests/fixtures/`, and must never silently fall back to fixture/mock data if a Supabase call fails — a failed query surfaces as an error, not a stale/fake read.

No permanent E2E framework is required, but the normalization/numbering phase includes a real-browser local Supabase walkthrough because the form, grouping, revision, and numbering behavior changes materially.

## Boundaries

- **Always do:** enforce role scope via RLS (never trust client-supplied role/owner filters as the security boundary); keep the service-role key out of any browser-bundled code; write a migration for every schema change (never hand-edit prod via Studio); flag unclassifiable historical import rows for manual review instead of guessing.
- **Ask first:** any deviation from the `PRD.md` §7 field/object model; adding new npm/bun dependencies (per `bunfig.toml`'s supply-chain guard); Google Sheets API credential setup; changing target/achievement calculation logic beyond what §7/§8 specify; creating, linking, resetting, or migrating any actual Supabase project (local `supabase init` and local migration verification are fine to do directly; anything that touches a real project requires an explicit checkpoint with the project reference provided by the user).
- **Never do:** implement real backend logic inside Lovable-managed UI files without a clear boundary (keep `src/lib/data/` as the seam); auto-change a client's status based on inactivity (§15 explicitly forbids this — system may only _suggest_); allocate official numbers in the browser or with a non-atomic “max + 1” query; allow public sign-up; write a bootstrap script that auto-creates a Supabase Auth user or embeds privileged/default credentials; model Super Admin as a Manager plus a browser-only flag; allow any role to update/delete Activity Log.

### Addendum: normalized documents, numbering, and revenue (accepted 2026-07-18)

- Public target tables: `commercial_documents`, `commercial_document_items`, `sales_orders`, `sales_order_items`.
- Private allocator table: `private.document_number_counters`.
- One form submission creates one header and all items in one PostgreSQL transaction.
- QUO/SO/NP/PROTY counters are independent per Date year and seeded after historical import.
- Quotation revisions use `_REV.n`; only the current revision contributes to forecast.
- Sales Order revenue is the paid line-item grand total for the form Date. The SO number is administrative.
- HARIFF supports normal automatic numbering or an audited manual backdate exception; the number never changes the revenue period.
- FOC items retain Product/Description/Qty/UOM but all money remains `NULL`.
- Legacy task/follow-up/activity references move to document headers; legacy source tables remain read-only until UAT approves deletion.

### Addendum: Super Admin authorization and account lifecycle (accepted 2026-07-18)

ADR-002 and `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md` add the explicit `super_admin` database role. Active Super Admin has company-wide access to supported business operations and exclusive authority over Team & Role mutations. Manager retains company-wide business editing but Team & Role becomes read-only.

`profiles.account_status` is `active` or `inactive`; privileged role resolution and exposed-table RLS require an active profile. Deactivation is the default removal operation, ownership transfer targets only active Sales/Sales Manager, and permanent deletion is restricted to accounts with zero business/audit references. Current-account and last-active-Super-Admin protections are enforced server-side.

Super Admin is excluded from client ownership, targets, pipeline ownership, revenue attribution, and Sales performance. Activity Log remains append-only and records every administrative action with actor, required reason, and a safe target snapshot.

### Auth account bootstrap (one-time, manual)

The first Super Admin account is created **manually by the project owner** through Supabase Auth and promoted with an **idempotent role-assignment step** that accepts the exact Auth user's UUID. The procedure never embeds a default username/password and never exposes public signup. After bootstrap, active Super Admin manages subsequent accounts and roles from the website through the protected server boundary. The older first-Manager bootstrap remains historical evidence only and is superseded by ADR-002.

## Addendum: real `activity_log` table (added post-Phase 5)

Not part of the original domain list (`clients`, `commercial_items`, `sales_orders`, `tasks`, `team_members`/`profiles`, `targets`) above. While wrapping up Phase 5, the Activity Log page (`src/routes/_app.activity.tsx`) turned out to be built entirely on session-store/mock aggregation, with no real table backing it anywhere in the schema — discovered as a gap, not planned for. Given the choice to leave it mock or build it for real, the user chose to build a real table now.

- **Schema:** `activity_log` (migration `20260718011409_activity_log.sql`) — append-only, one row per real mutation event. `owner_id` is denormalized at insert time for business scope. Phase 12 adds active Super Admin company-wide select/insert plus administrative target snapshots, but no update/delete policy for any role. An editable audit trail is not an audit trail.
- **Data layer:** `src/lib/data/activity-log.ts` — `listActivityLog()`, `logActivity()`, `getCurrentActorId()`.
- **Scope boundary:** client, commercial, task, Sales Order, follow-up, and Team & Role mutations write durable audit/follow-up rows through their approved backend paths.
- **UI integration:** Activity Log is built only from RLS-scoped `activity_log` and `follow_up_logs` queries. It does not merge seed arrays or session-store state.
- **Tests:** `supabase/tests/activity-log.test.ts` covers four-role RLS and immutability; `src/lib/data/activity-feed.test.ts` covers persisted event mapping, including `sales_order_created`.

## Success Criteria

- Supabase target schema exists (via migrations) for `clients`, normalized `commercial_documents`/`commercial_document_items`, normalized `sales_orders`/`sales_order_items`, `tasks`, `profiles`, `targets`, and `activity_log`, matching current `PRD.md` §7/§15.
- RLS policies enforce: active Sales sees/edits own business data; active Sales Manager sees/edits company/team business data but cannot mutate Team & Role; active Top Executive is read-only company-wide; active Super Admin can execute supported company-wide operations and exclusively manages Team & Role.
- `src/lib/data/*` modules are consumed throughout the application; `src/lib/mock/` is deleted and an architecture test prevents its reintroduction.
- Revenue/target dashboard numbers are computed from Sales Order item totals using the form Date; Regular paid and Prototype Paid count, Prototype FOC is `NULL`/excluded, and administrative SO-number changes do not alter revenue.
- A working Google Sheets import script exists that classifies historical PPN/Non-PPN and Paid/FOC per §15, flags ambiguous rows, and does not silently include them in revenue.
- `bun test` passes for RLS policy tests and revenue-classification unit tests, using only `tests/fixtures/`, with no live Google Sheets or remote Supabase dependency.
- The one-time first-Super-Admin bootstrap procedure (manual Auth creation + idempotent UUID-targeted promotion) is documented.
- Inactive profiles fail closed in RLS even with an older token, and no role can update/delete Activity Log.
- Local `supabase init` and local migration verification (`supabase start`, `db reset`) are complete and reviewable before any `supabase link` or remote `db push` is proposed.
- (Addendum) Real `activity_log` and `follow_up_logs` tables exist with RLS, approved mutations write them, and Activity Log renders only those persisted rows.

## Open Questions

The live spreadsheet headers have been inspected and mapped. Two external execution gates remain: recalculate number maxima at actual import time from the user-provided export, and confirm the exact remote Supabase target before any non-local migration/import. Neither is an unfinished local implementation task.
