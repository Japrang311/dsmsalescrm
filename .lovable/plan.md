
# DSM Sales Execution & Client Revenue Tracking — UI Prototype

A Salesforce-style CRM prototype for a sheet metal fabricator. **UI/UX only, all data mocked** — no backend, auth, DB, or Sheets sync. Enterprise style: navy/blue/teal/gray, dense dashboards, left sidebar, top action bar.

## Scope (all 5 PRD phases in one build)

### App shell
- Left sidebar navigation (role-aware) + top search/action bar + user menu
- **Role selector** in the top bar to switch between Sales / Sales Manager / Top Executive (prototype-only, changes nav + dashboard scope)
- First screen = Dashboard (no landing page)

### Pages
1. **Dashboard** — role-aware
   - Sales: personal YTD/Monthly Achievement vs Target, PPN/Non-PPN, my open tasks, overdue FU, active clients, my commercial items, my quotation pipeline
   - Sales Manager: company + team scope, sales performance comparison, activity compliance, pipeline by stage, waiting PO value, top customers
   - Top Executive (read-only): revenue trend, forecast vs achievement, quotation funnel, top 5 customers, risk alerts (overdue FU, large pending PO, dormant high-value clients)
2. **My Tasks / Team Tasks** — list + filters, overdue/next-FU tabs, task detail drawer with follow-up form (Tanggal FU, Metode FU, Hasil FU, Next action, Tanggal next FU, Status customer, Potensi nilai, Catatan) and quick actions (Mark Done, Schedule Next FU, Create Quotation Task, Move to Waiting PO, Archive)
3. **Clients** — list with filters (status, sales owner, spending YTD, last/next FU, type), status badges (Prospect / Active Customer / Lost / Dormant / Repeat Order)
4. **Client Profile** — header (name, status, owner), KPI row (Spending YTD, Total Revenue, PPN, Non-PPN, Last/Next FU), tabs: Active Commercial Items, Follow-up Timeline, Related RFQ/Quotation/PO/SO
5. **Commercial Pipeline** — Kanban board + table toggle; stages for New RFQ flow and Repeat Order flow; cards show client, owner, amount, stage, next FU, aging
6. **RFQ / Quotation / PO & Sales Order** — dedicated list + detail pages linked from pipeline
7. **Revenue** — table + monthly achievement vs target chart, YTD chart, PPN/Non-PPN breakdown
8. **Reports** (Executive) — revenue trend, quotation funnel, top 5 customers, sales performance comparison, activity compliance
9. **Activity Log** — chronological feed of FU/task activity
10. **Settings** — stub page (targets, users, categories) — visual only

### Navigation
- **Sales / Manager**: Dashboard, My Tasks, Clients, Commercial Pipeline, RFQ, Quotation, PO/Sales Order, Revenue, Activity Log, Reports, Settings
- **Top Executive**: Executive Dashboard, Clients, Revenue, Pipeline, Reports

### Mock data
Realistic Indonesian sheet-metal context: 1 manager + 4 sales, ~25 clients, ~40 commercial items across stages, ~30 tasks (some overdue), revenue rows across 2025–2026 months, monthly targets. Fields shaped like the Google Sheets tabs (DAILY ACTIVITY, QUOTATION, SO 2026, Monthly Target VS Month PO) for clean backend handoff.

## Technical approach

- **Stack**: TanStack Start (existing template), Tailwind v4, shadcn/ui components, Recharts for charts, lucide-react icons
- **Design tokens**: extend `src/styles.css` with navy/blue/teal semantic tokens (light mode only for enterprise CRM feel)
- **Routing**: file-based under `src/routes/` — `index.tsx` (dashboard), `tasks.tsx`, `clients.tsx`, `clients.$id.tsx`, `pipeline.tsx`, `rfq.tsx`, `quotations.tsx`, `orders.tsx`, `revenue.tsx`, `reports.tsx`, `activity.tsx`, `settings.tsx`. Shared app shell in `__root.tsx` layout component
- **Role state**: lightweight Zustand or React context store in `src/lib/role-store.ts`; switching role updates sidebar items + dashboard scope
- **Mock data**: `src/lib/mock/` with typed fixtures (clients, tasks, commercial-items, revenue, targets, users). Field names mirror PRD/Sheets for handoff
- **Components**: `src/components/app/` (Sidebar, TopBar, RoleSwitcher, KpiCard, StatusBadge, StageBadge, PipelineBoard, FollowUpForm, TaskDrawer, RevenueChart, FunnelChart, TargetGauge)
- **Head metadata**: real app title "DSM Sales Execution" + description on each route
- **No backend calls** — everything reads from static mock modules

## Out of scope (per PRD)
Auth, RLS, DB, Sheets sync, real calculations, delete operations (archive-only UI), multi-team/branch hierarchy, lead-hunting modules.

## Deliverable
A clickable, dense, Salesforce-style prototype where a sales rep sees today's priorities in 30 seconds, a manager sees team performance, and an executive sees YTD/monthly achievement — ready for Codex/Claude backend handoff.
