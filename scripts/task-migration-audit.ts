import { mkdir } from "node:fs/promises";
import { SQL } from "bun";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

type AuditRow = {
  id: string;
  generated_at: Date | string;
  task_count: number | string;
  deterministic_count: number | string;
  review_required_count: number | string;
  owner_mismatch_count: number | string;
  standalone_task_count: number | string;
  archive_mismatch_count: number | string;
  timeline_orphan_count: number | string;
  legacy_status_distribution: Record<string, number>;
  workflow_status_distribution: Record<string, number>;
  due_state_distribution: Record<string, number>;
  review_required_task_ids: string[] | string;
  unexplained_mismatches: Record<string, unknown>;
  passed: boolean;
};

const rows = await db<AuditRow[]>`
  select *
  from private.task_control_loop_migration_audit
  order by generated_at desc
  limit 1
`;
const data = rows[0];
if (!data) throw new Error("No Task Control Loop migration audit row found");

function asNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function asStringArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value;
  if (value === "{}") return [];
  return value.replace(/^{|}$/g, "").split(",").filter(Boolean);
}

const generatedAt =
  data.generated_at instanceof Date
    ? data.generated_at.toISOString()
    : new Date(data.generated_at).toISOString();

const report = {
  report: "sales-task-control-loop-migration",
  generatedAt,
  source: "private.task_control_loop_migration_audit",
  passed: data.passed,
  counts: {
    taskCount: asNumber(data.task_count),
    deterministicCount: asNumber(data.deterministic_count),
    reviewRequiredCount: asNumber(data.review_required_count),
    ownerMismatchCount: asNumber(data.owner_mismatch_count),
    standaloneTaskCount: asNumber(data.standalone_task_count),
    archiveMismatchCount: asNumber(data.archive_mismatch_count),
    timelineOrphanCount: asNumber(data.timeline_orphan_count),
  },
  distributions: {
    legacyStatus: data.legacy_status_distribution,
    workflowStatus: data.workflow_status_distribution,
    dueState: data.due_state_distribution,
  },
  reviewRequiredTaskIds: asStringArray(data.review_required_task_ids),
  unexplainedMismatches: data.unexplained_mismatches,
};

await mkdir("docs/reports", { recursive: true });
await Bun.write(
  "docs/reports/sales-task-control-loop-migration.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

const verdict = data.passed ? "PASS" : "REVIEW REQUIRED";
await Bun.write(
  "docs/reports/sales-task-control-loop-migration.md",
  `# Sales Task Control Loop Migration Report

Generated: ${generatedAt}

Verdict: ${verdict}

## Counts

- Task count: ${report.counts.taskCount}
- Deterministically classified: ${report.counts.deterministicCount}
- Review required: ${report.counts.reviewRequiredCount}
- Owner mismatches: ${report.counts.ownerMismatchCount}
- Standalone tasks: ${report.counts.standaloneTaskCount}
- Archive mismatches: ${report.counts.archiveMismatchCount}
- Timeline orphan references: ${report.counts.timelineOrphanCount}

## Distributions

Legacy status before cutover:

\`\`\`json
${JSON.stringify(data.legacy_status_distribution, null, 2)}
\`\`\`

Workflow status after cutover:

\`\`\`json
${JSON.stringify(data.workflow_status_distribution, null, 2)}
\`\`\`

Due state at audit time:

\`\`\`json
${JSON.stringify(data.due_state_distribution, null, 2)}
\`\`\`

Machine-readable source: \`docs/reports/sales-task-control-loop-migration.json\`

Rollback companion: recreate \`public.task_status\`, add \`public.tasks.status\`
as nullable/defaulted compatibility output, backfill active rows from
\`public.compute_task_due_state(due_date, workflow_status)\` while mapping
\`Escalated -> Overdue\`, and map terminal \`Done\`/\`Cancelled -> Done\`.
Run the same audit again before any remote release.
`,
);

if (!data.passed) {
  throw new Error(
    "Task Control Loop migration audit did not pass; see docs/reports/sales-task-control-loop-migration.json",
  );
}

console.log(`Task Control Loop migration audit: ${verdict}`);
