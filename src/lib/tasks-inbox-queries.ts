import { useInfiniteQuery } from "@tanstack/react-query";
import {
  listTasksPage,
  type TaskHistoryView,
  type TaskListFilters,
} from "@/lib/data/tasks";
import { listQueryKey } from "@/lib/pagination-contracts";

const TASKS_INBOX_HISTORY_PAGE_SIZE = 25;

export function useTasksInboxHistory(input: {
  view: TaskHistoryView;
  filters: TaskListFilters;
  enabled: boolean;
}) {
  return useInfiniteQuery({
    queryKey: listQueryKey("tasks", "page", {
      filters: { ...input.filters, view: input.view },
    }),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listTasksPage({
        view: input.view,
        filters: input.filters,
        page: {
          pageSize: TASKS_INBOX_HISTORY_PAGE_SIZE,
          cursor: pageParam,
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: input.enabled,
  });
}
