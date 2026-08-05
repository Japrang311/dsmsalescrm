import { supabase } from "@/lib/supabase";
import type {
  ClientStatus,
  Task,
  TaskDueState,
  TaskWorkflowStatus,
} from "@/lib/domain";

export type FollowUpResult =
  | "No Response"
  | "Interested"
  | "Need Quotation"
  | "Quotation Sent"
  | "Negotiation"
  | "Waiting PO"
  | "PO Confirmed"
  | "Not Interested"
  | "Follow-up Later"
  // Neutral value for non-commercial Task categories (Internal/Admin,
  // Project/Opportunity Planning, etc.) that don't fit the quotation
  // funnel above -- default result for record_task_progress() (spec §3.1).
  | "Progress Update";

export type FollowUpLog = {
  id: string;
  taskId?: string;
  clientId?: string; // optional end-to-end (spec §2.1, §3.1) -- Task 7/52
  commercialItemId?: string;
  commercialDocumentId?: string;
  ownerId: string;
  fuDate: string;
  method: Task["method"];
  result: FollowUpResult;
  nextAction?: string;
  nextFuDate?: string;
  customerStatus?: ClientStatus;
  potentialValue?: number;
  notes?: string;
  createdAt: string;
};

type FollowUpLogRow = {
  id: string;
  task_id: string | null;
  client_id: string | null;
  commercial_item_id: string | null;
  commercial_document_id: string | null;
  owner_id: string;
  fu_date: string;
  method: Task["method"];
  result: FollowUpResult;
  next_action: string | null;
  next_fu_date: string | null;
  customer_status: ClientStatus | null;
  potential_value: number | null;
  notes: string | null;
  created_at: string;
};

function toFollowUpLog(row: FollowUpLogRow): FollowUpLog {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    clientId: row.client_id ?? undefined,
    commercialItemId:
      row.commercial_document_id ?? row.commercial_item_id ?? undefined,
    commercialDocumentId: row.commercial_document_id ?? undefined,
    ownerId: row.owner_id,
    fuDate: row.fu_date,
    method: row.method,
    result: row.result,
    nextAction: row.next_action ?? undefined,
    nextFuDate: row.next_fu_date ?? undefined,
    customerStatus: row.customer_status ?? undefined,
    potentialValue: row.potential_value ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function logFollowUp(input: {
  taskId?: string;
  clientId?: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  ownerId: string;
  fuDate: string;
  method: Task["method"];
  result: FollowUpResult;
  nextAction?: string;
  nextFuDate?: string;
  customerStatus?: ClientStatus;
  potentialValue?: number;
  notes?: string;
}): Promise<FollowUpLog> {
  const { data, error } = await supabase
    .from("follow_up_logs")
    .insert({
      task_id: input.taskId,
      client_id: input.clientId,
      commercial_item_id: input.commercialItemId,
      commercial_document_id: input.commercialDocumentId,
      owner_id: input.ownerId,
      fu_date: input.fuDate,
      method: input.method,
      result: input.result,
      next_action: input.nextAction,
      next_fu_date: input.nextFuDate,
      customer_status: input.customerStatus,
      potential_value: input.potentialValue,
      notes: input.notes,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toFollowUpLog(data);
}

// No role/userId parameter, same reasoning as listTasks(): RLS already
// scopes the rows to whatever the logged-in user can see.
export async function listFollowUpsForClient(
  clientId: string,
): Promise<FollowUpLog[]> {
  const { data, error } = await supabase
    .from("follow_up_logs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toFollowUpLog);
}

export async function listFollowUpsForCommercialDocument(
  commercialDocumentId: string,
): Promise<FollowUpLog[]> {
  const { data, error } = await supabase
    .from("follow_up_logs")
    .select("*")
    .eq("commercial_document_id", commercialDocumentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toFollowUpLog);
}

// Powers the unified Activity Log feed (_app.activity.tsx) — every
// follow-up the signed-in user can see, unfiltered by client.
export async function listAllFollowUps(): Promise<FollowUpLog[]> {
  const { data, error } = await supabase
    .from("follow_up_logs")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toFollowUpLog);
}

export type RecordFollowUpCommandInput = {
  taskId?: string;
  createTaskTitle?: string;
  taskDueDate?: string;
  nextAction: string | null;
  nextActionDate: string | null;
  note?: string;
  method?: Task["method"];
  result?: FollowUpResult;
  fuDate?: string;
  workflowStatusTarget?: TaskWorkflowStatus;
};

export type RecordClientFollowUpInput = RecordFollowUpCommandInput & {
  clientId: string;
};

export type RecordCommercialFollowUpInput = RecordFollowUpCommandInput & {
  commercialDocumentId: string;
};

export type RecordFollowUpCommandResult = {
  taskId: string;
  followUpLogId: string;
  activityLogId: string;
  createdTask: boolean;
  workflowStatus: TaskWorkflowStatus;
  dueState: TaskDueState;
  calendarIncomplete: boolean;
};

type RecordFollowUpCommandRow = {
  task_id: string;
  follow_up_log_id: string;
  activity_log_id: string;
  created_task: boolean;
  workflow_status: TaskWorkflowStatus;
  due_state: TaskDueState;
  calendar_incomplete: boolean;
};

function toRecordFollowUpCommandResult(
  row: RecordFollowUpCommandRow,
): RecordFollowUpCommandResult {
  return {
    taskId: row.task_id,
    followUpLogId: row.follow_up_log_id,
    activityLogId: row.activity_log_id,
    createdTask: row.created_task,
    workflowStatus: row.workflow_status,
    dueState: row.due_state,
    calendarIncomplete: row.calendar_incomplete,
  };
}

function commandArgs(input: RecordFollowUpCommandInput) {
  return {
    p_task_id: input.taskId ?? null,
    p_create_task_title: input.createTaskTitle ?? null,
    p_task_due_date: input.taskDueDate ?? null,
    p_next_action: input.nextAction,
    p_next_action_date: input.nextActionDate,
    p_note: input.note ?? null,
    p_method: input.method ?? "Phone",
    p_result: input.result ?? "Progress Update",
    p_fu_date: input.fuDate ?? null,
    p_workflow_status_target: input.workflowStatusTarget ?? "In Progress",
  };
}

export async function recordClientFollowUp(
  input: RecordClientFollowUpInput,
): Promise<RecordFollowUpCommandResult> {
  const { data, error } = await supabase.rpc("record_client_follow_up", {
    p_client_id: input.clientId,
    ...commandArgs(input),
  });
  if (error) throw error;
  return toRecordFollowUpCommandResult(data![0]);
}

export async function recordCommercialFollowUp(
  input: RecordCommercialFollowUpInput,
): Promise<RecordFollowUpCommandResult> {
  const { data, error } = await supabase.rpc("record_commercial_follow_up", {
    p_commercial_document_id: input.commercialDocumentId,
    ...commandArgs(input),
  });
  if (error) throw error;
  return toRecordFollowUpCommandResult(data![0]);
}
