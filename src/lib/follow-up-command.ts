import type { Task } from "@/lib/domain";
import type {
  FollowUpResult,
  RecordFollowUpCommandInput,
} from "@/lib/data/follow-ups";

export type ExplicitFollowUpChoice =
  | {
      mode: "existing_task";
      taskId: string;
    }
  | {
      mode: "create_task";
      createTaskTitle: string;
      taskDueDate: string;
    };

export type ExplicitFollowUpBase = {
  nextAction: string;
  nextActionDate: string;
  note?: string;
  method?: Task["method"];
  result?: FollowUpResult;
  fuDate?: string;
};

export function buildExplicitFollowUpCommand(
  choice: ExplicitFollowUpChoice,
  base: ExplicitFollowUpBase,
): RecordFollowUpCommandInput {
  const nextAction = base.nextAction.trim();
  const nextActionDate = base.nextActionDate.trim();

  if (!nextAction || !nextActionDate) {
    throw new Error("Isi next action dan tanggal next action");
  }

  const command: RecordFollowUpCommandInput = {
    nextAction,
    nextActionDate,
    note: base.note,
    method: base.method,
    result: base.result,
    fuDate: base.fuDate,
    workflowStatusTarget: "In Progress",
  };

  if (choice.mode === "existing_task") {
    const taskId = choice.taskId.trim();
    if (!taskId) {
      throw new Error("Pilih Task existing yang akan diprogress");
    }
    return { ...command, taskId };
  }

  const createTaskTitle = choice.createTaskTitle.trim();
  const taskDueDate = choice.taskDueDate.trim();
  if (!createTaskTitle || !taskDueDate) {
    throw new Error("Isi judul dan due date Task baru");
  }
  return { ...command, createTaskTitle, taskDueDate };
}
