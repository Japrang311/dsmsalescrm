import type { Role, Task, TaskWorkflowStatus } from "@/lib/domain";

const ACTIVE_WORKFLOW_STATUSES = new Set<TaskWorkflowStatus>([
  "Open",
  "In Progress",
  "Waiting External",
]);

type OwnerRoleLookup = Record<string, { role?: Role }>;

export function filterManagerMyTasks(
  tasks: readonly Task[],
  managerId: string | null | undefined,
): Task[] {
  if (!managerId) return [];
  return tasks.filter((task) => task.ownerId === managerId);
}

export function filterManagerTeamExceptions(
  tasks: readonly Task[],
  ownersById: OwnerRoleLookup,
): Task[] {
  return tasks.filter((task) => {
    if (task.archived) return false;
    if (task.dueState !== "Escalated") return false;
    if (!ACTIVE_WORKFLOW_STATUSES.has(task.workflowStatus)) return false;
    return ownersById[task.ownerId]?.role === "sales";
  });
}

export function filterExecutiveTaskExceptions(
  tasks: readonly Task[],
  ownersById: OwnerRoleLookup,
): Task[] {
  return tasks.filter((task) => {
    if (task.archived) return false;
    if (task.dueState !== "Escalated") return false;
    if (!ACTIVE_WORKFLOW_STATUSES.has(task.workflowStatus)) return false;
    return ownersById[task.ownerId]?.role === "manager";
  });
}
