import type { QueryClient } from "@tanstack/react-query";

function upsertById<T extends { id: string }>(items: T[] | undefined, item: T) {
  if (!items) return items;
  const withoutExisting = items.filter((existing) => existing.id !== item.id);
  return [item, ...withoutExisting];
}

export function cacheListRecord<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  record: T,
) {
  queryClient.setQueriesData<T[]>({ queryKey, exact: true }, (items) =>
    upsertById(items, record),
  );
}
