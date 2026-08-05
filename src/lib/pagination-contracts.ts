export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PageCursor = {
  sortValue: string;
  id: string;
};

export type ListCacheShape = "all" | "page" | "export" | "aggregate";

export type ListResource =
  | "activity-log"
  | "clients"
  | "commercial-documents"
  | "sales-orders"
  | "tasks"
  | "team-members";

type FilterPrimitive = string | number | boolean | null | undefined;
export type ListFilters = Record<
  string,
  FilterPrimitive | readonly FilterPrimitive[]
>;

export type ListPageInput = {
  pageSize?: number;
  cursor?: PageCursor | string | null;
};

export type NormalizedListPageInput = {
  pageSize: number;
  cursor: PageCursor | null;
};

export function normalizePageSize(pageSize?: number): number {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize)) {
    return DEFAULT_PAGE_SIZE;
  }
  const integer = Math.floor(pageSize);
  if (integer < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(integer, MAX_PAGE_SIZE);
}

export function encodePageCursor(cursor: PageCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(
    "",
  );
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decodePageCursor(
  cursor: string | null | undefined,
): PageCursor | null {
  if (!cursor) return null;
  try {
    const paddedCursor = cursor.padEnd(
      cursor.length + ((4 - (cursor.length % 4)) % 4),
      "=",
    );
    const binary = atob(paddedCursor.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    const parsed = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as Partial<PageCursor>;
    if (
      typeof parsed.sortValue !== "string" ||
      parsed.sortValue.length === 0 ||
      typeof parsed.id !== "string" ||
      parsed.id.length === 0
    ) {
      return null;
    }
    return { sortValue: parsed.sortValue, id: parsed.id };
  } catch {
    return null;
  }
}

export function normalizeListPageInput(
  input: ListPageInput = {},
): NormalizedListPageInput {
  const cursor =
    typeof input.cursor === "string"
      ? decodePageCursor(input.cursor)
      : (input.cursor ?? null);
  return {
    pageSize: normalizePageSize(input.pageSize),
    cursor,
  };
}

function normalizedFilterValue(
  value: FilterPrimitive | readonly FilterPrimitive[],
): FilterPrimitive | FilterPrimitive[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!Array.isArray(value)) return value as FilterPrimitive;

  const normalized = [...value]
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter((item): item is Exclude<FilterPrimitive, undefined> => {
      if (item === undefined) return false;
      return typeof item !== "string" || item.length > 0;
    })
    .sort((a, b) => String(a).localeCompare(String(b)));

  return normalized.length > 0 ? normalized : undefined;
}

export function serializeListFilters(filters: ListFilters = {}): string {
  const normalizedEntries = Object.entries(filters)
    .map(([key, value]) => [key, normalizedFilterValue(value)] as const)
    .filter(
      (
        entry,
      ): entry is readonly [string, Exclude<(typeof entry)[1], undefined>] =>
        entry[1] !== undefined,
    )
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(Object.fromEntries(normalizedEntries));
}

export function listQueryKey(
  resource: ListResource,
  shape: ListCacheShape,
  options: {
    filters?: ListFilters;
    page?: ListPageInput;
  } = {},
) {
  const page = normalizeListPageInput(options.page);
  return [
    resource,
    shape,
    {
      filters: serializeListFilters(options.filters),
      pageSize: shape === "page" ? page.pageSize : null,
      cursor:
        shape === "page" && page.cursor ? encodePageCursor(page.cursor) : null,
    },
  ] as const;
}
