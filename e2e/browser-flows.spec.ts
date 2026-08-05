import { expect, test } from "@playwright/test";

import {
  NUR_CLIENT_ID,
  USERS,
  collectConsoleIssues,
  expectNoConsoleIssues,
  signIn,
  tomorrowIsoDate,
} from "./fixtures";

test("login protects the app and dashboard export downloads a CSV", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, USERS.manager);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Leli Al Sales Manager/ }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  await page
    .getByRole("menuitem", { name: "Monthly revenue vs target" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  expectNoConsoleIssues(consoleIssues);
});

test("sales can create a Task, reload, and mark it Done", async ({ page }) => {
  const consoleIssues = collectConsoleIssues(page);
  const title = `E2E Task ${Date.now()}`;

  await signIn(page, USERS.sales);
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "My Tasks" })).toBeVisible();

  await page.getByRole("button", { name: /Buat Task/ }).click();
  await page.getByLabel("Judul task").fill(title);
  await page.locator("#dueDate").fill(tomorrowIsoDate());
  await page.getByRole("button", { name: "Simpan Task" }).click();
  await expect(page.getByText("Task dibuat")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /UPCOMING/i }).click();
  const taskRow = page.locator("li").filter({ hasText: title });
  await expect(taskRow).toBeVisible();

  await taskRow.getByRole("button", { name: /Done/ }).click();
  await expect(page.getByText("Task diselesaikan")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /COMPLETED/i }).click();
  await expect(page.locator("li").filter({ hasText: title })).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("sales can record a client follow-up that survives reload", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const note = `E2E follow-up note ${Date.now()}`;

  await signIn(page, USERS.sales);
  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await expect(
    page.getByRole("heading", { name: /CV\. ABADI TECHNIC/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Add Follow Up/ }).click();
  await page.getByLabel("Catatan").fill(note);
  await page
    .getByLabel("Next action", { exact: true })
    .fill("Hubungi ulang dari browser E2E");
  await page.locator("#nextActionDate").fill(tomorrowIsoDate());
  await page.getByRole("button", { name: "Simpan Follow Up" }).click();
  await expect(page.getByText("Follow up tercatat")).toBeVisible();

  await page.reload();
  await expect(page.getByText(note)).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("executive protected route remains read-only for Task creation", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);

  await signIn(page, USERS.executive);
  await page.goto("/tasks");

  await expect(
    page.getByRole("heading", { name: "Executive Exceptions" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Buat Task/ })).toHaveCount(0);
  await expect(page.getByText("Top Executive")).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});
