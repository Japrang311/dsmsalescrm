import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  dependencyRiskExceptions,
  evaluateDependencyRisk,
  type AuditJson,
} from "./dependency-risk-policy";

const outputPath =
  process.env.DEPENDENCY_RISK_REPORT_PATH ??
  "artifacts/dependency-risk-report.md";

async function readAudit(): Promise<{ audit: AuditJson; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: ["bun", "audit", "--json"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(`bun audit did not return JSON. stderr: ${stderr}`);
  }

  return {
    audit: JSON.parse(stdout.slice(jsonStart)) as AuditJson,
    exitCode,
  };
}

function tableRows(
  rows: Array<{
    package: string;
    severity: string;
    id: number;
    url: string;
    title: string;
    vulnerable_versions: string;
  }>,
): string[] {
  if (rows.length === 0) return ["| - | - | - | - |"];

  return rows.map(
    (row) =>
      `| ${row.package} | ${row.severity} | [${row.id}](${row.url}) ${row.title.replaceAll("|", "\\|")} | ${row.vulnerable_versions.replaceAll("|", "\\|")} |`,
  );
}

try {
  const { audit, exitCode } = await readAudit();
  const result = evaluateDependencyRisk(audit, dependencyRiskExceptions);
  const policyPassed = result.failures.length === 0;

  const lines = [
    "# Dependency Risk Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Policy status: ${policyPassed ? "PASS" : "FAIL"}`,
    `- bun audit exit code: ${exitCode}`,
    `- Total advisories: ${result.advisories.length}`,
    `- Critical: ${result.counts.critical}`,
    `- High: ${result.counts.high}`,
    `- Moderate: ${result.counts.moderate}`,
    `- Low: ${result.counts.low}`,
    `- Accepted exceptions: ${result.accepted.length}`,
    `- Blocking failures: ${result.failures.length}`,
    "",
    "## Blocking Failures",
    "",
    "| Package | Severity | Advisory | Reason |",
    "| --- | --- | --- | --- |",
    ...(result.failures.length === 0
      ? ["| - | - | - | - |"]
      : result.failures.map(
          ({ advisory, reason }) =>
            `| ${advisory.package} | ${advisory.severity} | [${advisory.id}](${advisory.url}) ${advisory.title.replaceAll("|", "\\|")} | ${reason.replaceAll("|", "\\|")} |`,
        )),
    "",
    "## Accepted Exceptions",
    "",
    "| Package | Advisory | Owner | Expires | Reason |",
    "| --- | --- | --- | --- | --- |",
    ...(result.accepted.length === 0
      ? ["| - | - | - | - | - |"]
      : result.accepted.map(
          ({ advisory, exception }) =>
            `| ${advisory.package} | [${advisory.id}](${advisory.url}) | ${exception.owner.replaceAll("|", "\\|")} | ${exception.expiresOn} | ${exception.reason.replaceAll("|", "\\|")} |`,
        )),
    "",
    "## Advisories",
    "",
    "| Package | Severity | Advisory | Vulnerable versions |",
    "| --- | --- | --- | --- |",
    ...tableRows(result.advisories),
    "",
    "## Policy",
    "",
    "- Critical and High advisories fail the gate unless they have an unexpired exception.",
    "- Exceptions must include package, advisory id, owner, reason, and expiry.",
    "- Expired exceptions are treated as failures automatically.",
    "- This report is an artifact, not an approval to ignore vulnerabilities.",
    "- Do not commit production secrets or CI secrets to satisfy dependency tooling.",
    "",
  ];

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));

  if (!policyPassed) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const lines = [
    "# Dependency Risk Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    "- Policy status: FAIL",
    "- Blocking failures: dependency audit command did not produce parseable JSON.",
    "",
    "## Error",
    "",
    message,
    "",
  ];

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  process.exitCode = 1;
}
