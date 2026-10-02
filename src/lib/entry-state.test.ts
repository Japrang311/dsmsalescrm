import { describe, expect, test } from "bun:test";

import { readEntryState, writeEntryState } from "@/lib/entry-state";

describe("entry state", () => {
  test("returns what was written for the same history entry", () => {
    const range = { from: new Date("2026-01-01"), to: new Date("2026-02-01") };
    writeEntryState("entry-a", "range", range);

    expect(readEntryState("entry-a", "range")).toEqual({ value: range });
  });

  test("keeps entries and field names separate", () => {
    writeEntryState("entry-b", "query", "abadi");

    expect(readEntryState("entry-c", "query")).toBeUndefined();
    expect(readEntryState("entry-b", "owner")).toBeUndefined();
  });

  test("distinguishes a stored falsy value from nothing stored", () => {
    writeEntryState("entry-d", "overdueOnly", false);
    writeEntryState("entry-d", "owner", null);

    expect(readEntryState("entry-d", "overdueOnly")).toEqual({ value: false });
    expect(readEntryState("entry-d", "owner")).toEqual({ value: null });
  });

  test("ignores a missing entry key", () => {
    writeEntryState(undefined, "query", "x");

    expect(readEntryState(undefined, "query")).toBeUndefined();
  });

  test("forgets the oldest entry once the cap is exceeded", () => {
    writeEntryState("cap-first", "query", "x");
    for (let i = 0; i < 200; i++) writeEntryState(`cap-${i}`, "query", i);

    expect(readEntryState("cap-first", "query")).toBeUndefined();
    expect(readEntryState("cap-199", "query")).toEqual({ value: 199 });
  });
});
