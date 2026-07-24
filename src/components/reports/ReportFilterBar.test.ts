import { describe, expect, test } from "bun:test";

import { filterClientOptions } from "./client-filter";

const clients = [
  { id: "3", name: "PT Zeta Industri" },
  { id: "1", name: "Alpha Manufacturing" },
  { id: "2", name: "Beta Teknik" },
];

describe("filterClientOptions", () => {
  test("sorts all clients alphabetically when the query is empty", () => {
    expect(
      filterClientOptions(clients, "").map((client) => client.name),
    ).toEqual(["Alpha Manufacturing", "Beta Teknik", "PT Zeta Industri"]);
  });

  test("matches a partial client name without case sensitivity", () => {
    expect(
      filterClientOptions(clients, "MANU").map((client) => client.name),
    ).toEqual(["Alpha Manufacturing"]);
  });

  test("ignores surrounding whitespace in the query", () => {
    expect(
      filterClientOptions(clients, "  teknik  ").map((client) => client.name),
    ).toEqual(["Beta Teknik"]);
  });
});
