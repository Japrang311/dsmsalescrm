# PRD: DSM Sales Execution & Client Revenue Tracking System

## 1. Purpose

Build a web app UI/UX prototype in Lovable for a sheet metal fabricator sales team. The app is an account-centric sales execution and revenue control workspace: it helps sales manage customer follow-ups, RFQ and quotation work, direct orders from existing clients, prototype orders, Sales Orders, and performance against target.

Lovable is used for UI/UX, screen flow, navigation, and component layout. Codex/Claude owns the real Supabase backend, authentication, permissions, Google Sheets historical import, validation, migrations, and production implementation. The local application is fully migrated to the real backend as of 2026-07-19; remote migration/import remains separately gated.

## 2. Business Context

DSM is a sheet metal fabricator with more than 12 years of operations. Sales activity is rarely driven by canvassing or cold lead hunting. Most clients come from referrals, website inquiries, and business relationships. Around 80% of revenue comes from existing clients.

The app must therefore avoid a generic lead-heavy CRM model and must not imitate Salesforce's prospecting-oriented information architecture. The core problem is controlling follow-up, active commercial work, RFQ, quotation, customer PO, Sales Order, prototype support, and revenue tracking for existing and incoming clients.

Revenue is recognized from the paid Product line items recorded in the single Create Sales Order transaction. The administrative SO number identifies the document but does not create, move, or change revenue. Commercial work reaches Sales Order through two primary paths:

1. RFQ / new product: Client -> RFQ -> Quotation -> Customer PO -> Sales Order -> Revenue.
2. Existing client / direct or repeat order: Existing Client -> Customer PO -> Sales Order -> Revenue.

Prototype work is a supporting commercial path. Every prototype, whether paid or free, must be released as an `SO Prototype`. A paid prototype has priced line items and contributes their total to revenue. A free prototype has Product/Description/Qty/UOM items but no Unit Price or Total, is labeled `FOC`, and contributes zero to revenue achievement.

## 3. Primary Users

### Sales

- Owns assigned clients.
- Performs customer follow-up.
- Updates tasks, follow-up result, next action, and commercial item status.
- Views personal dashboard, target achievement, open tasks, and active commercial items.

### Sales Manager

- Has own clients like a sales user.
- Can view all sales activity because DSM currently has one sales team: 1 manager and 4 sales.
- Can edit team data when needed.
- Views team/company dashboard and sales performance comparison.

### Top Executive

- Uses read-only executive dashboard.
- Monitors company-wide target achievement, revenue, pipeline, activity compliance, top customers, and team performance.

### Super Admin

- Manages team members, account lifecycle, and database-backed roles from Settings.
- Has company-wide access to every supported business-data operation, while Activity Log remains immutable.
- Is a system administrator, not a Sales owner: no assigned clients, targets, pipeline ownership, or Sales performance attribution.
- Preserves the original Sales owner when correcting business data unless an explicit ownership transfer is performed.

## 4. Product Scope

### In Scope For Lovable

- Purpose-built industrial sales operations UI/UX.
- Responsive web app layout.
- Sidebar navigation.
- Role-aware dashboard views.
- Client profile pages.
- Follow-up/task workflow screens.
- Commercial item pipeline screens.
- Revenue cards and charts using realistic mock data.
- Form layouts and interaction states.
- Empty/loading/error mock states.
- UI copy, labels, and status badges.

### Out Of Scope For Lovable

- Real authentication.
- Real role-based access control.
- Database schema implementation.
- Google Sheets import/sync implementation.
- Production APIs.
- Server-side validation.
- Real calculation engine.
- Data migration scripts.
- Multi-team hierarchy.
- Multi-branch organization structure.
- Cold canvassing, campaign, or lead-hunting CRM modules.
- Salesforce branding, trademarks, proprietary terminology, exact screen cloning, or Salesforce-specific information architecture.

## 5. Source Data Grounding

Historical sales data is currently in Google Sheets:

- `DASHBOARD SALES`: executive-style dashboard and charts.
- `DAILY ACTIVITY`: sales activity logs with fields such as date, PIC/sales, activity category, customer, project/RFQ, daily activity, expected output, status, next follow-up date, notes, activity ID, aging days, SLA status, and compliance flag.
- `QUOTATION`: quotation pipeline with quotation number, date, account, description, client, address, quantity, UOM, unit price, total price, status, SO number, and note. The application adds a separate required Product Name.
- `SO 2026`: PPN Sales Order/revenue data with PO number, SO number, customer, sales, project description, quantity, unit price, and total price. The application uses one compact Date (`18 Jul 2026`) instead of separate Month/Week/Year fields and adds Product Name plus a separate UOM.
- `NP 2026`: Non-PPN Sales Orders and the seed source for the `DSM-YYNPnnn` series.
- `PROTY`: Prototype Sales Orders and the seed source for the `DSM-YYPROTYnnn` series.
- `HARIFF`: historical/backdated administrative SO references for PT. HARIFF DAYA TUNGGAL ENGINEERING; imported values are preserved but do not define a new automatic series.
- `Monthly Target VS Month PO`: monthly target and achievement source. This is the source of truth for target cards.
- `HISTORY 2025 ROLLING`: historical customer purchase context.

The web app should use Google Sheet data as historical import/sync source. New FU/task/commercial item activity should be entered in the web app after implementation.

## 6. Core Business Flows

### Flow A: RFQ / New Product Revenue

Client -> RFQ -> Quotation -> Customer PO -> Sales Order -> Revenue

### Flow B: Existing Client / Direct Or Repeat Order Revenue

Existing Client -> asks for timeplan or updated price when needed -> Customer PO -> Sales releases Sales Order -> Revenue

### Flow C: Prototype Support

Client -> Prototype Request -> Prototype Follow-Up -> SO Prototype

Prototype outcome:

- `Paid`: SO value is filled; revenue is counted according to the SO value.
- `FOC`: SO value is left empty; the selling support activity remains visible, but its revenue contribution is treated as zero and revenue achievement is not increased.

Every paid Sales Order must also be classified as `PPN` or `Non-PPN`. This tax classification is separate from the commercial source and prototype payment status.

## 7. Core Objects

### Client

Client is the primary object. The client database is used to record whether a client is active and how much the client has spent during the year.

Client status:

- Prospect, used for incoming, referred, or relationship-based potential clients rather than cold canvassing
- Active Customer
- Lost
- Dormant
- Repeat Order

Client profile should show:

- Client name
- Client status
- Assigned sales owner
- Annual spending YTD
- Revenue PPN
- Revenue Non-PPN
- Total revenue
- Last follow-up date
- Next follow-up date
- Active commercial items
- Follow-up history
- Related quotations, POs, and Sales Orders

### Follow-Up / Task

Every follow-up/task must attach to:

- Client
- Active commercial item when relevant

Minimum update fields:

- Tanggal FU
- Metode FU
- Hasil FU
- Next action
- Tanggal next FU
- Status customer
- Potensi nilai/order
- Catatan

Recommended follow-up result options:

- No Response
- Interested
- Need Quotation
- Quotation Sent
- Negotiation
- Waiting PO
- PO Confirmed
- Not Interested
- Follow-up Later

### Commercial Item

Commercial item represents active business work attached to a client.

Types:

- RFQ
- Quotation
- Direct / Repeat Order Request
- Prototype Request
- PO
- Sales Order

RFQ/Quotation forecast stages and weights:

- Client Request for Quotes — 15%
- Quotes Sent — 30%
- Negotiation — 55%
- Hot Prospect — 75%
- Commit — 90%
- Closed Won — 100%
- Closed Lost — 0%

RFQ defaults to `Client Request for Quotes`. A new Quotation or Quotation revision defaults to `Quotes Sent`. Only the latest Quotation revision contributes to pipeline forecast.

Repeat order stages:

- Timeplan/Price Update Requested
- Waiting Client PO
- PO Received
- Sales Order Released
- Revenue Recorded

Prototype stages:

- Prototype Requested
- Requirement / Feasibility Review
- Prototype in Progress
- SO Prototype Released
- Delivered
- Closed

Prototype commercial status:

- Paid
- FOC

### Sales Order

Every released order, including free prototype support, must have one Sales Order header and one or more Product line items. The user records the header and all items once in one form.

Required classification:

- SO type: Regular or Prototype
- Tax type: PPN or Non-PPN for paid SO
- Prototype payment status: Paid or FOC when SO type is Prototype
- Nomor PO Customer: required
- Date: required; controls the revenue period and is displayed as `18 Jul 2026`
- Nama Product: required per item
- Description / Deskripsi Project: optional per item
- Qty and UOM (`Unit`, `Pcs`, `Set`, `Lot`): required per item
- Unit Price: required for paid items
- Total Price: calculated as Qty × Unit Price and never manually overridden
- SO value/grand total: sum of paid line-item totals; must be empty (`NULL`) for Prototype FOC

An `SO Prototype FOC` is operational evidence of customer support, not revenue.

The SO number is administrative. In normal mode the system generates it atomically from the document Date and classification. For PT. HARIFF DAYA TUNGGAL ENGINEERING, management may instead choose an audited Existing/Backdate mode and record a historical SO number manually. That number does not change the Date or revenue period.

### Revenue

Revenue must support:

- Total revenue
- PPN revenue
- Non-PPN revenue
- Sales owner
- Client
- Commercial source flow: RFQ / New Product, Existing Client / Direct or Repeat Order, or Prototype Paid
- Sales Order reference
- Sales Order type: Regular or Prototype
- Prototype commercial status: Paid or FOC when Sales Order type is Prototype
- Revenue date

Revenue inclusion rule:

- Regular paid SO: sum its paid line-item totals into revenue and target achievement for the form Date.
- Paid SO Prototype: sum its paid line-item totals into revenue and target achievement for the form Date.
- FOC SO Prototype with an empty value: treated as zero contribution and excluded from revenue and target achievement.
- Creating, revising, backdating, or correcting an administrative SO number never changes the recorded revenue amount or period.

## 8. Dashboard Requirements

All roles must see:

- Achievement YTD vs Target YTD
- Monthly Achievement vs Monthly Target
- Total revenue
- PPN vs Non-PPN breakdown
- Revenue source breakdown: RFQ, Existing/Repeat Order, and Prototype Paid
- Prototype summary: Paid value, FOC count, and FOC support activity
- Open follow-up/task count
- Overdue follow-up/task count
- Active quotation/RFQ pipeline
- Waiting PO value
- Sales Order/revenue trend

### Sales Dashboard

Scope: personal data only.

Must show:

- Personal Achievement YTD vs Target YTD
- Personal Monthly Achievement vs Monthly Target
- My open tasks
- My overdue next follow-ups
- My active clients
- My active commercial items
- My quotation pipeline
- My Sales Order/revenue summary

### Sales Manager Dashboard

Scope: company/team-wide plus own client work.

Must show:

- Company Achievement YTD vs Target YTD
- Company Monthly Achievement vs Monthly Target
- Team activity compliance
- Sales performance comparison
- Open/overdue tasks by sales
- Active clients by sales
- Pipeline by stage
- Waiting PO value
- Revenue PPN vs Non-PPN
- Top customers YTD

### Top Executive Dashboard

Scope: company-wide, read-only.

Must show:

- Company Achievement YTD vs Target YTD
- Company Monthly Achievement vs Monthly Target
- Revenue trend by month
- PPN vs Non-PPN breakdown
- Forecast vs achievement
- Quotation funnel
- Open quotation pipeline
- Top 5 customers YTD
- Sales activity summary
- Risk alerts: overdue FU, large pending PO, dormant high-value clients

## 9. Access Control Requirements

Lovable should visually represent these permissions, but not implement real enforcement.

- Sales can create/edit own clients, tasks, follow-ups, and commercial items.
- Sales Manager can view and edit company/team business data when needed, but Team & Role is read-only.
- Top Executive is read-only.
- Super Admin can manage Team & Role, deactivate/reactivate accounts, transfer ownership, and edit all supported business data company-wide.
- Only an active Super Admin can create or assign another Super Admin.
- Super Admin cannot own clients, targets, pipeline, or revenue and is excluded from Sales performance comparisons.
- Activity Log is append-only for every role, including Super Admin.
- Delete should be restricted to supported Super Admin operations or replaced with archive.
- Archive is preferred over hard delete because the data is used for revenue tracking.
- Deactivation is the default account-removal action. Permanent deletion is allowed only for an unused account with no business or audit references.

## 10. Navigation

Recommended sidebar:

- Dashboard
- My Tasks
- Clients
- Commercial Pipeline
- Sales Orders & Revenue
- Activity Log
- Reports
- Settings

For Top Executive, simplify navigation:

- Executive Dashboard
- Clients
- Sales Orders & Revenue
- Commercial Pipeline
- Reports

For Super Admin, retain the full navigation and expose all Settings tabs, including editable `Tim & Role`. Sales Manager and Top Executive can view that roster read-only; Sales does not see the tab.

## 11. Visual Direction

Use a Salesforce-inspired visual theme applied to a purpose-built DSM industrial sales operations workflow. Salesforce is a visual reference only, not the product structure or business-process model.

- Quiet, professional operational interface for repeated daily use.
- Dense but readable dashboard.
- Left sidebar navigation.
- Compact top action and universal search bar.
- KPI cards with clear hierarchy.
- Tables with filters, status badges, and quick actions.
- Pipeline board or stage table for commercial items.
- Salesforce-like visual language: bright white and cloud-gray surfaces, confident blue primary actions, dark navy text, subtle borders, restrained shadows, compact enterprise spacing, and crisp information hierarchy.
- Suggested theme tokens: primary blue `#0176D3`, dark navy `#032D60`, pale blue `#EEF4FF`, border gray `#C9C9C9`, success green `#2E844A`, warning amber `#DD7A01`, and error red `#BA0517`.
- Use the Salesforce visual feel for color, density, forms, tables, tabs, badges, modals, and KPI treatment, but do not reproduce Salesforce screens.
- Do not use Salesforce logos, clouds, trademarks, product names, or its `Lead`, `Campaign`, and `Opportunity` information architecture.
- Client and active commercial context should be more prominent than lead stages.
- Avoid playful marketing landing page.
- First screen should be the app dashboard, not a landing page.

## 12. Success Criteria

The Lovable prototype is successful when:

- A sales user can understand today's follow-up priorities within 30 seconds.
- A sales user can open a client and see status, spending, active items, and FU history.
- A sales user can update a FU/task through a clear form.
- A manager can see team activity, pipeline, overdue tasks, and revenue performance.
- An executive can see achievement YTD vs target YTD and monthly achievement vs monthly target.
- A Super Admin can manage Team & Role in the website, while account protections and immutable audit history remain visible and understandable.
- Revenue cards show both total revenue and PPN/non-PPN breakdown.
- Paid SO Prototype contributes to revenue and achievement.
- FOC SO Prototype remains traceable with an empty SO value, contributes zero revenue, and does not increase achievement.
- UI makes it clear that the system is built around existing clients, inbound/referred opportunities, RFQ, direct/repeat order, prototype support, Sales Order, and revenue, not generic cold lead hunting.
- The experience does not look or behave like a Salesforce clone.
- The prototype can be handed off to Codex/Claude for database/backend implementation without redesigning the core screens.

## 13. Lovable Build Prompts

Use these prompts sequentially. Do not ask Lovable to build backend logic. Use realistic mock data and clear component structure.

The phase summaries below are the current copy-ready Lovable source. If a separate prompt pack is created later, it must be reconciled with this PRD before use.

Every phase must preserve the Salesforce-inspired visual theme defined in Section 11. This theme applies to color, density, spacing, forms, tables, tabs, badges, modals, drawers, and KPI treatment only. It must not replace DSM's navigation, terminology, object model, or business workflows.

### Phase 1 Prompt: App Shell And Role-Based Dashboard

Build a purpose-built web app UI prototype for "DSM Sales Execution & Client Revenue Tracking System", a sheet metal fabrication company sales operations app.

Important: Lovable is only responsible for UI/UX. Use mock data only. Do not implement real backend, auth, database, API, or Google Sheets sync.

Create the app shell:

- Left sidebar navigation.
- Top search/action bar.
- Role selector for prototype mode: Sales, Sales Manager, Top Executive, Super Admin.
- Dashboard as the first screen, not a landing page.
- Apply a Salesforce-inspired visual theme: bright enterprise surfaces, confident blue actions, dark navy text, compact spacing, subtle gray borders, restrained shadows, crisp tables, and clear status badges.
- Salesforce is a visual reference only. Do not copy Salesforce branding, logos, page composition, terminology, or lead-centric workflows.
- Keep DSM's own information architecture: Client, FU/Task, RFQ, Quotation, Customer PO, Sales Order, Prototype, and Revenue.

Dashboard requirements:

- All roles must show cards for Achievement YTD vs Target YTD and Monthly Achievement vs Monthly Target.
- Show total revenue plus PPN vs Non-PPN breakdown and revenue source breakdown.
- Show prototype summary: Prototype Paid value, Prototype FOC count, and support activity.
- Show open tasks, overdue follow-ups, active commercial items, and pipeline summary.
- Sales role shows personal scope.
- Sales Manager shows company/team-wide scope for 1 manager and 4 sales.
- Top Executive shows read-only company-wide executive dashboard.
- Super Admin shows company-wide system-administration scope, including Settings → Tim & Role, but is not shown as a Sales owner or performance participant.

Use realistic Indonesian business labels where helpful: Target YTD, Achievement YTD, Monthly Target, Monthly Achievement, PPN, Non-PPN, Follow Up, RFQ, Quotation, Customer PO, Sales Order, SO Prototype, Paid, and FOC.

### Phase 2 Prompt: Client List And Client Profile

Continue the existing DSM Sales Execution prototype. Add client management UI.

Keep all data mocked. Do not build backend or database.

Preserve the Salesforce-inspired visual theme from Phase 1 while using only DSM terminology and workflows. Do not add Lead, Campaign, or Salesforce Opportunity concepts.

Create:

- Clients list page with filters by status, sales owner, spending YTD, last FU, next FU, and client type.
- Client status badges: Prospect, Active Customer, Lost, Dormant, Repeat Order.
- Client profile page.

Client profile must show:

- Client name and status.
- Assigned sales owner.
- Spending YTD.
- Total revenue.
- PPN revenue.
- Non-PPN revenue.
- Last FU and next FU.
- Active commercial items.
- Follow-up history timeline.
- Related RFQ, Quotation, PO, and Sales Order records.
- Related prototype requests and SO Prototype records, clearly labeled Paid or FOC.

The client page must make it clear that DSM's system is not lead-hunting first. It is mainly for tracking existing, referred, web-inquiry, and relationship-based clients, along with their activity, commercial items, prototypes, Sales Orders, and revenue.

### Phase 3 Prompt: Follow-Up And Task Workflow

Continue the DSM Sales Execution prototype. Add the main sales workflow: customer FU and task update.

Keep mock data only. Do not implement backend.

Preserve the Salesforce-inspired visual theme from Phase 1 while using only DSM terminology and workflows. Do not add Lead, Campaign, or Salesforce Opportunity concepts.

Create:

- My Tasks page.
- Team Tasks page for Sales Manager.
- Task detail drawer or page.
- Follow-up update form.
- Overdue and next-follow-up states.

Every task/follow-up must attach to:

- Client.
- Active commercial item when relevant.

Follow-up form fields:

- Tanggal FU.
- Metode FU.
- Hasil FU.
- Next action.
- Tanggal next FU.
- Status customer.
- Potensi nilai/order.
- Catatan.

Suggested result options:

- No Response.
- Interested.
- Need Quotation.
- Quotation Sent.
- Negotiation.
- Waiting PO.
- PO Confirmed.
- Not Interested.
- Follow-up Later.

Use quick actions such as Mark Done, Schedule Next FU, Create Quotation Task, Move to Waiting PO, and Archive.

Also provide `Create Prototype Task` for prototype requests and keep the task attached to the client and prototype commercial item.

### Phase 4 Prompt: Commercial Pipeline For RFQ, Existing Orders, Prototype, And Sales Order

Continue the DSM Sales Execution prototype. Add commercial item pipeline screens.

Keep mock data only. Do not implement backend.

Preserve the Salesforce-inspired visual theme from Phase 1. The commercial pipeline must use DSM stages and must not be translated into Salesforce Opportunity stages.

Create:

- Commercial Pipeline page.
- RFQ list/detail.
- Quotation list/detail.
- Direct / Repeat Order list/detail.
- Prototype Request list/detail.
- Customer PO / Sales Order list/detail.
- Stage view and table view toggle.

Business flows:

New RFQ flow:
Client -> RFQ -> Quotation -> PO -> Sales Order -> Revenue

Repeat order flow:
Client asks for timeplan or updated price -> Client PO -> Sales releases Sales Order -> Revenue

Prototype flow:
Client -> Prototype Request -> Prototype Follow-Up -> SO Prototype -> Delivered

Weighted stages for RFQ/Quotation pipeline:

- Client Request for Quotes — 15%.
- Quotes Sent — 30%.
- Negotiation — 55%.
- Hot Prospect — 75%.
- Commit — 90%.
- Closed Won — 100%.
- Closed Lost — 0%.

These exact labels and weights are the current forecast source of truth. They supersede the earlier mock-only RFQ stage list.

Stages for Repeat Order:

- Timeplan/Price Update Requested.
- Waiting Client PO.
- PO Received.
- Sales Order Released.
- Revenue Recorded.

Stages for Prototype:

- Prototype Requested.
- Requirement / Feasibility Review.
- Prototype in Progress.
- SO Prototype Released.
- Delivered.
- Closed.

Prototype rules:

- Every prototype must have an SO Prototype record.
- Paid prototype: show SO value and include it in revenue.
- FOC prototype: show a prominent FOC badge, leave SO value empty, treat its revenue contribution as zero, and exclude it from revenue achievement.
- Keep the Prototype type and Paid/FOC status separate from PPN/Non-PPN classification.

Each commercial item should show client, sales owner, amount, current stage, next FU date, aging, probability/status, and linked tasks.

### Phase 5 Prompt: Revenue And Executive Reports

Continue the DSM Sales Execution prototype. Add revenue and reporting screens.

Keep mock data only. Do not implement backend.

Preserve the Salesforce-inspired visual theme from Phase 1. Use compact enterprise reporting patterns without copying Salesforce reports or dashboard layouts.

Create:

- Revenue page.
- Executive Reports page.
- PPN vs Non-PPN breakdown.
- Revenue source breakdown: RFQ / New Product, Existing Client / Direct or Repeat Order, and Prototype Paid.
- Prototype report showing Paid value, FOC count, and FOC support activity without adding FOC to revenue.
- Monthly achievement vs target chart.
- YTD achievement vs target chart.
- Revenue trend by month.
- Quotation funnel.
- Open quotation pipeline.
- Top 5 customers YTD.
- Sales performance comparison.
- Activity compliance summary.

Historical source context:

- Google Sheets has tabs like DAILY ACTIVITY, QUOTATION, SO 2026, Monthly Target VS Month PO, DASHBOARD SALES, and HISTORY 2025 ROLLING.
- The app will eventually import/sync historical data from Google Sheets.
- New activity should be entered in the web app after backend implementation.

Make the UI ready for handoff to Codex/Claude by using clear component names, consistent field labels, and realistic mock data shaped like the source sheets.

## 14. Codex/Claude Handoff Notes

After Lovable UI is approved, Codex/Claude should handle:

- Supabase PostgreSQL data model design and implementation.
- Supabase Auth with admin-created accounts and no public sign-up.
- Database-backed roles and role permission enforcement.
- Google Sheets import/sync.
- Target and achievement calculation.
- PPN/non-PPN revenue classification.
- Revenue source and Sales Order type classification.
- SO Prototype Paid/FOC validation, conditional SO value rules, and revenue inclusion rules.
- Client lifecycle calculation.
- Task/FU SLA and aging calculation.
- APIs and validation.
- Real dashboard query logic.
- Test strategy.

Implementation should start from the minimum viable production workflow:

1. User roles and access.
2. Client database.
3. FU/task workflow.
4. Commercial item workflow.
5. Revenue and target dashboard.
6. Google Sheet historical import/sync.

## 15. Confirmed Implementation Decisions

These decisions were confirmed during product discovery and must be treated as implementation requirements:

### Data Ownership And Historical Import

- Client data is currently distributed across Google Sheets; there is no official CRM database yet.
- The web app becomes the master database for client, FU/task, commercial item, Sales Order reference, and revenue tracking data.
- Google Sheets is used as a historical import source, not as the primary database after implementation.
- Imported records keep their historical `PPN` or `Non-PPN` classification from the source sheet.
- Historical records labeled `SO Prototype` with a filled amount are classified as `Paid`.
- Historical records labeled `SO Prototype` with an empty amount are classified as `FOC` and contribute zero to revenue achievement.
- Any historical record that cannot be classified reliably must be flagged for manual review and must not silently enter revenue totals.

### Backend And Authentication

- The production database is Supabase PostgreSQL.
- Authentication uses Supabase Auth.
- User accounts are created by Super Admin after the first controlled manual bootstrap; public sign-up is not available.
- Roles are stored in the database: `Sales`, `Sales Manager`, `Top Executive`, and `Super Admin`.
- Database permissions and application queries must enforce the role scope defined in Section 9.
- Lovable remains responsible only for UI/UX and mock interactions; it must not implement the production backend, authentication, permission, or import logic.

### Team, Role, And Account Lifecycle

- `Super Admin` is an explicit database role, not a Manager plus a client-side flag.
- Only an active Super Admin can create accounts, edit profiles/roles, deactivate/reactivate accounts, transfer ownership, and permanently delete an eligible unused account.
- Sales Manager and Top Executive can view `Tim & Role` read-only; Sales cannot access it.
- The first Super Admin is assigned manually using an idempotent, UUID-targeted bootstrap against the exact approved Supabase project. No default credential or public elevation path is permitted.
- An inactive profile fails closed at the RLS boundary even if an older Auth token still exists, and the application signs the session out with an unavailable-account message.
- The logged-in Super Admin cannot deactivate or delete their own account, and the last active Super Admin cannot be deactivated, deleted, or demoted.
- Before deactivating an account that owns active work, Super Admin transfers ownership to an active Sales or Sales Manager. Super Admin and Top Executive are not valid destinations.
- All administrative changes require a reason and create append-only Activity Log events with actor and safe target snapshots.
- Super Admin business edits preserve the existing owner unless the explicit ownership-transfer operation is used.
- Full authorization and lifecycle rules are defined in ADR-002 and the accepted Super Admin design specification.

### Sales Order And Tax Classification

- Sales selects `PPN` or `Non-PPN` when creating a Sales Order.
- Sales Manager can correct the tax classification when needed.
- The web app generates Quotation and normal Sales Order numbers atomically in PostgreSQL; users do not type or predict the next automatic number.
- Quotation format is `DSM-YYQUO-nnnn`. Revisions retain the base number and append `_REV.1`, `_REV.2`, and so on. Previous versions remain immutable history, are marked superseded, and do not double-count forecast.
- Sales Order formats are `DSM-YYSOnnn` for PPN, `DSM-YYNPnnn` for Non-PPN, and `DSM-YYPROTYnnn` for Prototype. Each series has an independent counter per Date year and resets to 1 in a new year.
- Historical import seeds each counter from the maximum unique valid number in its own Sheet tab/year. It does not use row count, fill gaps, or share the Quotation counter with NP/PROTY.
- PT. HARIFF DAYA TUNGGAL ENGINEERING can use `SO Baru — Nomor Otomatis` or `SO Existing / Backdate — Nomor Manual`. Backdate requires a reason, duplicate validation, badge, and activity-log entry; it consumes no automatic counter.
- Revenue is the sum of paid Product line items recorded in Create SO and belongs to the form Date. The administrative SO number, including a HARIFF backdated number, does not determine revenue timing.
- `SO Prototype FOC` records Product, optional Description, Qty, and UOM; Unit Price, line totals, and grand total remain `NULL` and are always excluded from revenue and target achievement.

### Document Header And Line Items

- The user records each RFQ, Quotation, or Sales Order once in one form.
- Internally, PostgreSQL stores one document header plus one or more line-item rows. This prevents repeated header data and allows unique document-number enforcement.
- Target tables are `public.commercial_documents`, `public.commercial_document_items`, `public.sales_orders`, and `public.sales_order_items`.
- Atomic counter state lives in non-exposed `private.document_number_counters`.
- Product Name is required for new items but remains nullable during legacy migration; historical Description must not be copied into Product Name as a guess.
- Existing task, follow-up, and activity-log references must be migrated from legacy item-row IDs to document-header IDs without losing history.
- Legacy source tables are retained read-only in a non-exposed schema until UAT/count reconciliation is approved; deletion requires a separate destructive decision.

### Forecast Pipeline

- Forecast uses the seven exact stages and weights listed in Section 7.
- Forecast equals the current Quotation version's line-item total multiplied by its stage weight.
- `Closed Won` contributes 100%; `Closed Lost` contributes 0%.
- A historical stage outside the approved map displays `Belum tersedia`; it must not silently receive a zero weight.

### Client Status Governance

- Client status is selected manually by Sales.
- Sales Manager can correct client status when needed.
- The system may recommend a status or show alerts such as `Potential Dormant`, but it must not automatically change the official client status.
- Inactivity or lack of recent transactions alone is not sufficient to classify a client as Dormant or Lost.
