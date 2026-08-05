import { describe, test, expect } from "bun:test";
import {
  computeTaskDueState,
  previewBusinessCalendarCsv,
} from "./business-calendar";
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

describe("previewBusinessCalendarCsv", () => {
  test("parses valid CSV rows and summarizes affected years", () => {
    const preview = previewBusinessCalendarCsv(`holiday_date,label,source
2026-01-01,Tahun Baru,manual
2027-03-12,"Cuti bersama, contoh",government`);

    expect(preview.errors).toEqual([]);
    expect(preview.validRows).toEqual([
      {
        holidayDate: "2026-01-01",
        label: "Tahun Baru",
        source: "manual",
      },
      {
        holidayDate: "2027-03-12",
        label: "Cuti bersama, contoh",
        source: "government",
      },
    ]);
    expect(preview.affectedYears).toEqual([2026, 2027]);
  });

  test("rejects duplicate dates before import", () => {
    const preview = previewBusinessCalendarCsv(`tanggal,nama
2026-01-01,Tahun Baru
2026-01-01,Duplikat`);

    expect(preview.duplicateDates).toEqual(["2026-01-01"]);
    expect(preview.errors).toContain("Tanggal duplikat: 2026-01-01.");
  });

  test("reports invalid dates and missing labels", () => {
    const preview = previewBusinessCalendarCsv(`holiday_date,label
2026-99-99,Tanggal salah
2026-01-02,`);

    expect(preview.validRows).toEqual([]);
    expect(preview.errors).toEqual([
      "Baris 2: tanggal harus format YYYY-MM-DD.",
      "Baris 3: label wajib diisi.",
    ]);
  });
});
