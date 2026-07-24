import { describe, expect, test } from "bun:test";
import {
  canShowDeletedMode,
  commercialItemsQueryKey,
  salesOrdersQueryKey,
} from "./deleted-mode";

describe("deleted-list mode contracts", () => {
  test("is available to operational roles but hidden from Executive", () => {
    expect(canShowDeletedMode("sales")).toBe(true);
    expect(canShowDeletedMode("manager")).toBe(true);
    expect(canShowDeletedMode("super_admin")).toBe(true);
    expect(canShowDeletedMode("executive")).toBe(false);
  });

  test("uses distinct exact cache keys for active and deleted records", () => {
    expect(commercialItemsQueryKey(false)).toEqual(["commercial-items", "all"]);
    expect(commercialItemsQueryKey(true)).toEqual([
      "commercial-items",
      "deleted",
    ]);
    expect(salesOrdersQueryKey(false)).toEqual(["sales-orders", "all"]);
    expect(salesOrdersQueryKey(true)).toEqual(["sales-orders", "deleted"]);
  });
});
