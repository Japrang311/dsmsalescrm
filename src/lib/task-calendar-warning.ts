import type { Task } from "@/lib/domain";
import type { TaskControlLoopMetrics } from "@/lib/data/tasks";

export function hasCalendarIncompleteTasks(
  tasks: readonly Pick<Task, "calendarIncomplete">[],
  metrics?: Pick<TaskControlLoopMetrics, "calendarIncompleteTasks">,
): boolean {
  return (
    (metrics?.calendarIncompleteTasks ?? 0) > 0 ||
    tasks.some((task) => task.calendarIncomplete)
  );
}
