import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import { cacheListRecord } from "./query-cache-updates";
import { listQueryKey } from "./pagination-contracts";

describe("cacheListRecord", () => {
  test("upserts into exact list caches without touching paginated client rows", () => {
    const queryClient = new QueryClient();
    const clientRowsPageKey = listQueryKey("clients", "page", {
      filters: { search: "abadi", ownerId: "sales-1" },
      page: { pageSize: 10, cursor: null },
    });
    queryClient.setQueryData(["clients", "all"], [{ id: "old" }]);
    queryClient.setQueryData(["clients", "search"], [{ id: "old" }]);
    queryClient.setQueryData(clientRowsPageKey, {
      rows: [
        {
          client: { id: "old" },
          ownerName: "Owner",
        },
      ],
      totalCount: 1,
      nextCursor: null,
    });

    cacheListRecord(queryClient, ["clients", "all"], { id: "new" });
    cacheListRecord(queryClient, ["clients", "search"], { id: "new" });

    expect(
      queryClient.getQueryData<{ id: string }[]>(["clients", "all"]),
    ).toEqual([{ id: "new" }, { id: "old" }]);
    expect(
      queryClient.getQueryData<{ id: string }[]>(["clients", "search"]),
    ).toEqual([{ id: "new" }, { id: "old" }]);
    expect(
      queryClient.getQueryData<{
        rows: { client: { id: string }; ownerName: string }[];
        totalCount: number;
        nextCursor: string | null;
      }>(clientRowsPageKey),
    ).toEqual({
      rows: [{ client: { id: "old" }, ownerName: "Owner" }],
      totalCount: 1,
      nextCursor: null,
    });
  });

  test("does not create a dead exact clients rows cache", () => {
    const queryClient = new QueryClient();
    const deadRowsKey = ["clients", "rows"] as const;
    queryClient.setQueryData(deadRowsKey, [
      { client: { id: "old" }, ownerName: "Owner" },
    ]);

    cacheListRecord(queryClient, ["clients", "all"], { id: "new" });

    expect(
      queryClient.getQueryData<{ client: { id: string }; ownerName: string }[]>(
        deadRowsKey,
      ),
    ).toEqual([{ client: { id: "old" }, ownerName: "Owner" }]);
  });
});
