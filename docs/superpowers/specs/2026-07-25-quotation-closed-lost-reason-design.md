# Spec: Quotation Closed Lost Reason

## Objective

Require a structured reason whenever a quotation moves to `Closed Lost`, while
keeping an optional detail field for qualitative context. The structured field
must be usable by reporting selectors and future dashboard visualizations.

## Tech Stack

- React 19, TypeScript, TanStack Start, React Query
- Supabase Postgres and `@supabase/supabase-js`
- Bun test

## Commands

- Test: `bun test`
- Typecheck: `bunx tsc --noEmit`
- Lint: `bun run lint`
- Build: `bun run build`
- Local database reset: `bunx supabase db reset --local`

## Project Structure

- `src/lib/data/` — normalized commercial-document adapters and lost-reason rules
- `src/components/commercial/` — quotation detail editing
- `src/routes/_app.pipeline.tsx` — pipeline stage transition dialog
- `src/lib/report-selectors.ts` — reporting-ready aggregations
- `supabase/migrations/` — additive schema migration and database constraints
- `supabase/tests/` — database integration coverage

## Code Style

Use explicit domain unions and camelCase application fields mapped to snake_case
database columns:

```ts
type QuotationLostReason = "Harga tidak kompetitif" | "Lainnya";

const patch = { lostReason: "Harga tidak kompetitif" };
```

## Testing Strategy

- Unit tests cover allowed categories, required detail for `Lainnya`, transition
  normalization, and reporting aggregation.
- Supabase integration tests prove the database rejects incomplete
  `Closed Lost` quotations and accepts valid transitions.
- Browser verification covers both detail-page and pipeline transition forms.

## Boundaries

- Always: require a category for a quotation in `Closed Lost`; clear active
  reason fields when reopened; preserve the transition in activity history.
- Ask first: applying migrations to linked/remote Supabase.
- Never: infer historical reason categories from free-text notes.

## Success Criteria

- Detail and pipeline flows cannot save a quotation as `Closed Lost` without a
  category.
- `Lainnya` requires a detail.
- Database constraints protect writes outside the UI.
- Historical `Closed Lost` quotations receive `Belum diklasifikasi`.
- Lost reason appears on quotation detail and in transition activity.
- Reporting code can aggregate count and value by lost-reason category.

## Approved Categories

- Harga tidak kompetitif
- Kalah tender/kompetitor
- Spesifikasi tidak sesuai
- Project ditunda/dibatalkan
- Tidak ada respons
- Lead time
- Anggaran
- Lainnya
- Belum diklasifikasi (historical records only)
