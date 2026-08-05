const host = "127.0.0.1";
const port = Number(process.env.RUNTIME_SMOKE_PORT ?? "4173");
const origin = `http://${host}:${port}`;
const timeoutMs = Number(process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? "30000");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${origin}/login`, { redirect: "manual" });
      if (response.status === 200) return;
      lastError = new Error(`Unexpected /login status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw new Error(
    `Preview server did not become ready within ${timeoutMs}ms: ${String(lastError)}`,
  );
}

function assertHeader(
  response: Response,
  header: string,
  expected?: string | RegExp,
) {
  const value = response.headers.get(header);
  if (!value) throw new Error(`Missing required header: ${header}`);
  if (expected instanceof RegExp && !expected.test(value)) {
    throw new Error(`Header ${header} did not match ${expected}: ${value}`);
  }
  if (typeof expected === "string" && value !== expected) {
    throw new Error(`Header ${header} expected ${expected}, got ${value}`);
  }
}

const server = Bun.spawn({
  cmd: ["bun", "run", "preview", "--", "--host", host, "--port", String(port)],
  stdout: "pipe",
  stderr: "pipe",
  env: {
    ...process.env,
    VITE_SUPABASE_URL:
      process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "local-ci",
  },
});

try {
  await waitForServer();

  const login = await fetch(`${origin}/login`, { redirect: "manual" });
  if (login.status !== 200) {
    throw new Error(`/login expected 200, got ${login.status}`);
  }
  assertHeader(login, "content-security-policy");
  assertHeader(login, "x-content-type-options", "nosniff");
  assertHeader(login, "x-frame-options", "DENY");

  const root = await fetch(`${origin}/`, { redirect: "manual" });
  if (root.status !== 307) {
    throw new Error(`/ expected 307 redirect, got ${root.status}`);
  }
  assertHeader(root, "location", "/dashboard");

  console.log(
    JSON.stringify(
      {
        ok: true,
        origin,
        checks: [
          "GET /login 200",
          "GET / 307 /dashboard",
          "security headers present",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  server.kill();
  await server.exited.catch(() => undefined);
}
