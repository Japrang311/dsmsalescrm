import type { Role, Task, TaskWorkflowStatus } from "@/lib/domain";
import { listOwners, type OwnerLookup } from "./clients";
import { listTasks } from "./tasks";

const ACTIVE_WORKFLOW_STATUSES = new Set<TaskWorkflowStatus>([
  "Open",
  "In Progress",
  "Waiting External",
]);

type OwnerRoleLookup = Record<string, { role?: Role }>;

export type ManagerTaskScopes = {
  myTasks: Task[];
  teamExceptions: Task[];
};

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

export async function listManagerTaskScopes(
  managerId: string,
): Promise<ManagerTaskScopes> {
  const [tasks, ownersById] = await Promise.all([listTasks(), listOwners()]);
  return {
    myTasks: filterManagerMyTasks(tasks, managerId),
    teamExceptions: filterManagerTeamExceptions(
      tasks,
      ownersById as OwnerLookup,
    ),
  };
}
