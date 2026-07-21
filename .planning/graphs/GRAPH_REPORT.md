# Graph Report - DSM SALES WEB APP V2 (2026-07-20)

## Corpus Check

- 281 files · ~211,588 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary

- 2409 nodes · 4847 edges · 231 communities (132 shown, 99 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 107 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness

- Built from commit: `2301a893`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)

- PDF Export & Dashboard Data
- Organization Settings & Routes
- Sheet Import Scripts
- Edge Functions - Team Members
- Client Management Dialogs
- Client Table & Data Grid
- Dialog Forms & Follow-ups
- UI Components - Carousel
- Route Tree & Navigation
- Shell Layout & Quick Create
- Dashboard Executive Cards
- Superpowers & SDD Planning
- Commercial Detail Views
- TypeScript Config & References
- Client Picker & Pipeline Drawer
- Test Fixtures & Mock Data
- App Sidebar Navigation
- Architecture Docs & ADRs
- Report Filters & UI Alerts
- Status Audit Trail & Dashboard
- Commercial Routes & Lib
- Pipeline & Client Status UI
- UI Component Library
- Database Migrations
- Tailwind Config & Aliases
- React Context & State
- Routes & Data Layer
- Shared UI Components
- Data Access Layer
- Supabase Tests
- Superpowers Scripts
- Route Definitions
- Supabase Test Suite
- Client UI Components
- Route Handlers & Lib
- Library Utilities
- Bun Runtime Tests
- Data Lib Functions
- Package Dependencies
- Shared Components
- Client Data Functions
- Activity Log Functions
- Server & Startup
- SDD Phase Scripts
- Dev Dependencies & ESLint
- Test Fixtures
- UI Feature Components
- Commercial Components
- Migration Scripts
- SDD Phase Docs
- SDD Phase 2 Scripts
- SDD Phase 3 Scripts
- Data Hooks
- Commercial Data Lib
- SDD Phase 4 Scripts
- NPM Scripts
- Follow-up Components
- Report Components
- Dashboard Charts
- Pipeline UI Components
- Route & Shell Components
- Migration 20260714
- SDD Phase 5 Scripts
- Migration 20260715
- Migration 20260716
- Supabase Unit Tests
- Package Config
- Client Detail Components
- Edge Function Tests
- Migration Tests
- Activity Log Data
- Commercial Data
- SDD Phase 6 Docs
- Document Normalization
- Deactivation Logic
- Revenue & Roles
- Client Routes
- Commercial Routes
- Pipeline Routes
- Dashboard Routes
- Report Routes
- Migration 20260717
- Migration 20260718
- Migration 20260719a
- SDD Phase 7 Docs
- MCP Configuration
- clsx Utility
- cmdk Command Palette
- Activity Logging
- Hariff Integration
- Atomic Operations
- Quotation Flow
- Vertical Architecture
- date-fns Utility
- Embla Carousel
- ESLint Config
- ESLint JS Rules
- ESLint TS Rules
- ESLint Plugin
- React Hook Form
- Lucide Icons
- MCP Server
- Nitro Server
- Radix UI - Accordion
- Radix UI - AlertDialog
- Radix UI - AspectRatio
- Radix UI - Checkbox
- Radix UI - Collapsible
- Radix UI - ContextMenu
- Radix UI - Dialog
- Radix UI - DropdownMenu
- Radix UI - Label
- Radix UI - Menubar
- Radix UI - NavigationMenu
- Radix UI - Popover
- Radix UI - Progress
- Radix UI - RadioGroup
- Radix UI - ScrollArea
- Radix UI - Select
- Radix UI - Separator
- Radix UI - Slider
- Radix UI - Switch
- Radix UI - Tabs
- Radix UI - Toast
- Radix UI - Toggle
- Radix UI - ToggleGroup
- Radix UI - Tooltip
- Radix UI - Slot
- React Day Picker
- React DOM
- React Hook Form Dev
- React Resizable
- Recharts
- Supabase Client
- Tailwind Merge
- Tailwind CSS
- Tailwind Vite Plugin
- TanStack Query
- TanStack Table
- TanStack Router
- TW Animate
- Vaul Drawer
- Vite TSConfig
- XLSX Spreadsheet
- Zod Validation
- Prettier
- Bun Types
- Node Types
- React Types
- TypeScript
- TS ESLint
- Vite
- Vite Plugin
- Route Pages
- Migration 20260719c
- Migration 20260719d
- Migration 20260719e
- Migration 20260719f
- Migration 20260719g
- Migration 20260719h
- Migration 20260719i
- Migration 20260719j
- Migration 20260719l
- SDD Phase 8 Docs
- Lovable Agent Config
- Concept - CN
- Concept - Prototype
- Concept - Weighted
- Graphify Output
- Migration 20260719r
- Super Admin Team and Role Management Implementation Plan
- Task 5 Implementation Report
- Task 3 Implementation Report
- Task 3 Independent Review
- Task 2 Implementation Report
- Task 2 Independent Review
- Google Sheets Import: Normalized Document Mapping
- Task 1 Implementation Report
- ADR-002: Explicit Super Admin Authorization and Safe Account Lifecycle
- Handoff — DSM Sales Web App V2
- DateRangePicker.tsx
- Task 1 Independent Review
- Spec: Supabase Backend & Data Layer
- Steps
- Phase 11 Task 1 Brief: Normalized Schema Contract
- Architecture
- Phase 11 Import Closeout Evidence
- Commercial Documents and Atomic Numbering Implementation Plan
- Phase 11 Task 8 Report: Local Verification and Review
- Steps
- export-activity.ts
- What this session did
- Phase 11 Task 1 Report: Normalize commercial-document schema
- Task 6 Report: session, role-aware navigation, ownership, targets, reporting
- form.tsx
- Steps
- chart.tsx
- Phase 11 Import Review — Decisions and Structural Fixes
- Task 4 Fix Wave 1 Re-review
- Phase 11 Next-Session Handoff
- Task 22 Completion Report — Remove Production Mock Layer
- Steps
- org-settings.test.ts
- Subagent-Driven Development Progress
- Q: Mengapa cn() menjadi jembatan lintas 27 komunitas, dan apakah itu menunjukkan coupling arsitektural atau hanya pola styling bersama?
- Q: Continue HARIFF import task
- Task 6 Independent Review
- Google Sheets import fixtures
- 20260720000000_add_sales_order_edit_support.sql
- scroll-area.tsx
- Routes
- globals

## God Nodes (most connected - your core abstractions)

1. `cn()` - 103 edges
2. `Task List: Supabase Backend & Data Layer` - 59 edges
3. `formatRupiahShort()` - 57 edges
4. `useRole()` - 42 edges
5. `useDashboardData()` - 40 edges
6. `formatDateShort()` - 32 edges
7. `Button` - 30 edges
8. `deleteRoleFixtureUsers()` - 28 edges
9. `Task List` - 27 edges
10. `FileRoutesByPath` - 26 edges

## Surprising Connections (you probably didn't know these)

- `groupImportRows()` --indirect_call--> `document()` [INFERRED]
  scripts/import-sheets/classify.ts → src/lib/data/commercial-grouping.test.ts
- `parseSheetCsv()` --indirect_call--> `record()` [INFERRED]
  scripts/import-sheets/parse.ts → src/lib/error-capture.ts
- `PipelineAnalytics()` --indirect_call--> `ownerId()` [INFERRED]
  src/components/pipeline/PipelineAnalytics.tsx → supabase/tests/account-lifecycle.test.ts
- `Google Sheets import fixtures README` --references--> `Google Sheets Import: Normalized Document Mapping` [EXTRACTED]
  tests/fixtures/sheets-import/README.md → scripts/import-sheets-mapping.md
- `Bun mock.module() cross-file test isolation issue` --semantically_similar_to--> `public.admin_count_active_commercial_items RPC` [INFERRED] [semantically similar]
  .superpowers/sdd/task-6-report.md → .superpowers/sdd/task-5-report.md

## Import Cycles

- None detected.

## Hyperedges (group relationships)

- **Normalized Commercial Document Schema (Tables + Enums)** — table_commercial_documents, table_commercial_document_items, table_sales_orders_new, table_sales_order_items, enum_uom_type, enum_document_number_mode [EXTRACTED 1.00]
- **Task 1 Brief-Report-Review TDD Review Cycle** — \_superpowers_sdd_p11_task_1_brief, \_superpowers_sdd_p11_task_1_report, \_superpowers_sdd_p11_task_1_review [EXTRACTED 1.00]
- **Phase 11 As-Built Migration Set** — migration_normalize_commercial_documents, migration_migrate_commercial_document_data, migration_add_atomic_document_numbering, migration_add_normalized_sheet_import, migration_harden_normalized_document_permissions [EXTRACTED 1.00]
- **RLS authorization boundary evolution across Tasks 1-4** — \_superpowers_sdd_task_1_report_account_status_guard_migration, \_superpowers_sdd_task_2_report_rls_matrix_migration, \_superpowers_sdd_task_2_report_harden_rls_matrix_migration, \_superpowers_sdd_task_4_report_owner_invariant_migration [INFERRED 0.85]
- **Active-owner ownership integrity enforcement chain** — \_superpowers_sdd_task_2_report_is_active_business_owner_function, \_superpowers_sdd_task_4_report_owner_invariant_migration, \_superpowers_sdd_task_4_report_transfer_active_ownership_function, \_superpowers_sdd_task_6_report_list_sales_team_profiles [INFERRED 0.85]
- **Session/role scoping across app layers (Task 6)** — \_superpowers_sdd_task_6_report_account_status_ts, \_superpowers_sdd_task_6_report_role_context_tsx, \_superpowers_sdd_task_6_report_selectors_ts, \_superpowers_sdd_task_6_report_topbar_tsx, \_superpowers_sdd_task_6_report_appsidebar_tsx [EXTRACTED 1.00]
- **ADR-001 lifecycle: decision → spec → plan → verification → documentation reconciliation** — docs_decisions_adr_001_normalized_commercial_documents_and_numbering_md, docs_superpowers_specs_2026_07_18_commercial_product_fields_and_sheet_alignment_design_md, docs_superpowers_plans_2026_07_18_commercial_documents_numbering_implementation_md, tasks_plan_md_implementation_plan, tests_fixtures_sheets_import_readme_md_fixture_readme [EXTRACTED 0.95]
- **ADR-002 lifecycle: decision → design spec → implementation plan → verification → handoff** — docs_decisions_adr_002_super_admin_authorization_and_account_lifecycle_md, docs_superpowers_specs_2026_07_18_super_admin_team_role_management_design_md, docs_superpowers_plans_2026_07_18_super_admin_team_role_management_implementation_md, docs_auth_bootstrap_md_auth_bootstrap, superpowers_sdd_task_7_report_md_task_7_report, superpowers_sdd_task_7_review_md_task_7_review, handoff_md_handoff_context [EXTRACTED 0.95]
- **Core commercial document design concepts: normalization, numbering, forecast, and revenue rules** — concept_document_header_item_normalization, concept_independent_yearly_number_counters, concept_weighted_pipeline_stages, concept_prototype_foc_null_money, concept_quotation_revision_canonical_suffix, concept_hariff_numbering_mode, rationale_revenue_from_paid_line_items_not_so_number, rationale_one_form_atomic_create [EXTRACTED 0.95]

## Communities (231 total, 99 thin omitted)

### Community 0 - "PDF Export & Dashboard Data"

Cohesion: 0.12
Nodes (40): RFC-4180, jspdf, jspdf, DashboardExportContext, dashboardExportFollowUps(), dashboardExportMonthlyTrend(), dashboardExportSalesPerformance(), dashboardExportTopCustomers() (+32 more)

### Community 1 - "Organization Settings & Routes"

Cohesion: 0.05
Nodes (55): CardDescription, TabsContent, TabsList, TabsTrigger, OrgSettings, listTargets(), upsertYearlyTarget(), AccountStatus (+47 more)

### Community 2 - "Sheet Import Scripts"

Cohesion: 0.06
Nodes (57): APPROVED_CLIENT_ALIASES, APPROVED_SALES_ALIASES, buildClientNameLookup(), buildNameLookup(), ClassifiedSheetRow, classifyRow(), CounterSeed, deriveCounterSeeds() (+49 more)

### Community 3 - "Edge Functions - Team Members"

Cohesion: 0.07
Nodes (47): declaredLength(), readBoundedRequestBody(), requestTooLarge(), AdminAction, AdminHttpError, APP_ROLES, AppRole, DATABASE_ERRORS (+39 more)

### Community 4 - "Client Management Dialogs"

Cohesion: 0.08
Nodes (40): FormValues, schema, FollowUpValues, METHODS, RESULTS, schema, ClientPickerField(), emptyLineItem (+32 more)

### Community 5 - "Client Table & Data Grid"

Cohesion: 0.10
Nodes (23): Th(), RiskDot(), Breadcrumb, BreadcrumbEllipsis(), BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage (+15 more)

### Community 6 - "Dialog Forms & Follow-ups"

Cohesion: 0.11
Nodes (22): ToggleGroup, ToggleGroupContext, ToggleGroupItem, agingDays(), Bucket, BUCKET_META, bucketFor(), CalendarView() (+14 more)

### Community 7 - "UI Components - Carousel"

Cohesion: 0.15
Nodes (12): Carousel, CarouselApi, CarouselContent, CarouselContext, CarouselContextProps, CarouselItem, CarouselNext, CarouselOptions (+4 more)

### Community 8 - "Route Tree & Navigation"

Cohesion: 0.06
Nodes (38): getRouter(), AppActivityRoute, AppClientsClientIdRoute, AppClientsIndexRoute, AppClientsRoute, AppClientsRouteChildren, AppClientsRouteWithChildren, AppCustomerPoIdRoute (+30 more)

### Community 9 - "Shell Layout & Quick Create"

Cohesion: 0.08
Nodes (30): Density, SortKey, GlobalSearch(), NotificationsMenu(), QuickCreateKind, QuickCreateItem, Command, CommandEmpty (+22 more)

### Community 10 - "Dashboard Executive Cards"

Cohesion: 0.14
Nodes (28): ActivityComplianceCard(), ForecastVsAchievementCard(), RevenueTrendChart(), SimpleBarChart(), SalesPerformanceTable(), ComparisonTooltip(), MonthlyAchievementVsTargetChart(), SingleSalesTargetChart() (+20 more)

### Community 11 - "Superpowers & SDD Planning"

Cohesion: 0.23
Nodes (12): Phase 11 Task 2 Brief: Convert Legacy Rows and Repoint History, Archive-Over-Delete Convention (No DELETE Policy), backdate*reason Required Iff number_mode = Hariff Backdate, Legacy Evidence Preservation (private.legacy*\* tables), Migration: 20260719041351_harden_normalized_document_permissions.sql, Migration: 20260719024024_migrate_commercial_document_data.sql, Migration: 20260719014036_normalize_commercial_documents.sql, public.commercial_document_items table (+4 more)

### Community 12 - "Commercial Detail Views"

Cohesion: 0.12
Nodes (31): formatWhen(), StatusAuditTrail(), DocumentItemsTable(), CommercialViewFilter, CommercialViewsProps, ViewMode, QuotationFunnelCard(), TopCustomersCard() (+23 more)

### Community 13 - "TypeScript Config & References"

Cohesion: 0.06
Nodes (30): DOM, DOM.Iterable, ES2022, eslint.config.js, src/**/\*.ts, src/**/_.tsx, supabase/functions/**, supabase/**/_.ts (+22 more)

### Community 14 - "Client Picker & Pipeline Drawer"

Cohesion: 0.14
Nodes (17): RISK_STYLES, STATUS_STYLES, StatusBadge(), CLIENT_STATUSES, ClientRow, createClient(), getClientById(), OwnerLookup (+9 more)

### Community 15 - "Test Fixtures & Mock Data"

Cohesion: 0.24
Nodes (13): activityIds, ADMINISTRATIVE_LABELS, db, authenticateSales(), db, supabase, ADMINISTRATIVE_KINDS, adminClient (+5 more)

### Community 16 - "App Sidebar Navigation"

Cohesion: 0.09
Nodes (27): COMMERCIAL_ITEMS_NAV, NAV_EXECUTIVE, NAV_FULL, Sidebar, SidebarContent, SidebarContext, SidebarContextProps, SidebarFooter (+19 more)

### Community 17 - "Architecture Docs & ADRs"

Cohesion: 0.12
Nodes (15): Four-role authorization model (sales, manager, executive, super_admin), Phase 12 role/RLS foundation must precede Phase 11 commercial schema, Auth Bootstrap: Creating the First Super Admin, Ongoing account creation, Preconditions, Safety rules, Step 1 — Create the Auth user manually, Step 2 — Copy and verify the Auth UUID (+7 more)

### Community 18 - "Report Filters & UI Alerts"

Cohesion: 0.12
Nodes (23): RiskAlertsCard(), defaultReportFilters(), Props, ReportFilterBar(), ReportFilters, Alert, AlertDescription, AlertTitle (+15 more)

### Community 19 - "Status Audit Trail & Dashboard"

Cohesion: 0.04
Nodes (56): Phase 0: Local Environment Setup, Phase 11: Commercial Documents, Sheet Alignment, and Atomic Numbering, Phase 12: Super Admin, Team & Role, and Account Lifecycle, Phase 1: Identity Foundation, Phase 2: Clients Vertical Slice, Phase 3: Tasks / Follow-Ups Vertical Slice, Phase 4: Commercial Items Vertical Slice, Phase 5: Sales Orders & Revenue Vertical Slice (+48 more)

### Community 20 - "Commercial Routes & Lib"

Cohesion: 0.19
Nodes (33): AddClientDialog(), ClientsTable(), CommercialDetailPage(), CommercialViews(), TodaysFollowUpList(), PipelineCardDrawer(), TopBar(), TaskDetailDrawer() (+25 more)

### Community 21 - "Pipeline & Client Status UI"

Cohesion: 0.10
Nodes (26): CLIENT_STATUSES, FIELD_LABEL, Props, STAGES, METHODS, PRIORITIES, STATUSES, SelectContent (+18 more)

### Community 22 - "UI Component Library"

Cohesion: 0.04
Nodes (45): 10. Navigation, 11. Visual Direction, 12. Success Criteria, 13. Lovable Build Prompts, 14. Codex/Claude Handoff Notes, 15. Confirmed Implementation Decisions, 1. Purpose, 2. Business Context (+37 more)

### Community 23 - "Database Migrations"

Cohesion: 0.17
Nodes (18): commercial_documents_enforce_active_owner, private.account_ownership_counts(), private.account_reference_counts(), private.commercial_document_migration_review, private.commercial_item_id_map, private.commercial_items, private.migrate_commercial_document_data(), private.sales_order_id_map (+10 more)

### Community 24 - "Tailwind Config & Aliases"

Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 25 - "React Context & State"

Cohesion: 0.16
Nodes (17): DevRole, loadRealSession(), ROLE_LOGIN, RoleContext, RoleContextValue, RoleProvider(), SEED_EMAILS, signInForRole() (+9 more)

### Community 26 - "Routes & Data Layer"

Cohesion: 0.13
Nodes (13): PROTOTYPE_STAGES, REPEAT_STAGES, RFQ_STAGES, stagesForFlow(), PrototypeStage, RepeatStage, RfqStage, SourceFlow (+5 more)

### Community 27 - "Shared UI Components"

Cohesion: 0.12
Nodes (11): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarShortcut() (+3 more)

### Community 28 - "Data Access Layer"

Cohesion: 0.16
Nodes (21): AddFollowUpDialog(), LogCommercialFollowUpDialog(), CreateTaskDialog(), FormValues, METHODS, PRIORITIES, schema, startOfDay() (+13 more)

### Community 29 - "Supabase Tests"

Cohesion: 0.13
Nodes (11): fixtures(), cleanupFixtures(), CleanupRow, cleanupRows, collectCleanupFailures(), companyWritableTables, FixtureRows, getRows() (+3 more)

### Community 30 - "Superpowers Scripts"

Cohesion: 0.13
Nodes (16): activity-feed.test.ts, dashboard-export-data.test.ts, src/lib/mock/ removal, no-mock-dependencies.test.ts regression guard, Inactive-session handling requirement, Super Admin excluded from owner/target/performance collections, Role union widened to include super_admin (brief), src/lib/auth/account-status.ts (+8 more)

### Community 31 - "Route Definitions"

Cohesion: 0.12
Nodes (14): Route, Route, Route, Route, Route, Route, Route, Route (+6 more)

### Community 32 - "Supabase Test Suite"

Cohesion: 0.16
Nodes (9): createAuthOnlyUser(), createDisposableProfile(), CreatedRows, deleteDisposableAuth(), disposableAuthIds, ReferenceCounts, removeInjectedFailureTriggers(), runLocalSql() (+1 more)

### Community 33 - "Client UI Components"

Cohesion: 0.17
Nodes (13): buildSalesOrderSchema(), lineItemSchema, optionalPrice, paidLineItemsSchema, prototypeRequestSchema, PrototypeRequestValues, quotationSchema, QuotationValues (+5 more)

### Community 34 - "Route Handlers & Lib"

Cohesion: 0.16
Nodes (9): Toaster(), ToasterProps, LovableErrorOptions, LovableEvents, reportLovableError(), Window, ErrorComponent(), Route (+1 more)

### Community 35 - "Library Utilities"

Cohesion: 0.06
Nodes (55): useClientResolution(), CreatePrototypeDialog(), CreateQuotationDialog(), CreateRfqDialog(), CreateSalesOrderDialog(), errorMessage(), msg(), ReviseQuotationDialog() (+47 more)

### Community 36 - "Bun Runtime Tests"

Cohesion: 0.11
Nodes (13): bun, db, EXPECTED_TABLES, ExpectedColumn, ExpectedTable, Row, cleanupCommercialFixture(), db (+5 more)

### Community 37 - "Data Lib Functions"

Cohesion: 0.13
Nodes (35): dashboardExportMetrics(), activeCommercialCount(), DASHBOARD_SALES_EXCLUDE, DASHBOARD_SALES_INCLUDE_MANAGERS, dashboardSalesTeam(), inRange(), monthlyRevenueTrendInRange(), paidRevenue() (+27 more)

### Community 39 - "Package Dependencies"

Cohesion: 0.15
Nodes (13): class-variance-authority, input-otp, jspdf-autotable, dependencies, class-variance-authority, input-otp, jspdf-autotable, @radix-ui/react-context-menu (+5 more)

### Community 40 - "Shared Components"

Cohesion: 0.27
Nodes (10): ChangeStatusDialog(), Props, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter(), AlertDialogHeader() (+2 more)

### Community 41 - "Client Data Functions"

Cohesion: 0.11
Nodes (21): buildActivityFeed(), BuildActivityFeedInput, COMMERCIAL_ROUTE, commercialLink(), FeedEvent, FeedLink, ACTIVITY_KIND_LABELS, ActivityKind (+13 more)

### Community 42 - "Activity Log Functions"

Cohesion: 0.06
Nodes (31): Acceptance Criteria, Authoritative Business Decisions, Automatic Numbering Rules, Commercial Documents, Product Fields, and Automatic Numbering Design, Database Identity, Documentation Consistency, Existing Data and Foreign-Key Migration, Form Design (+23 more)

### Community 43 - "Server & Startup"

Cohesion: 0.30
Nodes (8): consumeLastCapturedError(), renderErrorPage(), fetch(), getServerEntry(), isH3SwallowedErrorBody(), normalizeCatastrophicSsrResponse(), ServerEntry, errorMiddleware

### Community 44 - "SDD Phase Scripts"

Cohesion: 0.20
Nodes (11): public.admin_count_active_commercial_items RPC, Bounded per-profile paginated commercial count (Fix Wave 2), commercial-count-rpc.test.ts, fix_commercial_count_predicate.sql migration, src/routes/\_app.settings.tsx Team tab, src/lib/data/team.ts (TeamMember, TeamAdminError), Important finding: roster query failure rendered as empty roster, Important finding: offset pagination can skip/double-count rows (+3 more)

### Community 45 - "Dev Dependencies & ESLint"

Cohesion: 0.18
Nodes (11): eslint-config-prettier, eslint-plugin-prettier, eslint-plugin-react-hooks, @lovable.dev/vite-tanstack-config, devDependencies, eslint-config-prettier, eslint-plugin-prettier, eslint-plugin-react-hooks (+3 more)

### Community 46 - "Test Fixtures"

Cohesion: 0.29
Nodes (6): API_URL, RoleFixtureCreationOptions, RoleFixtureUser, fixtureDefinitions, ROLE_FIXTURES, RoleFixture

### Community 47 - "UI Feature Components"

Cohesion: 0.07
Nodes (26): ADR-001: Normalize Commercial Documents and Generate Numbers Atomically, Alternatives Considered, Consequences, Context, Continue a special automatic `DSM-22SO` HARIFF series, Date, Decision, Generate numbers in the browser (+18 more)

### Community 48 - "Commercial Components"

Cohesion: 0.20
Nodes (9): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut(), ContextMenuSubContent (+1 more)

### Community 49 - "Migration Scripts"

Cohesion: 0.20
Nodes (9): public.activity_log, public.clients, public.commercial_items, public.follow_up_logs, public.org_settings, public.profiles, public.sales_orders, public.targets (+1 more)

### Community 50 - "SDD Phase Docs"

Cohesion: 0.25
Nodes (9): add_account_status_and_active_role_guard.sql migration, public.current_user_role() function, profiles SELECT RLS policy (active-aware), add_super_admin_role.sql migration, Critical finding: unenforced local-only test boundary, Important finding: missing authorization contract tests, Column-level UPDATE grants excluding owner_id, apply_super_admin_rls_matrix.sql migration (+1 more)

### Community 51 - "SDD Phase 2 Scripts"

Cohesion: 0.22
Nodes (9): Activity Log actor_id = auth.uid() binding, harden_super_admin_rls_matrix.sql migration, private.is_active_business_owner(uuid) predicate, btree indexes on owner_id (6 tables), Important finding: Activity Log actor_id forgeable, Important finding: privileged INSERT allows invalid owner destinations, Minor finding: RLS ownership predicates lack supporting indexes, enforce_active_business_owner_invariant.sql migration (+1 more)

### Community 52 - "SDD Phase 3 Scripts"

Cohesion: 0.25
Nodes (9): add_account_lifecycle_functions.sql migration, private.account_reference_counts(uuid) function, manage-team-member/body-reader.ts (bounded streaming read), manage-team-member/contracts.ts (pure parser), manage-team-member/handler.ts (pure orchestration), manage-team-member Edge Function, private.transfer_active_ownership(...) function, Important finding: 16KiB limit enforced only after full buffering (+1 more)

### Community 53 - "Data Hooks"

Cohesion: 0.07
Nodes (27): Account Lifecycle, Activity Log, Business-Data Authority, Confirmed Intent, Current State and Conflict, Database/RLS, Database Role and Account State, Deactivate — default removal action (+19 more)

### Community 54 - "Commercial Data Lib"

Cohesion: 0.22
Nodes (7): databaseResults, fromCalls, invoke, QueryCall, QueryResult, RpcCall, rpcCalls

### Community 55 - "SDD Phase 4 Scripts"

Cohesion: 0.29
Nodes (8): src/lib/data/activity-log.ts mapper, src/routes/\_app.activity.tsx, src/lib/data/activity-search.ts helper, target_profile_snapshot safe-key allowlist constraint, add_team_admin_activity_kinds.sql migration, add_team_admin_audit_fields.sql migration, Minor finding: authenticated-column privilege lacks direct regression test, Important finding: admin event labels omitted from search haystack

### Community 56 - "NPM Scripts"

Cohesion: 0.25
Nodes (8): scripts, build, build:dev, dev, format, lint, preview, test

### Community 57 - "Follow-up Components"

Cohesion: 0.31
Nodes (8): ALL_STAGES, Item, KpiTile(), LOST_STAGES, pct(), PipelineAnalytics(), WON_STAGES, ownerId()

### Community 58 - "Report Components"

Cohesion: 0.07
Nodes (27): 1. Commercial ownership count still does not match the Task 4 transfer predicate, 1. Offset pagination can skip or double-count rows while ownership data changes, 1. Ownership counts and latest administrative changes are silently truncated at 1,000 rows, 2. A roster query failure is rendered as an empty roster, 2. JavaScript `trim()` does not exactly mirror PostgreSQL `btrim(stage)`, 3. Empty filtered results have no explicit table state, 3. The focused pagination test does not cover its failure/termination boundaries, Confirmed compliant (+19 more)

### Community 59 - "Dashboard Charts"

Cohesion: 0.25
Nodes (6): DrawerContent, DrawerDescription, DrawerFooter(), DrawerHeader(), DrawerOverlay, DrawerTitle

### Community 60 - "Pipeline UI Components"

Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 61 - "Route & Shell Components"

Cohesion: 0.25
Nodes (5): AppSidebar(), SidebarInset, SidebarProvider, TooltipContent, Route

### Community 62 - "Migration 20260714"

Cohesion: 0.29
Nodes (6): clients_enforce_active_owner, commercial_items_enforce_active_owner, follow_up_logs_enforce_active_owner, sales_orders_enforce_active_owner, targets_enforce_active_sales, tasks_enforce_active_owner

### Community 63 - "SDD Phase 5 Scripts"

Cohesion: 0.33
Nodes (6): bootstrap-local-super-admin.ts script, Failure-atomic fixture rollback (AggregateError), requireLocalSupabaseUrl() fail-closed guard, Important finding: fixture setup not failure-atomic, Important finding: login-capable seed not technically local-only, Important finding: business-fixture cleanup silently ignores failures

### Community 64 - "Migration 20260715"

Cohesion: 0.53
Nodes (5): private.document_number_counters, public.commercial_document_items, public.commercial_documents, public.sales_order_items, public.sales_orders_new

### Community 67 - "Package Config"

Cohesion: 0.40
Nodes (4): name, private, sideEffects, type

### Community 68 - "Client Detail Components"

Cohesion: 0.07
Nodes (18): AccordionContent, AccordionItem, AccordionTrigger, Avatar, AvatarFallback, AvatarImage, HoverCardContent, InputOTP (+10 more)

### Community 69 - "Edge Function Tests"

Cohesion: 0.07
Nodes (27): Checkpoint 0: Local Supabase running, Checkpoint 10: Mock store fully replaced (or explicitly, permanently kept for a documented reason), Checkpoint 11: Normalized commercial workflow verified locally, Checkpoint 12: Super Admin lifecycle verified locally, Checkpoint 1: Roles exist and are enforced locally, Checkpoint 2: Clients feature fully live on local Supabase, Checkpoint 3: Tasks feature fully live, Checkpoint 4: Commercial Pipeline fully live (+19 more)

### Community 70 - "Migration Tests"

Cohesion: 0.50
Nodes (3): reactivateProfile(), withFixtureCleanup(), withProfileReactivation()

### Community 73 - "SDD Phase 6 Docs"

Cohesion: 0.67
Nodes (3): HANDOFF.md, p11-import-closeout-report.md, Phase 11 Import (local reconciliation)

### Community 74 - "Document Normalization"

Cohesion: 0.67
Nodes (3): Document header + line items normalization for commercial documents, Rationale: Normalize commercial documents into header+items for unique numbering and revisions, Rationale: One form submission creates one header and all items atomically in PostgreSQL

### Community 75 - "Deactivation Logic"

Cohesion: 0.67
Nodes (3): Account lifecycle: deactivate by default, transfer ownership, restricted permanent delete, Rationale: Deactivation is the default account-removal action to preserve history, Rationale: Last active Super Admin protected from deactivation/deletion/demotion to maintain authority

### Community 76 - "Revenue & Roles"

Cohesion: 0.67
Nodes (3): Three core business flows: RFQ/New Product, Existing/Repeat Order, Prototype, Rationale: Avoid Salesforce cloning; DSM is a purpose-built industrial sales system for existing clients, Rationale: Revenue equals paid line-item totals for the form Date; SO number is administrative

### Community 98 - "ESLint JS Rules"

Cohesion: 0.08
Nodes (23): CLAUDE.md - Project Guidance for Claude Code, Browser automation notes (not application bugs, but worth recording), Files touched, Fix, Last-active-admin reachability, One-line summary, Post-report fix: account-lifecycle.test.ts ambient Super Admin count, Root cause (+15 more)

### Community 183 - "Migration 20260719r"

Cohesion: 0.08
Nodes (24): Concerns, Database implementation, Edge contract and handler, Edge implementation, Exact files changed or created, Five-axis self-review, Fix Wave 1 — Task 4 gate findings, Fresh verification evidence (+16 more)

### Community 188 - "Super Admin Team and Role Management Implementation Plan"

Cohesion: 0.09
Nodes (20): File Structure, Global Constraints, Plan Self-Review, Super Admin Team and Role Management Implementation Plan, Task 1: Add the explicit role, account state, and active-profile security boundary, Task 2: Audit every exposed table and enforce the four-role matrix, Task 3: Extend immutable Activity Log for administrative events, Task 4: Build transactional lifecycle primitives and protected server actions (+12 more)

### Community 189 - "Task 5 Implementation Report"

Cohesion: 0.09
Nodes (22): Concerns / deferred verification, Final status, Fix, Fix, Fix Wave 1 — bounded roster summaries and honest empty/error states, Fix Wave 2 — normalized paginated commercial ownership count, Fix Wave 3 — correct RPC authorization for browser-callable functions, Fixes (+14 more)

### Community 190 - "Task 3 Implementation Report"

Cohesion: 0.11
Nodes (18): Concerns, Data/display mapper RED, Database contract RED, Exact files changed or created, Five-axis self-review, Fix wave 1, Four-role snapshot hardening RED, Fresh RED/GREEN evidence (+10 more)

### Community 191 - "Task 3 Independent Review"

Cohesion: 0.11
Nodes (18): 1. Administrative event labels are omitted from the search haystack, 1. The authenticated-column privilege boundary lacks a direct regression test, Approval gate, Critical findings, Evidence assessment, Final approval gate, Finding resolution, Fix wave 1 re-review (+10 more)

### Community 192 - "Task 2 Implementation Report"

Cohesion: 0.11
Nodes (17): Concerns, Concerns, Exact files changed or created, Files changed in this wave, Fix wave 1, Fresh GREEN and regression evidence, Fresh RED evidence, GREEN evidence (+9 more)

### Community 193 - "Task 2 Independent Review"

Cohesion: 0.11
Nodes (17): Acceptance gate, Confirmed compliant elements, Critical, Findings, Important — Activity Log rows are append-only but forgeable, Important — Business-fixture cleanup silently ignores failures, Important — Privileged INSERT/target policies allow non-Sales and inactive owners, Important — The tests do not prove the complete four-role operation matrix (+9 more)

### Community 194 - "Google Sheets Import: Normalized Document Mapping"

Cohesion: 0.12
Nodes (16): Query: Continue HARIFF import task, Approved historical client aliases, As-built status, Counter seeding after successful import, Google Sheets Import: Normalized Document Mapping, HARIFF rules, Header → `public.commercial_documents`, Import shape: group headers, preserve items (+8 more)

### Community 195 - "Task 1 Implementation Report"

Cohesion: 0.12
Nodes (16): Concerns, Concerns, Exact files changed or created, Exact files changed or created, Fix wave 1, GREEN and verification evidence, GREEN evidence, Implementation (+8 more)

### Community 196 - "ADR-002: Explicit Super Admin Authorization and Safe Account Lifecycle"

Cohesion: 0.12
Nodes (15): ADR-002: Explicit Super Admin Authorization and Safe Account Lifecycle, Alternatives Considered, Build arbitrary custom permissions, Consequences, Context, Date, Decision, Give Super Admin unconditional database bypass (+7 more)

### Community 197 - "Handoff — DSM Sales Web App V2"

Cohesion: 0.12
Nodes (15): 1. Ran the app locally, 2. Fixed "Quick Create" dropdown — was fully non-functional, 3. Built multi-item Qty/Unit Price line items for RFQ, Quotation, Sales Order, Commercial documents and numbering (Phase 11 — locally verified complete), Handoff — DSM Sales Web App V2, Historical deferrals from the earlier implementation pass, Latest accepted direction — supersedes older deferred notes below, Production mock-layer removal (Task 22 — locally verified complete) (+7 more)

### Community 198 - "DateRangePicker.tsx"

Cohesion: 0.16
Nodes (14): react, react, DateRangePicker(), PeriodRange, PRESETS, Props, buttonVariants, Calendar() (+6 more)

### Community 199 - "Task 1 Independent Review"

Cohesion: 0.12
Nodes (15): Acceptance gate, Confirmed compliant elements, Critical — The test helper does not enforce the binding local-only boundary, Findings, Important — Fixture setup is not failure-atomic and cleanup is not robust, Important — Tests do not prove two explicit authorization contracts, Important — The login-capable Super Admin seed is conventionally local, not technically local-only, Re-review after Fix wave 1 (+7 more)

### Community 200 - "Spec: Supabase Backend & Data Layer"

Cohesion: 0.13
Nodes (14): Addendum: normalized documents, numbering, and revenue (accepted 2026-07-18), Addendum: real `activity_log` table (added post-Phase 5), Addendum: Super Admin authorization and account lifecycle (accepted 2026-07-18), Auth account bootstrap (one-time, manual), Boundaries, Code Style, Commands, Objective (+6 more)

### Community 201 - "Steps"

Cohesion: 0.13
Nodes (14): Context from Task 1 (already complete, independently reviewed, and locally verified), Files, Global Constraints (from plan, binding for this task), Interfaces, Phase 11 Task 2 Brief: Convert legacy rows and repoint history safely, Step 1: Write failing reconciliation tests, Step 2: Run RED, Step 3: Generate the data migration (+6 more)

### Community 202 - "Phase 11 Task 1 Brief: Normalized Schema Contract"

Cohesion: 0.20
Nodes (13): Phase 11 Task 1 Brief: Normalized Schema Contract, Phase 11 Task 1 Report: Normalize Commercial-Document Schema, Four-Role Fail-Closed RLS Pattern (sales/manager/executive/super_admin), (select ...) Wrapping RLS Performance Pattern, public.document_number_mode enum (Auto|Imported|Hariff Backdate), public.uom_type enum (Unit|Pcs|Set|Lot), public.current_user_role() function, Assessment (+5 more)

### Community 203 - "Architecture"

Cohesion: 0.15
Nodes (11): Accepted commercial document rules (Phase 11), Accepted Super Admin rules (Phase 12; locally verified, implemented before Phase 11 schema), Architecture, Commands, Component organization, Data layer and canonical shared modules, Error handling, Export utilities (+3 more)

### Community 204 - "Phase 11 Import Closeout Evidence"

Cohesion: 0.17
Nodes (12): Explicit Client Alias Approval (No Fuzzy Matching), Counter Seeding Reserves Historical Numbers, Single-PO Forward-Fill Continuation Pattern, Whole-Document Quarantine Rule, Closeout corrections, Fresh verification, HARIFF evidence, Phase 11 Import Closeout Evidence (+4 more)

### Community 205 - "Commercial Documents and Atomic Numbering Implementation Plan"

Cohesion: 0.15
Nodes (12): Commercial Documents and Atomic Numbering Implementation Plan, File Structure, Global Constraints, Plan Self-Review, Task 1: Lock the normalized schema contract, then create header/item tables, Task 2: Convert legacy rows and repoint history safely, Task 3: Implement atomic allocation, document transactions, and revisions, Task 4: Rebuild fixtures/importer and seed counters from reconciled maxima (+4 more)

### Community 206 - "Phase 11 Task 8 Report: Local Verification and Review"

Cohesion: 0.15
Nodes (12): Migration: 20260719033236_add_atomic_document_numbering.sql, Migration: 20260719034313_add_normalized_sheet_import.sql, As-built migrations, Automated evidence, Browser UAT evidence, Cleanup proof, Five-axis review, Fixed during review (+4 more)

### Community 207 - "Steps"

Cohesion: 0.15
Nodes (12): Files, Global Constraints (from plan, binding for this task), Interfaces, Phase 11 Task 1 Brief: Lock the normalized schema contract, then create header/item tables, Step 1: Write a failing schema contract test, Step 2: Run the contract and observe RED, Step 3: Generate the migration filename through the CLI, Step 4: Implement the schema in the generated migration (+4 more)

### Community 208 - "export-activity.ts"

Cohesion: 0.24
Nodes (11): ActivityExportEvent, ActivityExportMeta, BRAND, csvCell(), download(), exportActivityCsv(), exportActivityPdf(), fmtDateTime() (+3 more)

### Community 209 - "What this session did"

Cohesion: 0.17
Nodes (11): 1. Dashboard crash fix, 2. Global search + notifications (previously fully decorative), 3. Sales Order editing (previously fully read-only except tax type), 4. Mock/demo data cleanup, 5. Sales Performance dashboard composition (owner decision), 6. Product Name / Description data correction (owner decision), Checkpoint (end of session), Files touched this session (+3 more)

### Community 210 - "Phase 11 Task 1 Report: Normalize commercial-document schema"

Cohesion: 0.17
Nodes (11): Concerns / open questions for review, Confirmation, Design decisions beyond the brief's literal SQL (documented, not hidden), Files touched, Migration filename, Phase 11 Task 1 Report: Normalize commercial-document schema, Plain-language table map, RLS (+3 more)

### Community 211 - "Task 6 Report: session, role-aware navigation, ownership, targets, reporting"

Cohesion: 0.17
Nodes (11): Cross-file test isolation issue found and fixed, Files changed, Open questions / follow-ups for the user, Pre-existing failures (not introduced by this task, not fixed), Status: DONE, Summary, Task 6 Report: session, role-aware navigation, ownership, targets, reporting, TDD RED → GREEN for `account-status.ts` (+3 more)

### Community 212 - "form.tsx"

Cohesion: 0.18
Nodes (9): FormControl, FormDescription, FormFieldContext, FormFieldContextValue, FormItem, FormItemContext, FormItemContextValue, FormLabel (+1 more)

### Community 213 - "Steps"

Cohesion: 0.18
Nodes (10): Files, Global Constraints (from plan, binding for this task), Interfaces, Step 1: Write failing session and exclusion tests, Step 2: Extend role types without adding a Super Admin seed switcher option, Step 3: Implement inactive-session handling, Step 4: Update application capabilities, Step 5: Verify focused behavior (+2 more)

### Community 214 - "chart.tsx"

Cohesion: 0.20
Nodes (7): ChartConfig, ChartContainer, ChartContext, ChartContextProps, ChartLegendContent, ChartTooltipContent, THEMES

### Community 215 - "Phase 11 Import Review — Decisions and Structural Fixes"

Cohesion: 0.22
Nodes (8): Checkpoint verification (end of session), Decisions (55 of 55, all resolved), Files touched this session, Phase 11 Import Review — Decisions and Structural Fixes, Remaining gates (unchanged from Task 33), Result, Structural bugs found and fixed (not just data decisions), What this session did

### Community 216 - "Task 4 Fix Wave 1 Re-review"

Cohesion: 0.22
Nodes (8): Fixture and reset assessment, Gate summary, Gate summary, Important findings, Minor findings, Resolution of the three Important findings, Task 4 Fix Wave 1 Re-review, Task 4 Gate Review

### Community 217 - "Phase 11 Next-Session Handoff"

Cohesion: 0.25
Nodes (7): Current Truth, Evidence Files, Next Task, Phase 11 Next-Session Handoff, Prompt For The Next Session, Review Backlog Snapshot, Safe Startup

### Community 218 - "Task 22 Completion Report — Remove Production Mock Layer"

Cohesion: 0.25
Nodes (7): External Gates Still Open, Outcome, Regression Guards, Repository Note, Task 22 Completion Report — Remove Production Mock Layer, Tracker Reconciliation, Verification

### Community 219 - "Steps"

Cohesion: 0.25
Nodes (8): Step 1: Create and inspect the bootstrap helper, Step 2: Rehearse bootstrap only with disposable local users, Step 3: Run the full automated gate, Step 4: Browser-verify the four-role matrix, Step 5: Browser/database-verify lifecycle protections, Step 6: Clean QA data safely, Step 7: Reconcile documentation, Steps

### Community 220 - "org-settings.test.ts"

Cohesion: 0.52
Nodes (5): getOrgSettings(), OrgSettingsRow, toOrgSettings(), updateOrgSettings(), OrgTab()

### Community 221 - "Subagent-Driven Development Progress"

Cohesion: 0.33
Nodes (5): Phase 11: Commercial Documents & Numbering, Phase 12: Super Admin Team & Role Management, Plan 1: `docs/superpowers/plans/2026-07-18-super-admin-team-role-management-implementation.md` (Phase 12) — COMPLETE 2026-07-19, Plan 2: `docs/superpowers/plans/2026-07-18-commercial-documents-numbering-implementation.md` (Phase 11) — COMPLETE 2026-07-19, Subagent-Driven Development Progress

### Community 222 - "Q: Mengapa cn() menjadi jembatan lintas 27 komunitas, dan apakah itu menunjukkan coupling arsitektural atau hanya pola styling bersama?"

Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Mengapa cn() menjadi jembatan lintas 27 komunitas, dan apakah itu menunjukkan coupling arsitektural atau hanya pola styling bersama?, Source Nodes

### Community 223 - "Q: Continue HARIFF import task"

Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Continue HARIFF import task, Source Nodes

### Community 224 - "Task 6 Independent Review"

Cohesion: 0.40
Nodes (4): Confirmed compliant, Noted, not graded, Review method, Task 6 Independent Review

### Community 225 - "Google Sheets import fixtures"

Cohesion: 0.40
Nodes (4): Google Sheets import fixtures, Safety, Target fixture behavior, Verified fixture inventory

### Community 226 - "20260720000000_add_sales_order_edit_support.sql"

Cohesion: 0.67
Nodes (3): private.recompute_sales_order_total(), public.client_search_index, sales_order_items_recompute_total

## Knowledge Gaps

- **1126 isolated node(s):** `github`, `github`, `$schema`, `style`, `rsc` (+1121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **99 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions

_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Package Dependencies` to `PDF Export & Dashboard Data`, `Radix UI - Tooltip`, `Radix UI - Slot`, `React Day Picker`, `React DOM`, `React Hook Form Dev`, `React Resizable`, `Recharts`, `Supabase Client`, `Tailwind Merge`, `Tailwind CSS`, `Tailwind Vite Plugin`, `TanStack Query`, `TanStack Table`, `TanStack Router`, `TW Animate`, `Vaul Drawer`, `Vite TSConfig`, `XLSX Spreadsheet`, `Zod Validation`, `Package Config`, `DateRangePicker.tsx`, `clsx Utility`, `cmdk Command Palette`, `date-fns Utility`, `Embla Carousel`, `React Hook Form`, `Lucide Icons`, `Radix UI - Accordion`, `Radix UI - AlertDialog`, `Radix UI - AspectRatio`, `Radix UI - Checkbox`, `Radix UI - Collapsible`, `Radix UI - ContextMenu`, `Radix UI - Dialog`, `Radix UI - DropdownMenu`, `Radix UI - Label`, `Radix UI - Menubar`, `Radix UI - NavigationMenu`, `Radix UI - Popover`, `Radix UI - Progress`, `Radix UI - RadioGroup`, `Radix UI - ScrollArea`, `Radix UI - Select`, `Radix UI - Separator`, `Radix UI - Slider`, `Radix UI - Switch`, `Radix UI - Tabs`, `Radix UI - Toast`, `Radix UI - Toggle`, `Radix UI - ToggleGroup`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `cn()` connect `Client Table & Data Grid` to `Organization Settings & Routes`, `Client Management Dialogs`, `Dialog Forms & Follow-ups`, `UI Components - Carousel`, `Shell Layout & Quick Create`, `Dashboard Executive Cards`, `Commercial Detail Views`, `Client Picker & Pipeline Drawer`, `App Sidebar Navigation`, `Report Filters & UI Alerts`, `Commercial Routes & Lib`, `Pipeline & Client Status UI`, `Shared UI Components`, `Shared Components`, `Commercial Components`, `Follow-up Components`, `Dashboard Charts`, `Pipeline UI Components`, `Route & Shell Components`, `Client Detail Components`, `DateRangePicker.tsx`, `form.tsx`, `chart.tsx`, `scroll-area.tsx`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `react` connect `DateRangePicker.tsx` to `Dashboard Executive Cards`, `Package Dependencies`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **What connects `github`, `github`, `$schema` to the rest of the system?**
  _1126 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PDF Export & Dashboard Data` be split into smaller, more focused modules?**
  _Cohesion score 0.11818181818181818 - nodes in this community are weakly interconnected._
- **Should `Organization Settings & Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.052917232021709636 - nodes in this community are weakly interconnected._
- **Should `Sheet Import Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.05789235639981909 - nodes in this community are weakly interconnected._
