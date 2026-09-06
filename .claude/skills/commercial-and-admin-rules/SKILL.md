---
name: commercial-and-admin-rules
description: Accepted Phase 12 Super Admin lifecycle rules and Phase 11 commercial-document (Quotation/SO) rules. Load before touching roles, RLS, Settings, auth, or commercial schema.
---

### Accepted Super Admin rules (Phase 12; locally verified, implemented before Phase 11 schema)

- Source of truth: ADR-002, `docs/superpowers/specs/2026-07-18-super-admin-team-role-management-design.md`, and its implementation plan.
- Only active Super Admin mutates Team & Role; Manager and Executive see the roster read-only, while Sales does not see it.
- Manager retains company-wide supported business editing. Super Admin also has company-wide supported business access but is not an owner and is excluded from targets/performance.
- Super Admin business corrections preserve `owner_id`; ownership changes use the explicit transfer action to an active Sales or Manager.
- Deactivate by default. Permanent delete only when the server proves zero business/audit references.
- Protect the logged-in Super Admin and the last active Super Admin from deactivation/deletion; never allow zero active Super Admins.
- Activity Log is append-only for all roles. Every admin action requires a reason and logs actor plus a safe target snapshot.
- `manage-team-member` now implements the Super-Admin-only lifecycle contract described above (create/update/role-change/deactivate/reactivate/transfer/delete/reset_password). `reset_password` requires an administrative reason, writes an append-only `team_member_password_reset` audit event with a safe target snapshot, and cannot target the acting Super Admin (self-service password change lives in Settings → Akun via `supabase.auth.updateUser` after current-password verification). `bootstrap_manager_role.sql` is historical and superseded by `bootstrap_super_admin_role.sql` (ADR-002); do not use it to establish the production authority model.

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
