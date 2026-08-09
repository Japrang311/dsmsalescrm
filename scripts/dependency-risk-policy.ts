export type AdvisorySeverity = "low" | "moderate" | "high" | "critical";

export type Advisory = {
  id: number;
  url: string;
  title: string;
  severity: AdvisorySeverity;
  vulnerable_versions: string;
};

export type AuditJson = Record<string, Advisory[]>;

export type DependencyRiskException = {
  package: string;
  advisoryId: number;
  owner: string;
  reason: string;
  expiresOn: string;
};

export type AdvisoryRow = Advisory & {
  package: string;
};

export type PolicyFinding = {
  advisory: AdvisoryRow;
  reason: string;
};

export type PolicyResult = {
  advisories: AdvisoryRow[];
  counts: Record<AdvisorySeverity, number>;
  accepted: Array<{
    advisory: AdvisoryRow;
    exception: DependencyRiskException;
  }>;
  failures: PolicyFinding[];
};

export const severityOrder = ["critical", "high", "moderate", "low"] as const;
const blockingSeverities = new Set<AdvisorySeverity>(["critical", "high"]);

export const dependencyRiskExceptions: DependencyRiskException[] = [
  {
    package: "brace-expansion",
    advisoryId: 1130588,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
  {
    package: "brace-expansion",
    advisoryId: 1130591,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
  {
    package: "brace-expansion",
    advisoryId: 1130734,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
  {
    package: "brace-expansion",
    advisoryId: 1130737,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
  {
    package: "brace-expansion",
    advisoryId: 1123897,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
  {
    package: "brace-expansion",
    advisoryId: 1123898,
    owner: "Project Owner",
    reason:
      "Build/lint tooling only; no production user-controlled glob/brace pattern path. Review when parent tooling removes minimatch@3 or safe nested pinning is available.",
    expiresOn: "2026-09-09",
  },
];

export function flattenAdvisories(audit: AuditJson): AdvisoryRow[] {
  return Object.entries(audit).flatMap(([pkg, rows]) =>
    rows.map((row) => ({ package: pkg, ...row })),
  );
}

export function sortAdvisories(advisories: AdvisoryRow[]): AdvisoryRow[] {
  return [...advisories].sort((a, b) => {
    const severityDiff =
      severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (severityDiff !== 0) return severityDiff;
    const packageDiff = a.package.localeCompare(b.package);
    if (packageDiff !== 0) return packageDiff;
    return a.id - b.id;
  });
}

export function evaluateDependencyRisk(
  audit: AuditJson,
  exceptions: DependencyRiskException[],
  asOf = new Date(),
): PolicyResult {
  const advisories = sortAdvisories(flattenAdvisories(audit));
  const counts = Object.fromEntries(
    severityOrder.map((severity) => [
      severity,
      advisories.filter((row) => row.severity === severity).length,
    ]),
  ) as Record<AdvisorySeverity, number>;
  const today = asOf.toISOString().slice(0, 10);
  const accepted: PolicyResult["accepted"] = [];
  const failures: PolicyFinding[] = [];

  for (const advisory of advisories) {
    if (!blockingSeverities.has(advisory.severity)) continue;

    const matchingException = exceptions.find(
      (exception) =>
        exception.package === advisory.package &&
        exception.advisoryId === advisory.id,
    );

    if (!matchingException) {
      failures.push({ advisory, reason: "missing exception" });
      continue;
    }

    if (
      !matchingException.owner ||
      !matchingException.reason ||
      !matchingException.expiresOn
    ) {
      failures.push({ advisory, reason: "incomplete exception metadata" });
      continue;
    }

    if (matchingException.expiresOn < today) {
      failures.push({
        advisory,
        reason: `exception expired on ${matchingException.expiresOn}`,
      });
      continue;
    }

    accepted.push({ advisory, exception: matchingException });
  }

  return { advisories, counts, accepted, failures };
}
