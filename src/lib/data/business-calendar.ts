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

export type BusinessCalendarHoliday = {
  id: string;
  holidayDate: string;
  label: string;
  source: string;
  syncedAt: string;
  enteredBy?: string;
};

export type BusinessCalendarHolidayInput = {
  holidayDate: string;
  label: string;
  source?: string;
};

export type BusinessCalendarImportPreview = {
  validRows: BusinessCalendarHolidayInput[];
  errors: string[];
  duplicateDates: string[];
  affectedYears: number[];
};

export type BusinessCalendarImportResult = {
  importedCount: number;
  minDate?: string;
  maxDate?: string;
  affectedYears: number[];
};

const MISSING_IMPORT_RPC_MESSAGE =
  "RPC import_business_calendar_holidays belum tersedia di database. Apply migration 20260805091908_import_business_calendar_holidays.sql ke Supabase target, lalu coba import ulang.";

type BusinessCalendarHolidayRow = {
  id: string;
  holiday_date: string;
  label: string;
  source: string;
  synced_at: string;
  entered_by: string | null;
};

type BusinessCalendarImportResultRow = {
  imported_count: number;
  min_date: string | null;
  max_date: string | null;
  affected_years: number[] | null;
};

export function businessCalendarDataErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error !== "object" || error === null) return "Unknown error";

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const details =
    "details" in error && typeof error.details === "string"
      ? error.details
      : "";
  const hint =
    "hint" in error && typeof error.hint === "string" ? error.hint : "";
  const combined = [code, message, details, hint].join(" ");

  if (
    code === "PGRST202" ||
    combined.includes("import_business_calendar_holidays")
  ) {
    return MISSING_IMPORT_RPC_MESSAGE;
  }

  return (
    [message, details, hint].filter(Boolean).join(" · ") || "Unknown error"
  );
}

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

function toBusinessCalendarHoliday(
  row: BusinessCalendarHolidayRow,
): BusinessCalendarHoliday {
  return {
    id: row.id,
    holidayDate: row.holiday_date,
    label: row.label,
    source: row.source,
    syncedAt: row.synced_at,
    enteredBy: row.entered_by ?? undefined,
  };
}

export async function listBusinessCalendarHolidayRows(): Promise<
  BusinessCalendarHoliday[]
> {
  const { data, error } = await supabase
    .from("business_calendar_holidays")
    .select("id, holiday_date, label, source, synced_at, entered_by")
    .order("holiday_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as BusinessCalendarHolidayRow[]).map(
    toBusinessCalendarHoliday,
  );
}

export async function deleteBusinessCalendarHoliday(id: string): Promise<void> {
  const { error } = await supabase
    .from("business_calendar_holidays")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function previewBusinessCalendarCsv(
  csv: string,
): BusinessCalendarImportPreview {
  const errors: string[] = [];
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) {
    return {
      validRows: [],
      errors: ["CSV kosong."],
      duplicateDates: [],
      affectedYears: [],
    };
  }

  const first = parseCsvLine(rows[0]).map((cell) => cell.toLowerCase());
  const hasHeader =
    first.includes("holiday_date") ||
    first.includes("date") ||
    first.includes("tanggal");
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const header = hasHeader ? first : ["holiday_date", "label", "source"];
  const dateIndex = Math.max(
    header.indexOf("holiday_date"),
    header.indexOf("date"),
    header.indexOf("tanggal"),
  );
  const labelIndex = Math.max(header.indexOf("label"), header.indexOf("nama"));
  const sourceIndex = header.indexOf("source");

  if (dateIndex < 0 || labelIndex < 0) {
    errors.push(
      "Header CSV harus punya kolom holiday_date/date/tanggal dan label/nama.",
    );
  }

  const validRows: BusinessCalendarHolidayInput[] = [];
  const seenDates = new Map<string, number>();

  dataRows.forEach((line, index) => {
    const lineNumber = hasHeader ? index + 2 : index + 1;
    const cells = parseCsvLine(line);
    const holidayDate = (cells[dateIndex] ?? "").trim();
    const label = (cells[labelIndex] ?? "").trim();
    const source = (sourceIndex >= 0 ? cells[sourceIndex] : undefined)?.trim();

    if (!isIsoDate(holidayDate)) {
      errors.push(`Baris ${lineNumber}: tanggal harus format YYYY-MM-DD.`);
      return;
    }
    if (!label) {
      errors.push(`Baris ${lineNumber}: label wajib diisi.`);
      return;
    }

    seenDates.set(holidayDate, (seenDates.get(holidayDate) ?? 0) + 1);
    validRows.push({
      holidayDate,
      label,
      source: source || "manual-import",
    });
  });

  const duplicateDates = [...seenDates.entries()]
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();
  if (duplicateDates.length > 0) {
    errors.push(`Tanggal duplikat: ${duplicateDates.join(", ")}.`);
  }

  const affectedYears = [
    ...new Set(validRows.map((row) => Number(row.holidayDate.slice(0, 4)))),
  ].sort((a, b) => a - b);

  return {
    validRows,
    errors,
    duplicateDates,
    affectedYears,
  };
}

export async function importBusinessCalendarHolidays(
  rows: BusinessCalendarHolidayInput[],
): Promise<BusinessCalendarImportResult> {
  const { data, error } = await supabase.rpc(
    "import_business_calendar_holidays",
    {
      p_rows: rows.map((row) => ({
        holiday_date: row.holidayDate,
        label: row.label,
        source: row.source ?? "manual-import",
      })),
    },
  );
  if (error) throw new Error(businessCalendarDataErrorMessage(error));

  const [result] = (data ?? []) as BusinessCalendarImportResultRow[];
  return {
    importedCount: result?.imported_count ?? 0,
    minDate: result?.min_date ?? undefined,
    maxDate: result?.max_date ?? undefined,
    affectedYears: result?.affected_years ?? [],
  };
}
