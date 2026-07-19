import { describe, expect, test } from "bun:test";

import * as TopBarModule from "./TopBar";

type QuickCreateItem = { kind: string; label: string };

describe("Quick Create menu", () => {
  test("exposes the six approved kind-label pairs", () => {
    const items = (
      TopBarModule as unknown as {
        QUICK_CREATE_ITEMS?: readonly QuickCreateItem[];
      }
    ).QUICK_CREATE_ITEMS;

    expect(items).toEqual([
      { kind: "followup", label: "New Follow Up" },
      { kind: "client", label: "New Client" },
      { kind: "rfq", label: "New RFQ" },
      { kind: "quotation", label: "New Quotation" },
      { kind: "so", label: "Record Sales Order" },
      { kind: "prototype", label: "New Prototype Request" },
    ]);
  });
});
