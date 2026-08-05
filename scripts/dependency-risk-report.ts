import { mkdir, writeFile } from "node:fs/promises";

type Advisory = {
  id: number;
  url: string;
  title: string;
  severity: "low" | "moderate" | "high" | "critical";
  vulnerable_versions: string;
};

type AuditJson = Record<string, Advisory[]>;

const outputPath =
  process.env.DEPENDENCY_RISK_REPORT_PATH ??
  "artifacts/dependency-risk-report.md";

async function readAudit(): Promise<AuditJson> {
  const proc = Bun.spawn({
    cmd: ["bun", "audit", "--json"],
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) {
    throw new Error(`bun audit did not return JSON. stderr: ${stderr}`);
  }

  return JSON.parse(stdout.slice(jsonStart)) as AuditJson;
}

const audit = await readAudit();
const advisories = Object.entries(audit).flatMap(([pkg, rows]) =>
  rows.map((row) => ({ package: pkg, ...row })),
);

const severityOrder = ["critical", "high", "moderate", "low"] as const;
const counts = Object.fromEntries(
  severityOrder.map((severity) => [
    severity,
    advisories.filter((row) => row.severity === severity).length,
  ]),
);

const lines = [
  "# Dependency Risk Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Total advisories: ${advisories.length}`,
  `- Critical: ${counts.critical}`,
  `- High: ${counts.high}`,
  `- Moderate: ${counts.moderate}`,
  `- Low: ${counts.low}`,
  "",
  "## Advisories",
  "",
  "| Package | Severity | Advisory | Vulnerable versions |",
  "| --- | --- | --- | --- |",
  ...advisories
    .sort((a, b) => {
      const severityDiff =
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
      if (severityDiff !== 0) return severityDiff;
      return a.package.localeCompare(b.package);
    })
    .map(
      (row) =>
        `| ${row.package} | ${row.severity} | [${row.id}](${row.url}) ${row.title.replaceAll("|", "\\|")} | ${row.vulnerable_versions.replaceAll("|", "\\|")} |`,
    ),
  "",
  "## Policy",
  "",
  "- This report is an artifact, not an approval to ignore vulnerabilities.",
  "- Upgrade or exception decisions must be recorded in a dated report with owner and expiry.",
  "- Do not commit production secrets or CI secrets to satisfy dependency tooling.",
  "",
];

await mkdir("artifacts", { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
