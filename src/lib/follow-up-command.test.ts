import { describe, expect, test } from "bun:test";

import {
  buildExplicitFollowUpCommand,
  type ExplicitFollowUpChoice,
} from "./follow-up-command";

const base = {
  nextAction: "Kirim update quotation",
  nextActionDate: "2026-08-08",
  note: "Customer minta update harga",
  method: "Phone" as const,
  result: "Interested" as const,
  fuDate: "2026-08-05",
};

describe("buildExplicitFollowUpCommand", () => {
  test("maps an existing Task choice to the atomic RPC command", () => {
    const choice: ExplicitFollowUpChoice = {
      mode: "existing_task",
      taskId: "task-1",
    };

    expect(buildExplicitFollowUpCommand(choice, base)).toEqual({
      taskId: "task-1",
      nextAction: "Kirim update quotation",
      nextActionDate: "2026-08-08",
      note: "Customer minta update harga",
      method: "Phone",
      result: "Interested",
      fuDate: "2026-08-05",
      workflowStatusTarget: "In Progress",
    });
  });

  test("maps a create-new Task choice without also sending taskId", () => {
    const choice: ExplicitFollowUpChoice = {
      mode: "create_task",
      createTaskTitle: "Follow-up · PT DSM",
      taskDueDate: "2026-08-08",
    };

    expect(buildExplicitFollowUpCommand(choice, base)).toEqual({
      createTaskTitle: "Follow-up · PT DSM",
      taskDueDate: "2026-08-08",
      nextAction: "Kirim update quotation",
      nextActionDate: "2026-08-08",
      note: "Customer minta update harga",
      method: "Phone",
      result: "Interested",
      fuDate: "2026-08-05",
      workflowStatusTarget: "In Progress",
    });
  });

  test("rejects ambiguous or incomplete Task choices before calling Supabase", () => {
    expect(() =>
      buildExplicitFollowUpCommand({ mode: "existing_task", taskId: "" }, base),
    ).toThrow("Pilih Task existing yang akan diprogress");

    expect(() =>
      buildExplicitFollowUpCommand(
        { mode: "create_task", createTaskTitle: "", taskDueDate: "" },
        base,
      ),
    ).toThrow("Isi judul dan due date Task baru");
  });
});
