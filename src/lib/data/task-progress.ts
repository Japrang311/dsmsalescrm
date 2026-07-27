// Wraps public.record_task_progress() (Sales Task Control Loop
// implementation-plan Task 5 / project-tracker Task 50), the one atomic
// RPC that replaces independent, non-transactional writes across
// follow_up_logs/tasks/activity_log. This is the ONLY supported way to
// change a Task's workflowStatus, nextAction, nextActionDate, or
// cancellationReason (Task 6 acceptance criterion: "direct multi-write
// progress code is no longer exported for UI use") -- there is no
// separate multi-call helper exported alongside it.
import { supabase } from "@/lib/supabase";
import type { Task, TaskDueState, TaskWorkflowStatus } from "@/lib/domain";
import type { FollowUpResult } from "@/lib/data/follow-ups";

export type RecordTaskProgressInput = {
  taskId: string;
  // Required together whenever workflowStatusTarget resolves to an active
  // state (Open/In Progress/Waiting External) -- enforced by the database
  // (tasks_active_next_action_required, spec §2.4), not just here.
  nextAction: string | null;
  nextActionDate: string | null;
  note?: string;
  // Omit to leave the Task's current workflowStatus unchanged (a pure
  // progress note/next-action update).
  workflowStatusTarget?: TaskWorkflowStatus;
  // Required when workflowStatusTarget is "Cancelled".
  cancellationReason?: string;
  method?: Task["method"];
  result?: FollowUpResult;
  fuDate?: string;
  // References the follow_up_logs entry this call corrects (spec §3.4) --
  // the original entry is never edited, this just links a new one to it.
  correctsId?: string;
};

export type RecordTaskProgressResult = {
  taskId: string;
  followUpLogId: string;
  activityLogId: string;
  workflowStatus: TaskWorkflowStatus;
  dueState: TaskDueState;
  calendarIncomplete: boolean;
};

export async function recordTaskProgress(
  input: RecordTaskProgressInput,
): Promise<RecordTaskProgressResult> {
  const { data, error } = await supabase.rpc("record_task_progress", {
    p_task_id: input.taskId,
    p_next_action: input.nextAction,
    p_next_action_date: input.nextActionDate,
    p_note: input.note ?? null,
    p_workflow_status_target: input.workflowStatusTarget ?? null,
    p_cancellation_reason: input.cancellationReason ?? null,
    p_method: input.method ?? "Phone",
    p_result: input.result ?? "Progress Update",
    p_fu_date: input.fuDate ?? null,
    p_corrects_id: input.correctsId ?? null,
  });
  if (error) throw error;
  const row = data![0];
  return {
    taskId: row.task_id,
    followUpLogId: row.follow_up_log_id,
    activityLogId: row.activity_log_id,
    workflowStatus: row.workflow_status,
    dueState: row.due_state as TaskDueState,
    calendarIncomplete: row.calendar_incomplete,
  };
}

// The exact cache keys a recordTaskProgress() call must invalidate (spec
// §7.8), collected here so Task 7/8+ wire up the same set consistently
// instead of each mutation re-deriving its own list. taskTimeline/
// exceptions keys don't exist as real query keys anywhere yet -- their
// consumers (spec §7.3, §7.4, §7.6) are Task 9/10's job -- but are listed
// now so those tasks don't have to guess at naming later.
export const TASK_PROGRESS_INVALIDATION_KEYS = [
  ["tasks"],
  ["tasks", "exceptions", "team"],
  ["tasks", "exceptions", "executive"],
  ["task-timeline"],
  ["activity-log"],
  ["follow-ups"],
  ["dashboard"],
  ["reports"],
] as const;
