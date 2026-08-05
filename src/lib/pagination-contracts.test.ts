import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  decodePageCursor,
  encodePageCursor,
  listQueryKey,
  normalizeListPageInput,
  normalizePageSize,
  serializeListFilters,
} from "./pagination-contracts";

describe("pagination contracts", () => {
  test("bounds page size to a safe range", () => {
    expect(normalizePageSize()).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(-10)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizePageSize(10.9)).toBe(10);
    expect(normalizePageSize(999)).toBe(MAX_PAGE_SIZE);
  });

  test("round-trips opaque page cursors", () => {
    const cursor = {
      sortValue: "2026-08-05T09:00:00.000Z",
      id: "a0000000-0000-4000-8000-000000000014",
    };

    const encoded = encodePageCursor(cursor);

    expect(encoded).not.toContain(cursor.id);
    expect(decodePageCursor(encoded)).toEqual(cursor);
    expect(decodePageCursor("not-valid")).toBeNull();
  });

  test("normalizes page input from string cursors", () => {
    const cursor = { sortValue: "PT. A", id: "client-a" };

    expect(
      normalizeListPageInput({
        pageSize: 250,
        cursor: encodePageCursor(cursor),
      }),
    ).toEqual({
      pageSize: MAX_PAGE_SIZE,
      cursor,
    });
  });

  test("serializes filters stably and omits empty values", () => {
    const left = serializeListFilters({
      search: "  abadi ",
      ownerIds: ["sales-2", "sales-1"],
      status: undefined,
      includeDeleted: false,
      empty: "",
    });
    const right = serializeListFilters({
      includeDeleted: false,
      ownerIds: ["sales-1", "sales-2"],
      search: "abadi",
    });

    expect(left).toBe(right);
    expect(left).toBe(
      JSON.stringify({
        includeDeleted: false,
        ownerIds: ["sales-1", "sales-2"],
        search: "abadi",
      }),
    );
  });

  test("keeps differently shaped list caches separate", () => {
    const filters = { ownerId: "sales-1" };
    const cursor = { sortValue: "CV. ABADI TECHNIC", id: "client-1" };

    expect(
      listQueryKey("clients", "page", {
        filters,
        page: { pageSize: 25, cursor },
      }),
    ).not.toEqual(listQueryKey("clients", "all", { filters }));
    expect(listQueryKey("clients", "export", { filters })).not.toEqual(
      listQueryKey("clients", "aggregate", { filters }),
    );
  });

  test("keeps page cursors in the query key for page caches only", () => {
    const cursor = { sortValue: "2026-08-01", id: "task-1" };
    const pageKey = listQueryKey("tasks", "page", {
      page: { pageSize: 25, cursor },
    });
    const allKey = listQueryKey("tasks", "all", {
      page: { pageSize: 25, cursor },
    });

    expect(pageKey[2].cursor).toBe(encodePageCursor(cursor));
    expect(allKey[2].cursor).toBeNull();
    expect(allKey[2].pageSize).toBeNull();
  });
});
