import { describe, expect, it } from "bun:test";

import {
  compareMigrationVersions,
  localMigrationVersions,
} from "./migration-parity";

describe("localMigrationVersions", () => {
  it("reads the leading timestamp of each migration file name", () => {
    const versions = localMigrationVersions([
      "20260805034641_add_activity_log_event_data.sql",
      "20260805035004_add_atomic_follow_up_rpcs.sql",
    ]);

    expect(versions).toEqual(["20260805034641", "20260805035004"]);
  });

  it("ignores files that are not timestamped .sql migrations", () => {
    const versions = localMigrationVersions([
      "20260805034641_add_activity_log_event_data.sql",
      "README.md",
      "notes.sql",
      ".DS_Store",
    ]);

    expect(versions).toEqual(["20260805034641"]);
  });

  it("returns versions sorted ascending regardless of directory order", () => {
    const versions = localMigrationVersions([
      "20260805091908_import_business_calendar_holidays.sql",
      "20260803120000_sync_client_next_fu_from_tasks.sql",
    ]);

    expect(versions).toEqual(["20260803120000", "20260805091908"]);
  });
});

describe("compareMigrationVersions", () => {
  it("reports no drift when local and remote match", () => {
    const result = compareMigrationVersions(
      ["20260803120000", "20260805034641"],
      ["20260803120000", "20260805034641"],
    );

    expect(result).toEqual({ missingOnRemote: [], extraOnRemote: [] });
  });

  it("reports local migrations that production has not applied yet", () => {
    const result = compareMigrationVersions(
      ["20260803120000", "20260805034641", "20260805035004"],
      ["20260803120000"],
    );

    expect(result.missingOnRemote).toEqual([
      "20260805034641",
      "20260805035004",
    ]);
    expect(result.extraOnRemote).toEqual([]);
  });

  it("reports remote migration rows that no local file explains", () => {
    const result = compareMigrationVersions(
      ["20260803120000"],
      ["20260803120000", "20260803131106"],
    );

    expect(result.missingOnRemote).toEqual([]);
    expect(result.extraOnRemote).toEqual(["20260803131106"]);
  });

  it("reports drift in both directions at once", () => {
    const result = compareMigrationVersions(
      ["20260803120000", "20260805034641"],
      ["20260803120000", "20260803131106"],
    );

    expect(result.missingOnRemote).toEqual(["20260805034641"]);
    expect(result.extraOnRemote).toEqual(["20260803131106"]);
  });
});
