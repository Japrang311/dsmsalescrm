import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const LOCAL_PASSWORD = "seed-local-only";

export const USERS = {
  sales: "nur@local.dsm.test",
  manager: "leli@local.dsm.test",
  executive: "executive@local.dsm.test",
} as const;

export const NUR_CLIENT_ID = "a0000000-0000-4000-8000-000000000014";
export const LOCAL_SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const LOCAL_SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export async function signIn(
  page: Page,
  email: string,
  password = LOCAL_PASSWORD,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export function collectConsoleIssues(page: Page) {
  const issues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });
  return issues;
}

export function expectNoConsoleIssues(issues: string[]) {
  expect(issues, issues.join("\n")).toEqual([]);
}

export function tomorrowIsoDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function uniqueToken(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}

export async function authenticatedSupabaseClient(email: string) {
  const client = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: LOCAL_PASSWORD,
  });
  expect(error).toBeNull();
  return client;
}
