import { readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

type AssetRow = {
  path: string;
  bytes: number;
};

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkFiles(path);
      if (entry.isFile()) return [path];
      return [];
    }),
  );
  return nested.flat();
}

async function fileRows(root: string, suffix?: string): Promise<AssetRow[]> {
  const files = await walkFiles(root).catch(() => []);
  const rows = await Promise.all(
    files
      .filter((file) => (suffix ? file.endsWith(suffix) : true))
      .map(async (file) => ({
        path: relative(process.cwd(), file),
        bytes: (await stat(file)).size,
      })),
  );
  return rows.sort((a, b) => b.bytes - a.bytes);
}

const staticRoot = ".vercel/output/static";
const serverRoot = ".vercel/output/functions";
const outputPath =
  process.env.BUNDLE_REPORT_PATH ?? "artifacts/bundle-report.json";

const jsAssets = await fileRows(staticRoot, ".js");
const cssAssets = await fileRows(staticRoot, ".css");
const serverFiles = await fileRows(serverRoot, ".mjs");

const report = {
  generatedAt: new Date().toISOString(),
  staticRoot,
  serverRoot,
  totals: {
    jsFiles: jsAssets.length,
    cssFiles: cssAssets.length,
    serverMjsFiles: serverFiles.length,
    jsBytes: jsAssets.reduce((sum, row) => sum + row.bytes, 0),
    cssBytes: cssAssets.reduce((sum, row) => sum + row.bytes, 0),
    serverMjsBytes: serverFiles.reduce((sum, row) => sum + row.bytes, 0),
  },
  largestJsAssets: jsAssets.slice(0, 15),
  largestCssAssets: cssAssets.slice(0, 5),
  largestServerFiles: serverFiles.slice(0, 10),
};

await mkdir("artifacts", { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
