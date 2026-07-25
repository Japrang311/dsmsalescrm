# RFQ Removal

- [x] Remove RFQ routes, navigation, search, quick-create, and client actions.
- [x] Remove RFQ schemas, creation/conversion code, and RFQ-only stages.
- [x] Exclude historical RFQ documents from application queries.
- [x] Rename the visible legacy revenue source to `New Product`.
- [x] Add a forward migration that removes RFQ creation/conversion RPCs.
- [x] Add a forward migration that rejects new authenticated RFQ writes.
- [x] Run reference audit, tests, typecheck, lint, build, and local migration.
- [x] Push implementation to `origin/main` at `b0dc808`.
- [x] Update current documentation and ADRs for RFQ retirement.
- [ ] Apply RFQ-retirement migrations to Supabase remote after explicit target approval.
