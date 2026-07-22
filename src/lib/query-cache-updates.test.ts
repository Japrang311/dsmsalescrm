import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";

import { cacheListRecord } from "./query-cache-updates";

describe("cacheListRecord", () => {
  test("upserts into the exact list cache only", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["clients", "all"], [{ id: "old" }]);
    queryClient.setQueryData(
      ["clients", "rows"],
      [{ client: { id: "old" }, ownerName: "Owner" }],
    );

    cacheListRecord(queryClient, ["clients", "all"], { id: "new" });

    expect(
      queryClient.getQueryData<{ id: string }[]>(["clients", "all"]),
    ).toEqual([{ id: "new" }, { id: "old" }]);
    expect(
      queryClient.getQueryData<{ client: { id: string }; ownerName: string }[]>(
        ["clients", "rows"],
      ),
    ).toEqual([{ client: { id: "old" }, ownerName: "Owner" }]);
  });
});
