import { describe, expect, test } from "bun:test";

import { hasCalendarIncompleteTasks } from "@/lib/task-calendar-warning";

describe("hasCalendarIncompleteTasks", () => {
  test("uses aggregate metrics when available", () => {
    expect(hasCalendarIncompleteTasks([], { calendarIncompleteTasks: 2 })).toBe(
      true,
    );
  });

  test("falls back to task rows for sales-scoped views", () => {
    expect(
      hasCalendarIncompleteTasks([
        { calendarIncomplete: false },
        { calendarIncomplete: true },
      ]),
    ).toBe(true);
  });

  test("stays hidden when all task calendar data is complete", () => {
    expect(
      hasCalendarIncompleteTasks([{ calendarIncomplete: false }], {
        calendarIncompleteTasks: 0,
      }),
    ).toBe(false);
  });
});
