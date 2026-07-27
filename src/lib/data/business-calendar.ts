// TypeScript mirror of the database due-state engine added by
// supabase/migrations/20260727130000_add_business_calendar.sql
// (public.is_business_day / count_business_days_strictly_between /
// business_calendar_incomplete / compute_task_due_state). Sales Task
// Control Loop implementation-plan Task 4 / project-tracker Task 49.
//
// Every function here works on plain "YYYY-MM-DD" date strings, never
// `Date` objects, and never reads the local machine's timezone -- the
// existing bugs this replaces (src/routes/_app.tasks.tsx's bucketFor(),
// and 8+ other setDate() call sites) came from ad hoc Date arithmetic
// drifting across timezones and DST-less assumptions. Business-day/holiday
// arithmetic here is pure string/date-string comparison so it matches the
// database function exactly for the same inputs (spec §5.2, §5.3 —
// "identik untuk fungsi due-state di database maupun turunan
// TypeScript-nya").
import { supabase } from "@/lib/supabase";

export type TaskWorkflowStatus =
  | "Open"
  | "In Progress"
  | "Waiting External"
  | "Done"
  | "Cancelled";

export type DueState = "Upcoming" | "Today" | "Overdue" | "Escalated" | null;

export type DueStateResult = {
  dueState: DueState;
  calendarIncomplete: boolean;
};

function isoDayOfWeek(iso: string): number {
  // 1 = Monday .. 7 = Sunday, matching Postgres extract(isodow from date).
  const jsDay = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function addIsoDays(iso: string, days: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ISO "YYYY-MM-DD" strings sort lexicographically in calendar order.
function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBusinessDay(
  iso: string,
  holidays: ReadonlySet<string>,
): boolean {
  const dow = isoDayOfWeek(iso);
  return dow >= 1 && dow <= 5 && !holidays.has(iso);
}

export function countBusinessDaysStrictlyBetween(
  startIso: string,
  endIso: string,
  holidays: ReadonlySet<string>,
): number {
  let count = 0;
  let cursor = addIsoDays(startIso, 1);
  while (compareIsoDates(cursor, endIso) < 0) {
    if (isBusinessDay(cursor, holidays)) count++;
    cursor = addIsoDays(cursor, 1);
  }
  return count;
}

export function businessCalendarIncomplete(
  startIso: string,
  endIso: string,
  holidays: ReadonlySet<string>,
): boolean {
  const years = new Set(Array.from(holidays, (d) => d.slice(0, 4)));
  const startYear = Number(startIso.slice(0, 4));
  const endYear = Number(endIso.slice(0, 4));
  const lo = Math.min(startYear, endYear);
  const hi = Math.max(startYear, endYear);
  for (let year = lo; year <= hi; year++) {
    if (!years.has(String(year))) return true;
  }
  return false;
}

// Mirrors public.compute_task_due_state() exactly (spec §2.2, §5.2):
// Upcoming/Today/Overdue/Escalated for active Tasks, null for Done/
// Cancelled, and a calendarIncomplete flag that callers must surface
// rather than silently trust (spec §5.5) when a spanned year has no
// holiday rows at all.
export function computeTaskDueState(
  dueDate: string,
  workflowStatus: TaskWorkflowStatus,
  holidays: ReadonlySet<string>,
  asOf: string,
): DueStateResult {
  if (workflowStatus === "Done" || workflowStatus === "Cancelled") {
    return { dueState: null, calendarIncomplete: false };
  }

  const calendarIncomplete = businessCalendarIncomplete(
    dueDate,
    asOf,
    holidays,
  );
  const comparison = compareIsoDates(asOf, dueDate);

  if (comparison < 0) {
    return { dueState: "Upcoming", calendarIncomplete };
  }
  if (comparison === 0) {
    return { dueState: "Today", calendarIncomplete };
  }
  const businessDaysElapsed = countBusinessDaysStrictlyBetween(
    dueDate,
    asOf,
    holidays,
  );
  return {
    dueState: businessDaysElapsed >= 2 ? "Escalated" : "Overdue",
    calendarIncomplete,
  };
}

// The current date in Asia/Jakarta as "YYYY-MM-DD", independent of the
// machine's local timezone -- unlike src/lib/app-time.ts's NOW/
// PINNED_TODAY, which use the browser/server's local time and are out of
// scope for Task 6 to change (they're used pervasively for unrelated
// "today" concerns across Dashboard/Reports).
export function todayInJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Reads the canonical calendar table (spec §5.3) as a plain Set of
// "YYYY-MM-DD" holiday_date strings for use with the pure functions above.
export async function listBusinessCalendarHolidays(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("business_calendar_holidays")
    .select("holiday_date");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.holiday_date as string));
}
