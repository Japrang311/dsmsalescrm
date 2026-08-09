import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PendingPipelineMove } from "@/components/pipeline/PipelineStageMoveDialog";
import type { Task } from "@/lib/domain";
import { NOW, toLocalIsoDate } from "@/lib/domain";
import { getErrorMessage } from "@/lib/utils";
import { getCurrentActorId, logActivity } from "@/lib/data/activity-log";
import { createTask, updateTask, type TaskPatch } from "@/lib/data/tasks";
import { recordTaskProgress } from "@/lib/data/task-progress";
import { transitionCommercialStage } from "@/lib/data/commercial-documents";
import { buildExplicitFollowUpCommand } from "@/lib/follow-up-command";
import { formatDateShort } from "@/lib/format";
import {
  TASKS_INBOX_INVALIDATION_PREFIXES,
  bucketForTask,
  type TasksInboxClientLookup,
} from "@/lib/tasks-inbox-controller";

export type TasksInboxProfileLookup = Record<
  string,
  { name: string; initials: string }
>;

export async function invalidateTasksInboxDefault(queryClient: QueryClient) {
  for (const queryKey of TASKS_INBOX_INVALIDATION_PREFIXES.defaultTaskMutation) {
    await queryClient.invalidateQueries({ queryKey });
  }
}

export async function invalidateTasksInboxWaitingPoMove(
  queryClient: QueryClient,
) {
  for (const queryKey of TASKS_INBOX_INVALIDATION_PREFIXES.waitingPoMove) {
    await queryClient.invalidateQueries({ queryKey });
  }
}

export async function logTasksInboxTaskEvent(
  task: Task,
  title: string,
  detail?: string,
): Promise<void> {
  const actorId = await getCurrentActorId();
  if (!actorId) return;
  await logActivity({
    kind: "task_status_change",
    ownerId: task.ownerId,
    actorId,
    clientId: task.clientId,
    taskId: task.id,
    title,
    detail,
  });
}

export async function markTasksInboxTaskDone(input: {
  task: Task;
  queryClient: QueryClient;
  clientsById: TasksInboxClientLookup;
}) {
  try {
    await recordTaskProgress({
      taskId: input.task.id,
      nextAction: null,
      nextActionDate: null,
      workflowStatusTarget: "Done",
    });
    await invalidateTasksInboxDefault(input.queryClient);
    const client = input.task.clientId
      ? input.clientsById[input.task.clientId]
      : undefined;
    toast.success(`Task diselesaikan — ${client?.name ?? "Klien"}`, {
      description: input.task.title,
    });
  } catch (error) {
    toast.error("Gagal menyelesaikan task", {
      description: getErrorMessage(error),
    });
  }
}

export async function snoozeTasksInboxTask(input: {
  task: Task;
  queryClient: QueryClient;
}) {
  const next = new Date(input.task.dueDate);
  next.setDate(next.getDate() + 1);
  const iso = toLocalIsoDate(next);
  const prevDueDate = input.task.dueDate;
  try {
    await updateTask(input.task.id, { dueDate: iso });
    await logTasksInboxTaskEvent(
      input.task,
      `Ditunda +1 hari → ${formatDateShort(iso)}`,
    );
    await invalidateTasksInboxDefault(input.queryClient);
    toast(`Ditunda ke ${formatDateShort(iso)}`, {
      description: input.task.title,
      action: {
        label: "Undo",
        onClick: () =>
          void (async () => {
            try {
              await updateTask(input.task.id, {
                dueDate: prevDueDate,
              });
              await logTasksInboxTaskEvent(input.task, "Penundaan dibatalkan");
              await invalidateTasksInboxDefault(input.queryClient);
            } catch (error) {
              toast.error("Gagal membatalkan penundaan", {
                description: getErrorMessage(error),
              });
            }
          })(),
      },
    });
  } catch (error) {
    toast.error("Gagal menunda task", {
      description: getErrorMessage(error),
    });
  }
}

export async function archiveTasksInboxTask(input: {
  task: Task;
  queryClient: QueryClient;
}) {
  try {
    await updateTask(input.task.id, { archived: true });
    await logTasksInboxTaskEvent(input.task, "Task diarsipkan");
    await invalidateTasksInboxDefault(input.queryClient);
    toast("Task diarsipkan", {
      description: input.task.title,
      action: {
        label: "Undo",
        onClick: () =>
          void (async () => {
            try {
              await updateTask(input.task.id, { archived: false });
              await logTasksInboxTaskEvent(
                input.task,
                "Task dikembalikan dari arsip",
              );
              await invalidateTasksInboxDefault(input.queryClient);
            } catch (error) {
              toast.error("Gagal mengembalikan task", {
                description: getErrorMessage(error),
              });
            }
          })(),
      },
    });
  } catch (error) {
    toast.error("Gagal mengarsipkan task", {
      description: getErrorMessage(error),
    });
  }
}

export async function unarchiveTasksInboxTask(input: {
  task: Task;
  queryClient: QueryClient;
}) {
  try {
    await updateTask(input.task.id, { archived: false });
    await logTasksInboxTaskEvent(input.task, "Task dikembalikan dari arsip");
    await invalidateTasksInboxDefault(input.queryClient);
    toast("Task dikembalikan ke inbox", { description: input.task.title });
  } catch (error) {
    toast.error("Gagal mengembalikan task", {
      description: getErrorMessage(error),
    });
  }
}

export async function createTasksInboxChildTask(input: {
  task: Task;
  kind: "Quotation" | "Prototype";
  queryClient: QueryClient;
  clientsById: TasksInboxClientLookup;
}) {
  const client = input.task.clientId
    ? input.clientsById[input.task.clientId]
    : undefined;
  const due = new Date(NOW);
  due.setDate(due.getDate() + (input.kind === "Quotation" ? 2 : 3));
  const iso = toLocalIsoDate(due);
  try {
    const childTask = await createTask({
      clientId: input.task.clientId,
      commercialDocumentId: input.task.commercialItemId,
      ownerId: input.task.ownerId,
      title:
        input.kind === "Quotation"
          ? "Siapkan quotation"
          : "Koordinasi prototype",
      method: input.kind === "Quotation" ? "Email" : "Meeting",
      priority: "Normal",
      dueDate: iso,
    });
    const actorId = await getCurrentActorId();
    if (actorId) {
      await logActivity({
        kind: "task_created",
        ownerId: input.task.ownerId,
        actorId,
        clientId: input.task.clientId,
        taskId: childTask.id,
        title: `Task ${input.kind} dibuat`,
        detail: childTask.title,
      });
    }
    await invalidateTasksInboxDefault(input.queryClient);
    toast.success(`Task ${input.kind} dibuat`, {
      description: `${client?.name ?? "Klien"} · due ${formatDateShort(iso)}`,
    });
  } catch (error) {
    toast.error(`Gagal membuat task ${input.kind}`, {
      description: getErrorMessage(error),
    });
  }
}

export async function confirmTasksInboxWaitingPoMove(input: {
  waitingPoMove: PendingPipelineMove;
  waitingPoTaskMode: "existing_task" | "create_task";
  waitingPoTaskId: string;
  waitingPoNextAction: string;
  waitingPoNextDate: string;
  queryClient: QueryClient;
}): Promise<boolean> {
  try {
    const command = buildExplicitFollowUpCommand(
      input.waitingPoTaskMode === "existing_task"
        ? { mode: "existing_task", taskId: input.waitingPoTaskId }
        : {
            mode: "create_task",
            createTaskTitle: `Follow-up · ${input.waitingPoMove.clientName}`,
            taskDueDate: input.waitingPoNextDate,
          },
      {
        nextAction: input.waitingPoNextAction,
        nextActionDate: input.waitingPoNextDate,
        note: `Stage ${input.waitingPoMove.fromStage} → ${input.waitingPoMove.toStage} — dipindah dari Tasks Inbox`,
        method: "Phone",
        result: "Progress Update",
        fuDate: toLocalIsoDate(NOW),
      },
    );
    await transitionCommercialStage({
      commercialDocumentId: input.waitingPoMove.itemId,
      expectedFromStage: input.waitingPoMove.fromStage,
      toStage: input.waitingPoMove.toStage,
      ...command,
    });
    await invalidateTasksInboxWaitingPoMove(input.queryClient);
    toast.success("Commercial item → Commit", {
      description: input.waitingPoMove.clientName,
    });
    return true;
  } catch (error) {
    toast.error("Gagal memindahkan commercial item", {
      description: getErrorMessage(error),
    });
    return false;
  }
}

export async function bulkMarkTasksInboxDone(input: {
  tasks: Task[];
  queryClient: QueryClient;
  clearSelection: () => void;
}) {
  const targets = input.tasks.filter((task) => bucketForTask(task) !== "done");
  if (targets.length === 0) return;
  try {
    await Promise.all(
      targets.map(async (task) => {
        await recordTaskProgress({
          taskId: task.id,
          nextAction: null,
          nextActionDate: null,
          workflowStatusTarget: "Done",
        });
      }),
    );
    await invalidateTasksInboxDefault(input.queryClient);
    toast.success(`${targets.length} task ditandai Done`);
  } catch (error) {
    toast.error("Gagal menandai task selesai", {
      description: getErrorMessage(error),
    });
  }
  input.clearSelection();
}

export async function bulkSnoozeTasksInbox(input: {
  tasks: Task[];
  queryClient: QueryClient;
  clearSelection: () => void;
}) {
  const targets = input.tasks.filter((task) => bucketForTask(task) !== "done");
  if (targets.length === 0) return;
  const snapshot = targets.map((task) => ({
    id: task.id,
    dueDate: task.dueDate,
    task,
  }));
  try {
    await Promise.all(
      targets.map(async (task) => {
        const next = new Date(task.dueDate);
        next.setDate(next.getDate() + 1);
        const iso = toLocalIsoDate(next);
        await updateTask(task.id, { dueDate: iso });
        await logTasksInboxTaskEvent(
          task,
          `Ditunda +1 hari → ${formatDateShort(iso)} (massal)`,
        );
      }),
    );
    await invalidateTasksInboxDefault(input.queryClient);
    toast(`${targets.length} task ditunda +1 hari`, {
      action: {
        label: "Undo",
        onClick: () =>
          void (async () => {
            await Promise.all(
              snapshot.map(({ id, dueDate, task }) =>
                updateTask(id, { dueDate }).then(() =>
                  logTasksInboxTaskEvent(
                    task,
                    "Penundaan dibatalkan (massal undo)",
                  ),
                ),
              ),
            );
            await invalidateTasksInboxDefault(input.queryClient);
          })(),
      },
    });
  } catch (error) {
    toast.error("Gagal menunda task", {
      description: getErrorMessage(error),
    });
  }
  input.clearSelection();
}

export async function bulkChangeTasksInboxOwner(input: {
  tasks: Task[];
  newOwnerId: string;
  queryClient: QueryClient;
  profilesById: TasksInboxProfileLookup;
  clearSelection: () => void;
}) {
  const target = input.profilesById[input.newOwnerId];
  if (!target) return;
  const targets = input.tasks.filter(
    (task) => task.ownerId !== input.newOwnerId,
  );
  if (targets.length === 0) return;
  const snapshot = targets.map((task) => ({
    id: task.id,
    ownerId: task.ownerId,
    task,
  }));
  try {
    await Promise.all(
      targets.map(async (task) => {
        const prevOwner = input.profilesById[task.ownerId];
        await updateTask(task.id, { ownerId: input.newOwnerId });
        await logTasksInboxTaskEvent(
          task,
          `Owner: ${prevOwner?.name ?? task.ownerId} → ${target.name}`,
        );
      }),
    );
    await invalidateTasksInboxDefault(input.queryClient);
    toast(`Owner ${targets.length} task → ${target.name}`, {
      action: {
        label: "Undo",
        onClick: () =>
          void (async () => {
            await Promise.all(
              snapshot.map(({ id, ownerId, task }) =>
                updateTask(id, { ownerId } satisfies TaskPatch).then(() =>
                  logTasksInboxTaskEvent(
                    task,
                    "Owner dibatalkan (massal undo)",
                  ),
                ),
              ),
            );
            await invalidateTasksInboxDefault(input.queryClient);
          })(),
      },
    });
  } catch (error) {
    toast.error("Gagal mengubah owner", {
      description: getErrorMessage(error),
    });
  }
  input.clearSelection();
}
