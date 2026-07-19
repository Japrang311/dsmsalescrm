import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SOURCE_ROOT = join(import.meta.dir, "..");
const MOCK_ROOT = join(import.meta.dir, "mock");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("Task 22 mock-layer removal", () => {
  test("production source has no imports from lib/mock", () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => !path.includes(`${join("lib", "mock")}/`))
      .filter((path) => path !== import.meta.path)
      .filter((path) => readFileSync(path, "utf8").includes("@/lib/mock"))
      .map((path) => relative(SOURCE_ROOT, path));

    expect(offenders).toEqual([]);
  });

  test("the deprecated mock directory no longer exists", () => {
    expect(existsSync(MOCK_ROOT)).toBe(false);
  });
});
