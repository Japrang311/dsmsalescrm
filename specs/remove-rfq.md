# Spec: Remove RFQ

Status update 2026-07-25: implemented and pushed to `origin/main` as
`b0dc808 refactor: retire RFQ workflow`. The two RFQ-retirement migrations are
committed and verified locally, but still require a separate approved Supabase
remote apply.

## Objective

Retire RFQ as an application feature while preserving historical database rows.
Quotation becomes the first commercial document for new-product work.

## Commands

- Test: `bun test`
- Typecheck: `bunx tsc --noEmit`
- Lint: `bun run lint`
- Build: `bun run build`
- Local schema verification: `bunx supabase migration up --local`

## Project Structure

- `src/routes` and `src/components`: user-facing routes, menus, forms, filters
- `src/lib`: domain, data mapping, stages, exports
- `supabase/migrations`: forward-only database changes

## Code Style

Use existing TypeScript/React conventions and keep storage compatibility at
the data boundary:

```ts
const source = row.source === LEGACY_NEW_PRODUCT_SOURCE ? "New Product" : row.source;
```

## Testing Strategy

- Unit tests prove RFQ is absent from quick-create and stage definitions.
- Existing selector, form, export, typecheck, lint, and build checks guard
  non-RFQ behavior.
- A source/reference audit checks for remaining production RFQ surfaces.

## Boundaries

- Always: remove RFQ routes, creation/conversion paths, dropdown entries, and
  RFQ-only stages.
- Ask first: push/apply any migration to the linked remote Supabase project.
- Never: delete historical RFQ rows or rewrite already-applied migrations.

## Success Criteria

- `/rfq` routes, navigation, quick-create, global search, and client actions
  no longer exist.
- RFQ documents are excluded at the commercial-document query boundary.
- Quotation stages start at `Quotes Sent`; `Client Request for Quotes` is gone.
- User-facing revenue source is `New Product`, with legacy storage mapping.
- RFQ creation/conversion RPCs are removed by a new forward migration.
- Authenticated attempts to create new RFQ documents are rejected by a forward
  migration.
- Tests, typecheck, lint, and build pass.

## Open Questions

- Permanent removal of historical RFQ rows/columns/enums is intentionally
  deferred because it is destructive and requires explicit remote approval.
