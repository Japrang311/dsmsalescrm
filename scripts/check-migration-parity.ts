// Guards against the failure that shipped on 2026-08-05: application code that
// calls a new RPC reached production while its migration was still local-only,
// so pipeline stage moves and follow-up logging failed for real users.
//
// Requires SUPABASE_DB_URL pointing at the production database (read-only
// query against supabase_migrations.schema_migrations). Pass --warn-only to
// report drift without failing, which is what pull requests use: a PR is
// allowed to add a migration that production has not been given yet.

import { readdir } from "node:fs/promises";
import { SQL } from "bun";

import {
  compareMigrationVersions,
  localMigrationVersions,
} from "./migration-parity";

const warnOnly = process.argv.includes("--warn-only");
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error(
    "SUPABASE_DB_URL is not set — cannot compare local migrations against production.",
  );
  process.exit(warnOnly ? 0 : 1);
}

const local = localMigrationVersions(await readdir("supabase/migrations"));

const sql = new SQL(databaseUrl);
let remote: string[];
try {
  const rows = await sql<{ version: string }[]>`
    select version from supabase_migrations.schema_migrations order by version
  `;
  remote = rows.map((row) => row.version);
} finally {
  await sql.close();
}

const { missingOnRemote, extraOnRemote } = compareMigrationVersions(
  local,
  remote,
);

console.log(`Local migrations: ${local.length}`);
console.log(`Remote migrations: ${remote.length}`);

if (missingOnRemote.length === 0 && extraOnRemote.length === 0) {
  console.log("Migration parity OK — production schema matches this commit.");
  process.exit(0);
}

if (missingOnRemote.length > 0) {
  console.error(
    `\n${missingOnRemote.length} migration(s) exist locally but NOT in production:`,
  );
  for (const version of missingOnRemote) console.error(`  - ${version}`);
  console.error(
    "Code depending on these will fail in production. Apply them with an explicit\n" +
      "owner-approved `supabase db push --linked` before or right after deploying.",
  );
}

if (extraOnRemote.length > 0) {
  console.error(
    `\n${extraOnRemote.length} migration row(s) exist in production but have no local file:`,
  );
  for (const version of extraOnRemote) console.error(`  - ${version}`);
  console.error(
    "This blocks future pushes. Usually caused by applying a migration through the\n" +
      "dashboard/MCP in addition to the local file; repair with\n" +
      "`supabase migration repair --status reverted <version>` once confirmed duplicate.",
  );
}

process.exit(warnOnly ? 0 : 1);
