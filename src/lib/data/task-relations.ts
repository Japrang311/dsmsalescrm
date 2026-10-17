import type { Task } from "@/lib/domain";
import { isActiveTask } from "@/lib/data/dashboard-selectors";

export function taskBelongsToClient(task: Task, clientId: string): boolean {
  return task.clientId === clientId;
}

export function taskBelongsToCommercialItem(
  task: Task,
  commercialItemId: string,
): boolean {
  return (
    task.commercialDocumentId === commercialItemId ||
    task.commercialItemId === commercialItemId
  );
}

export function clientRelatedTasks(tasks: Task[], clientId: string): Task[] {
  return tasks.filter((task) => taskBelongsToClient(task, clientId));
}

export function commercialRelatedTasks(
  tasks: Task[],
  commercialItemId: string,
): Task[] {
  return tasks.filter((task) =>
    taskBelongsToCommercialItem(task, commercialItemId),
  );
}

export function activeClientTasks(tasks: Task[], clientId: string): Task[] {
  return clientRelatedTasks(tasks, clientId).filter(isActiveTask);
}

export function activeCommercialTasks(
  tasks: Task[],
  commercialItemId: string,
): Task[] {
  return commercialRelatedTasks(tasks, commercialItemId).filter(isActiveTask);
}

export function reusableClientTask(
  tasks: Task[],
  clientId: string,
): Task | undefined {
  const activeTasks = activeClientTasks(tasks, clientId);
  return activeTasks.length === 1 ? activeTasks[0] : undefined;
}

export function reusableCommercialTask(
  tasks: Task[],
  commercialItemId: string,
): Task | undefined {
  const activeTasks = activeCommercialTasks(tasks, commercialItemId);
  return activeTasks.length === 1 ? activeTasks[0] : undefined;
}
