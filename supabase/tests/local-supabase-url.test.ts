import { describe, expect, test } from "bun:test";

const guardModuleUrl = new URL("../local-supabase-url.ts", import.meta.url)
  .href;
const helpersModuleUrl = new URL("./helpers.ts", import.meta.url).href;
const bootstrapModuleUrl = new URL(
  "../scripts/bootstrap-local-super-admin.ts",
  import.meta.url,
).href;

async function runGuard(candidate: string) {
  const source = [
    `import { requireLocalSupabaseUrl } from ${JSON.stringify(guardModuleUrl)};`,
    `console.log(requireLocalSupabaseUrl(${JSON.stringify(candidate)}));`,
  ].join("\n");
  const child = Bun.spawn([process.execPath, "--eval", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("local Supabase URL guard", () => {
  for (const candidate of [
    "http://127.0.0.1:54321",
    "http://localhost:54321/",
    "http://[::1]:54321",
  ]) {
    test(`accepts exact local origin ${candidate}`, async () => {
      const result = await runGuard(candidate);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^http:\/\//);
    });
  }

  for (const candidate of [
    "https://project.supabase.co",
    "http://127.0.0.1:54322",
    "https://127.0.0.1:54321",
    "http://127.0.0.1:54321/rest/v1",
    "http://127.0.0.1:54321?remote=true",
    "http://user:password@127.0.0.1:54321",
    "not-a-url",
  ]) {
    test(`rejects non-local origin ${candidate}`, async () => {
      const result = await runGuard(candidate);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(
        "Refusing privileged Supabase access outside the approved local origin",
      );
    });
  }

  test("test helpers fail before privileged client setup for a remote URL", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `await import(${JSON.stringify(helpersModuleUrl)})`,
      ],
      {
        env: {
          ...process.env,
          SUPABASE_URL: "https://project.supabase.co",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      "Refusing privileged Supabase access outside the approved local origin",
    );
  });

  test("local Super Admin bootstrap rejects a remote URL before client setup", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `await import(${JSON.stringify(bootstrapModuleUrl)})`,
      ],
      {
        env: {
          ...process.env,
          SUPABASE_URL: "https://project.supabase.co",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      "Refusing privileged Supabase access outside the approved local origin",
    );
  });
});
