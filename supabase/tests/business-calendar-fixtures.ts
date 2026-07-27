// Shared fixture matrix for the business-day due-state engine (Sales Task
// Control Loop implementation-plan Task 4 / project-tracker Task 49).
// Imported by both supabase/tests/business-calendar.test.ts (calls the
// public.compute_task_due_state RPC) and
// src/lib/data/business-calendar.test.ts (calls the pure TypeScript
// mirror) so the acceptance criterion "database and TypeScript consumers
// return the same due state for the same fixtures" is one literal list,
// not two hand-kept-in-sync ones. Weekdays below were verified with the
// `date` CLI, not hand-computed, to rule out arithmetic mistakes.

export type WorkflowStatus =
  | "Open"
  | "In Progress"
  | "Waiting External"
  | "Done"
  | "Cancelled";

export type DueStateFixture = {
  label: string;
  dueDate: string;
  workflowStatus: WorkflowStatus;
  holidays: string[];
  asOf: string;
  expected: {
    dueState: "Upcoming" | "Today" | "Overdue" | "Escalated" | null;
    calendarIncomplete: boolean;
  };
};

// 2026-01-01 (Thursday) is New Year's Day -- a universal public holiday,
// safe to use as a real (not fabricated) anchor row so `calendarIncomplete`
// reads false for 2026 fixtures that aren't specifically testing the
// incomplete-calendar fallback itself.
const ANCHOR_2026 = "2026-01-01";
const ANCHOR_2028 = "2028-01-01";

export const DUE_STATE_FIXTURES: DueStateFixture[] = [
  {
    label: "before due date -> Upcoming",
    dueDate: "2026-01-02", // Friday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-01", // Thursday, one day before due
    expected: { dueState: "Upcoming", calendarIncomplete: false },
  },
  {
    label: "as_of equals due date -> Today",
    dueDate: "2026-01-02", // Friday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-02",
    expected: { dueState: "Today", calendarIncomplete: false },
  },
  {
    label: "Friday due date, weekend does not count toward escalation",
    dueDate: "2026-01-02", // Friday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-05", // Monday: Sat/Sun elapsed, 0 business days
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label: "Friday due date, escalates the 2nd business day after (Wed)",
    dueDate: "2026-01-02", // Friday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-07", // Wednesday: Mon + Tue = 2 business days elapsed
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
  {
    label: "spec §5.2 worked example: Monday due, Escalated starts Thursday",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-08", // Thursday
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
  {
    label: "spec §5.2 worked example: not yet Escalated on Wednesday itself",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-07", // Wednesday: only 1 business day elapsed (Tue)
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label: "single holiday (cuti bersama) shifts the threshold by one day",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026, "2026-01-06"], // Tue is cuti bersama
    asOf: "2026-01-08", // Thursday: only Wed counts (1 business day)
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label:
      "single holiday: Escalated lands one day later than the no-holiday case",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026, "2026-01-06"], // Tue is cuti bersama
    asOf: "2026-01-09", // Friday: Wed + Thu = 2 business days
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
  {
    label: "two consecutive holidays shift the threshold by two full days",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026, "2026-01-06", "2026-01-07"], // Tue+Wed
    asOf: "2026-01-09", // Friday: only Thu counts (1 business day)
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label:
      "two consecutive holidays: Escalated only after both business days after are business days",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026, "2026-01-06", "2026-01-07"], // Tue+Wed
    asOf: "2026-01-12", // Monday next week: Thu + Fri = 2 business days
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
  {
    label: "year-end due date crossing into a year with no calendar data yet",
    dueDate: "2026-12-30", // Wednesday
    workflowStatus: "Open",
    holidays: [ANCHOR_2026], // 2027 intentionally has zero rows
    asOf: "2027-01-04", // Monday
    expected: { dueState: "Escalated", calendarIncomplete: true },
  },
  {
    label: "leap day (2028-02-29) counts as an ordinary business day",
    dueDate: "2028-02-28", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2028],
    asOf: "2028-03-01", // Wednesday: Feb 29 (Tue) = 1 business day
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label: "leap day: Escalated once the day after leap day also elapses",
    dueDate: "2028-02-28", // Monday
    workflowStatus: "Open",
    holidays: [ANCHOR_2028],
    asOf: "2028-03-02", // Thursday: Feb 29 (Tue) + Mar 1 (Wed) = 2
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
  {
    label: "far-future year with zero calendar rows is flagged incomplete",
    dueDate: "2099-01-05", // arbitrary far date, deliberately unimported
    workflowStatus: "Open",
    holidays: [],
    asOf: "2099-01-08",
    expected: { dueState: "Escalated", calendarIncomplete: true },
  },
  {
    label: "Done tasks have no active due state",
    dueDate: "2020-01-01",
    workflowStatus: "Done",
    holidays: [],
    asOf: "2026-07-27",
    expected: { dueState: null, calendarIncomplete: false },
  },
  {
    label: "Cancelled tasks have no active due state",
    dueDate: "2020-01-01",
    workflowStatus: "Cancelled",
    holidays: [],
    asOf: "2026-07-27",
    expected: { dueState: null, calendarIncomplete: false },
  },
  {
    label: "In Progress is still an active workflow state (Overdue applies)",
    dueDate: "2026-01-02", // Friday
    workflowStatus: "In Progress",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-05", // Monday
    expected: { dueState: "Overdue", calendarIncomplete: false },
  },
  {
    label:
      "Waiting External is still an active workflow state (Escalated applies)",
    dueDate: "2026-01-05", // Monday
    workflowStatus: "Waiting External",
    holidays: [ANCHOR_2026],
    asOf: "2026-01-08", // Thursday
    expected: { dueState: "Escalated", calendarIncomplete: false },
  },
];
