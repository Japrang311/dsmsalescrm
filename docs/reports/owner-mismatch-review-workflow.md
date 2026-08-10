# Owner-Mismatch Review Workflow

HANDOFF point 7 tracks ~95 documents whose document owner differs from the current client owner. This workflow turns that backlog into a reviewable list without changing any data.

## Why this is not auto-fixed

A mismatch can be valid history: the client may now belong to one sales person while an older quotation/SO was handled by another. Because revenue attribution and activity history are involved, every row needs a Product Owner decision before any correction migration or admin action is written.

## Generate the database read-only query

```bash
bun scripts/owner-mismatch-review.ts --print-sql
```

Run the printed SQL in a read-only SQL context, then export the result as JSON.

## Format a Product Owner review report

```bash
bun scripts/owner-mismatch-review.ts \
  --input owner-mismatches.json \
  --format md
```

The script prints the report to stdout. If you intentionally want to save it, redirect stdout to a scratch/report path after confirming the destination. The generated report includes summary counts by document type, current client owner, document owner, and a table with an empty `Decision note` column for manual review.

## Guardrails

- The script does not connect to Supabase by itself.
- The script does not write files; it prints SQL or a formatted report to stdout.
- The SQL is `SELECT`-only and excludes soft-deleted documents.
- Do not create an `UPDATE`/migration until the owner approves the correction approach for the reviewed rows.
