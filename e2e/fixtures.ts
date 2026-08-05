import { expect, type Page } from "@playwright/test";

export const LOCAL_PASSWORD = "seed-local-only";

export const USERS = {
  sales: "nur@local.dsm.test",
  manager: "leli@local.dsm.test",
  executive: "executive@local.dsm.test",
} as const;

export const NUR_CLIENT_ID = "a0000000-0000-4000-8000-000000000014";

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
