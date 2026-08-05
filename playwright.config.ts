import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = Number(process.env.E2E_PORT ?? "4173");
const baseURL = `http://${host}:${port}`;
const localSupabaseUrl = "http://127.0.0.1:54321";
const localAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "artifacts/playwright-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ["dot"],
        [
          "html",
          { outputFolder: "artifacts/playwright-report", open: "never" },
        ],
      ]
    : [["list"], ["html", { outputFolder: "artifacts/playwright-report" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `VITE_SUPABASE_URL=${localSupabaseUrl} VITE_SUPABASE_ANON_KEY=${localAnonKey} SUPABASE_URL=${localSupabaseUrl} SUPABASE_ANON_KEY=${localAnonKey} bun run preview -- --host ${host} --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
