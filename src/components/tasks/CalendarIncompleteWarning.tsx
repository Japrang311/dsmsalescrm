import { AlertTriangle } from "lucide-react";

import type { Task } from "@/lib/domain";
import type { TaskControlLoopMetrics } from "@/lib/data/tasks";
import { hasCalendarIncompleteTasks } from "@/lib/task-calendar-warning";

export function CalendarIncompleteWarning({
  tasks,
  metrics,
}: {
  tasks: readonly Pick<Task, "calendarIncomplete">[];
  metrics?: Pick<TaskControlLoopMetrics, "calendarIncompleteTasks">;
}) {
  if (!hasCalendarIncompleteTasks(tasks, metrics)) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Kalender bisnis belum lengkap.</p>
        <p className="mt-0.5">
          Perhitungan weekend tetap berjalan, tetapi data libur nasional/cuti
          bersama untuk tahun terkait belum lengkap. Due state bisa bergeser
          setelah kalender tahunan diisi.
        </p>
      </div>
    </div>
  );
}
