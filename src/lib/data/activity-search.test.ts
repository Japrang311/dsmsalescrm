import { describe, expect, test } from "bun:test";
import { matchesActivitySearch } from "./activity-search";

describe("matchesActivitySearch", () => {
  test("finds a team_member_created event by its Indonesian kind label when its title is technical", () => {
    const found = matchesActivitySearch(
      {
        title: "team_member_created",
        kindLabel: "Anggota Tim Dibuat",
      },
      "Anggota Tim Dibuat",
      "Administrasi Tim & Role",
    );

    expect(found).toBe(true);
  });
});
