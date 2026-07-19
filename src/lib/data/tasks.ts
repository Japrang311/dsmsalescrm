import { supabase } from "@/lib/supabase";
import type { Task, TaskStatus } from "@/lib/domain";

type TaskRow = {
  id: string;
  client_id: string;
  owner_id: string;
  commercial_item_id: string | null;
  commercial_document_id: string | null;
  title: string;
  due_date: string;
  method: Task["method"];
  status: TaskStatus;
  priority: Task["priority"];
  archived: boolean;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    clientId: row.client_id,
    ownerId: row.owner_id,
    commercialItemId:
      row.commercial_document_id ?? row.commercial_item_id ?? undefined,
    commercialDocumentId: row.commercial_document_id ?? undefined,
    title: row.title,
    dueDate: row.due_date,
    method: row.method,
    status: row.status,
    priority: row.priority,
    archived: row.archived,
  };
}

// No role/userId parameter, same reasoning as listClients(): RLS already
// scopes the rows to whatever the logged-in user can see.
export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select("*");
  if (error) throw error;
  return (data ?? []).map(toTask);
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<Task> {
  return updateTask(id, { status });
}

export type TaskPatch = Partial<{
  title: string;
  dueDate: string;
  method: Task["method"];
  status: TaskStatus;
  priority: Task["priority"];
  ownerId: string;
  archived: boolean;
}>;

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.method !== undefined) update.method = patch.method;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.ownerId !== undefined) update.owner_id = patch.ownerId;
  if (patch.archived !== undefined) update.archived = patch.archived;

  const { data, error } = await supabase
    .from("tasks")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toTask(data);
}

export function describeTaskChanges(
  changes: { field: string; from?: string; to?: string }[],
): string {
  return changes
    .map((c) => `${c.field}: ${c.from ?? "-"} → ${c.to ?? "-"}`)
    .join(" · ");
}

export async function createTask(input: {
  clientId: string;
  ownerId: string;
  commercialItemId?: string;
  commercialDocumentId?: string;
  title: string;
  dueDate: string;
  method: Task["method"];
  priority: Task["priority"];
  status?: TaskStatus;
}): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      client_id: input.clientId,
      owner_id: input.ownerId,
      commercial_item_id: input.commercialItemId,
      commercial_document_id: input.commercialDocumentId,
      title: input.title,
      due_date: input.dueDate,
      method: input.method,
      priority: input.priority,
      status: input.status ?? "Upcoming",
    })
    .select("*")
    .single();
  if (error) throw error;
  return toTask(data);
}
