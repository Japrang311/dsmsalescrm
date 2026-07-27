import { describe, test, expect } from "bun:test";
import { computeTaskDueState } from "./business-calendar";
import { DUE_STATE_FIXTURES } from "../../../supabase/tests/business-calendar-fixtures";

describe("computeTaskDueState (TypeScript mirror of public.compute_task_due_state)", () => {
  for (const fixture of DUE_STATE_FIXTURES) {
    test(fixture.label, () => {
      const result = computeTaskDueState(
        fixture.dueDate,
        fixture.workflowStatus,
        new Set(fixture.holidays),
        fixture.asOf,
      );
      expect(result).toEqual(fixture.expected);
    });
  }
});
