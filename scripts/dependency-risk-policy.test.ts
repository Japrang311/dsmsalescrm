import { describe, expect, test } from "bun:test";

import {
  evaluateDependencyRisk,
  type Advisory,
  type AuditJson,
  type DependencyRiskException,
} from "./dependency-risk-policy";

function advisory(
  id: number,
  severity: Advisory["severity"],
  title = "Fixture advisory",
): Advisory {
  return {
    id,
    severity,
    title,
    url: `https://example.test/advisories/${id}`,
    vulnerable_versions: "<1.0.0",
  };
}

function exception(
  advisoryId: number,
  overrides: Partial<DependencyRiskException> = {},
): DependencyRiskException {
  return {
    package: "fixture-package",
    advisoryId,
    owner: "Security Owner",
    reason: "Fixture exception for a non-runtime dependency path.",
    expiresOn: "2026-09-09",
    ...overrides,
  };
}

describe("evaluateDependencyRisk", () => {
  test("returns no failures for a clean audit result", () => {
    const result = evaluateDependencyRisk(
      {},
      [],
      new Date("2026-08-09T00:00:00.000Z"),
    );

    expect(result.counts).toMatchObject({
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
    });
    expect(result.failures).toEqual([]);
    expect(result.accepted).toEqual([]);
  });

  test("fails High advisories without an exception", () => {
    const audit: AuditJson = {
      "fixture-package": [advisory(1001, "high")],
    };

    const result = evaluateDependencyRisk(
      audit,
      [],
      new Date("2026-08-09T00:00:00.000Z"),
    );

    expect(result.counts.high).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      reason: "missing exception",
      advisory: { package: "fixture-package", id: 1001 },
    });
  });

  test("accepts High advisories with a current complete exception", () => {
    const audit: AuditJson = {
      "fixture-package": [advisory(1001, "high")],
    };

    const result = evaluateDependencyRisk(
      audit,
      [exception(1001)],
      new Date("2026-08-09T00:00:00.000Z"),
    );

    expect(result.failures).toEqual([]);
    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].exception).toMatchObject({
      advisoryId: 1001,
      owner: "Security Owner",
    });
  });

  test("fails expired exceptions", () => {
    const audit: AuditJson = {
      "fixture-package": [advisory(1001, "high")],
    };

    const result = evaluateDependencyRisk(
      audit,
      [exception(1001, { expiresOn: "2026-08-08" })],
      new Date("2026-08-09T00:00:00.000Z"),
    );

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      reason: "exception expired on 2026-08-08",
      advisory: { package: "fixture-package", id: 1001 },
    });
    expect(result.accepted).toEqual([]);
  });

  test("does not block Moderate advisories", () => {
    const audit: AuditJson = {
      "fixture-package": [advisory(1001, "moderate")],
    };

    const result = evaluateDependencyRisk(
      audit,
      [],
      new Date("2026-08-09T00:00:00.000Z"),
    );

    expect(result.counts.moderate).toBe(1);
    expect(result.failures).toEqual([]);
  });
});
