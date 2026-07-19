import { supabase } from "@/lib/supabase";
import type { ClientStatus, Task } from "@/lib/domain";

export type FollowUpResult =
  | "No Response"
  | "Interested"
  | "Need Quotation"
  | "Quotation Sent"
  | "Negotiation"
  | "Waiting PO"
  | "PO Confirmed"
  | "Not Interested"
  | "Follow-up Later";

export type FollowUpLog = {
  id: string;
  taskId?: string;
  clientId: string;
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
  client_id: string;
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
    clientId: row.client_id,
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
  clientId: string;
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
