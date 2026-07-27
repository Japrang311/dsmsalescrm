# Sales Task Control Loop Migration Report

Generated: 2026-07-27T14:13:52.261Z

Verdict: PASS

## Counts

- Task count: 0
- Deterministically classified: 0
- Review required: 0
- Owner mismatches: 0
- Standalone tasks: 0
- Archive mismatches: 0
- Timeline orphan references: 0

## Distributions

Legacy status before cutover:

```json
{}
```

Workflow status after cutover:

```json
{}
```

Due state at audit time:

```json
{}
```

Machine-readable source: `docs/reports/sales-task-control-loop-migration.json`

Rollback companion: recreate `public.task_status`, add `public.tasks.status`
as nullable/defaulted compatibility output, backfill active rows from
`public.compute_task_due_state(due_date, workflow_status)` while mapping
`Escalated -> Overdue`, and map terminal `Done`/`Cancelled -> Done`.
Run the same audit again before any remote release.
