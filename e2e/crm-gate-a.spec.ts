import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";

import {
  NUR_CLIENT_ID,
  USER_IDS,
  USERS,
  authenticatedSupabaseClient,
  collectConsoleIssues,
  expectNoConsoleIssues,
  signIn,
} from "./fixtures";

function jakartaDateOffset(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

async function createRepeatOrderClientFixture(
  email: string,
  name: string,
  sampleCount: number,
) {
  const caller = await authenticatedSupabaseClient(email);
  const ownerId = email === USERS.sales ? USER_IDS.sales : USER_IDS.manager;
  const { data: client, error: clientError } = await caller
    .from("clients")
    .insert({
      name,
      status: "Active Customer",
      source: "Repeat",
      owner_id: ownerId,
    })
    .select("id")
    .single();
  expect(clientError).toBeNull();

  const dates = [-240, -210, -180, -150].slice(0, sampleCount);
  for (const [index, dateOffset] of dates.entries()) {
    const orderDate = jakartaDateOffset(dateOffset);
    const { error } = await caller.rpc("create_sales_order", {
      p_client_id: client.id,
      p_date: orderDate,
      p_customer_po_number: `TASK16-PO-${Date.now()}-${index}`,
      p_customer_po_date: orderDate,
      p_type: "Regular",
      p_tax_type: "PPN",
      p_prototype_status: null,
      p_source: "Existing / Repeat Order",
      p_number_mode: "Manual",
      p_manual_so_number: `TASK16-SO-${crypto.randomUUID()}`,
      p_backdate_reason: null,
      p_items: [
        {
          productName: "Synthetic repeat-order item",
          description: "No customer data",
          qty: 1,
          uom: "Unit",
          unitPrice: 125_000,
        },
      ],
      p_source_commercial_document_id: null,
    });
    expect(error).toBeNull();
  }

  return { caller, clientId: client.id as string };
}

test("Reports export uses the same exact scoped snapshot shown by Reports", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  await signIn(page, USERS.manager);
  await page.goto("/reports");

  await expect(
    page.getByRole("heading", { name: "Executive Reports" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Nilai order berbayar yang tercatat, bukan konfirmasi pembayaran diterima/,
    ),
  ).toBeVisible();
  const forecastSection = page.getByRole("region", {
    name: "Forecast Nilai SO",
  });
  await expect(forecastSection.getByText("Snapshot saat ini")).toBeVisible();
  await expect(
    forecastSection.getByText(/Bobot tahap adalah asumsi tetap/),
  ).toBeVisible();

  const exportButton = page.getByRole("button", { name: "Export" });
  await expect(exportButton).toBeEnabled({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();

  const workbook = XLSX.read(await readFile(path!));
  expect(workbook.SheetNames).toContain("Metadata");
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(
    workbook.Sheets.Metadata,
    { header: 1 },
  );
  const valueFor = (label: string) => rows.find((row) => row[0] === label)?.[1];
  expect(valueFor("Basis")).toContain("bukan konfirmasi pembayaran diterima");

  const manager = await authenticatedSupabaseClient(USERS.manager);
  const { data, error } = await manager.rpc("crm_report_metrics", {
    p_from: valueFor("Periode dari"),
    p_to: valueFor("Periode sampai"),
    p_owner_id: null,
    p_client_id: null,
    p_tax_type: null,
    p_so_type: null,
    p_source: null,
  });
  expect(error).toBeNull();
  expect(valueFor("Nilai SO exact")).toBe(data.total);
  const { data: forecast, error: forecastError } = await manager.rpc(
    "crm_forecast_snapshot",
    {
      p_from: valueFor("Periode dari"),
      p_to: valueFor("Periode sampai"),
      p_owner_id: null,
      p_client_id: null,
      p_limit: 100,
      p_offset: 0,
    },
  );
  expect(forecastError).toBeNull();
  expect(valueFor("Forecast mode")).toBe("current");
  expect(valueFor("Pipeline terbobot exact")).toBe(forecast.openPipelineValue);
  expect(valueFor("Forecast exact")).toBe(forecast.forecastValue);
  await expect(forecastSection).toHaveAttribute(
    "data-forecast-value",
    String(forecast.forecastValue),
  );
  await expect(
    page.getByText(String(valueFor("Snapshot")), { exact: false }),
  ).toBeVisible();

  const pdfDownloadPromise = page.waitForEvent("download");
  await exportButton.click();
  await page.getByRole("menuitem", { name: "PDF" }).click();
  const pdfDownload = await pdfDownloadPromise;
  const pdfPath = await pdfDownload.path();
  expect(pdfPath).toBeTruthy();
  expect((await readFile(pdfPath!)).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: /Periode laporan/ }).click();
  await page.getByRole("button", { name: "Bulan lalu" }).click();
  await expect(
    forecastSection.getByText(/Forecast historis tidak tersedia/),
  ).toBeVisible();
  await expect(forecastSection.getByText("Snapshot saat ini")).toHaveCount(0);

  await page.goto("/dashboard");
  const dashboardForecast = page.getByRole("region", {
    name: "Forecast bulan ini",
  });
  await expect(dashboardForecast.getByText(/Snapshot saat ini/)).toBeVisible();
  await expect(dashboardForecast.getByText("Pipeline terbobot")).toBeVisible();
  await expect(
    dashboardForecast.getByText("Forecast", { exact: true }),
  ).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("SO correction preserves a stale draft, reloads, saves, and shows audit", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const sales = await authenticatedSupabaseClient(USERS.sales);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const token = Date.now();
  const { data: created, error: createError } = await sales.rpc(
    "create_sales_order",
    {
      p_client_id: NUR_CLIENT_ID,
      p_date: today,
      p_customer_po_number: `GATE-A-${token}`,
      p_customer_po_date: today,
      p_type: "Regular",
      p_tax_type: "PPN",
      p_prototype_status: null,
      p_source: "Existing / Repeat Order",
      p_number_mode: "Manual",
      p_manual_so_number: `GATE-A-SO-${token}`,
      p_backdate_reason: null,
      p_items: [
        {
          productName: "Synthetic Gate A browser item",
          description: "No customer data",
          qty: 1,
          uom: "Unit",
          unitPrice: 123456,
        },
      ],
      p_source_commercial_document_id: null,
    },
  );
  expect(createError).toBeNull();

  await signIn(page, USERS.sales);
  await page.goto(`/sales-orders/${created.id}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Sales Order" });
  const poInput = dialog.getByPlaceholder("Nomor Customer PO");
  await poInput.fill(`BROWSER-DRAFT-${token}`);
  await dialog.getByLabel("Alasan koreksi").fill("Browser conflict proof");

  const { error: conflictError } = await sales.rpc(
    "correct_sales_order_header",
    {
      p_id: created.id,
      p_expected_updated_at: created.updated_at,
      p_request_id: crypto.randomUUID(),
      p_patch: { customer_po_number: `EXTERNAL-${token}` },
      p_reason: "Synthetic concurrent update",
    },
  );
  expect(conflictError).toBeNull();

  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Gagal menyimpan perubahan")).toBeVisible();
  await expect(page.getByText(/Draft Anda tetap tersedia/)).toBeVisible();
  await expect(poInput).toHaveValue(`BROWSER-DRAFT-${token}`);
  expect(consoleIssues.some((issue) => issue.includes("status of 400"))).toBe(
    true,
  );

  await dialog.getByRole("button", { name: "Muat versi terbaru" }).click();
  await dialog.getByRole("button", { name: "Batal" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const refreshedDialog = page.getByRole("dialog", {
    name: "Edit Sales Order",
  });
  await refreshedDialog
    .getByPlaceholder("Nomor Customer PO")
    .fill(`BROWSER-SAVED-${token}`);
  await refreshedDialog
    .getByLabel("Alasan koreksi")
    .fill("Browser verified correction");
  await refreshedDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Detail Sales Order diperbarui")).toBeVisible();

  await page.reload();
  await expect(
    page.getByText(`BROWSER-SAVED-${token}`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Riwayat koreksi SO" }),
  ).toBeVisible();
  await expect(
    page.getByText("Alasan: Browser verified correction"),
  ).toBeVisible();
  await expect(
    page.getByText("Perubahan sebelum / sesudah").first(),
  ).toBeVisible();

  expectNoConsoleIssues(
    consoleIssues.filter((issue) => !issue.includes("status of 400")),
  );
});

test("repeat-order queue and client summary reconcile, reuse a Task, and store feedback", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const overdueName = `Task 16 Overdue ${token}`;
  const insufficientName = `Task 16 Insufficient ${token}`;
  const otherOwnerName = `Task 16 Other Owner ${token}`;

  const overdue = await createRepeatOrderClientFixture(
    USERS.sales,
    overdueName,
    4,
  );
  const insufficient = await createRepeatOrderClientFixture(
    USERS.sales,
    insufficientName,
    3,
  );
  const otherOwner = await createRepeatOrderClientFixture(
    USERS.manager,
    otherOwnerName,
    0,
  );

  const nextDate = jakartaDateOffset(1);
  const { data: seededProgress, error: taskError } = await overdue.caller.rpc(
    "record_client_follow_up",
    {
      p_client_id: overdue.clientId,
      p_task_id: null,
      p_create_task_title: `Repeat-order fixture ${token}`,
      p_task_due_date: nextDate,
      p_next_action: "Confirm repeat-order timing",
      p_next_action_date: nextDate,
      p_note: "Synthetic active Task for reuse proof",
      p_method: "Phone",
      p_result: "Interested",
      p_fu_date: jakartaDateOffset(0),
      p_workflow_status_target: "In Progress",
    },
  );
  expect(taskError).toBeNull();

  const { count: taskCountBefore, error: taskCountError } = await overdue.caller
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("client_id", overdue.clientId)
    .in("workflow_status", ["Open", "In Progress", "Waiting External"]);
  expect(taskCountError).toBeNull();
  expect(taskCountBefore).toBe(1);

  const { data: apiSnapshot, error: snapshotError } = await overdue.caller.rpc(
    "crm_repeat_order_cadence",
    {
      p_as_of: null,
      p_owner_id: null,
      p_client_status: null,
      p_client_id: null,
      p_limit: 25,
      p_offset: 0,
    },
  );
  expect(snapshotError).toBeNull();

  await signIn(page, USERS.sales);
  await page.goto("/tasks");
  const repeatRegion = page.getByRole("region", {
    name: "Kesehatan repeat-order",
  });
  await expect(repeatRegion).toBeVisible();
  await expect(repeatRegion).toHaveAttribute(
    "data-repeat-order-overdue-count",
    String(apiSnapshot.totals.overdueCount),
  );
  const overdueRow = repeatRegion.getByRole("listitem").filter({
    hasText: overdueName,
  });
  await expect(overdueRow).toContainText("Terlambat");
  await expect(overdueRow).toContainText("Rule d05-v1");

  await overdueRow.getByRole("button", { name: "Catat follow-up" }).click();
  const followUpDialog = page.getByRole("dialog", { name: "Catat Follow Up" });
  await expect(followUpDialog.getByLabel("Task yang diprogress")).toContainText(
    "Progress Task existing",
  );
  await expect(followUpDialog.getByLabel("Pilih Task aktif")).toContainText(
    `Repeat-order fixture ${token}`,
  );
  await followUpDialog
    .getByLabel("Catatan")
    .fill("Repeat-order browser follow-up");
  await followUpDialog
    .getByLabel("Next action", { exact: true })
    .fill("Confirm next repeat order");
  await followUpDialog.getByLabel("Tanggal next action").fill(nextDate);
  await followUpDialog
    .getByRole("button", { name: "Simpan Follow Up" })
    .click();
  await expect(page.getByText("Follow up tercatat")).toBeVisible();

  const { count: taskCountAfter, error: taskAfterError } = await overdue.caller
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("client_id", overdue.clientId)
    .in("workflow_status", ["Open", "In Progress", "Waiting External"]);
  expect(taskAfterError).toBeNull();
  expect(taskCountAfter).toBe(taskCountBefore);

  await overdueRow.getByRole("button", { name: "Nilai sinyal" }).click();
  const feedbackDialog = page.getByRole("dialog", {
    name: "Nilai sinyal repeat-order",
  });
  await feedbackDialog.getByLabel("Penilaian").click();
  await page.getByRole("option", { name: "Tidak relevan" }).click();
  await feedbackDialog.getByLabel("Alasan").fill("Pola proyek musiman fixture");
  await feedbackDialog.getByRole("button", { name: "Simpan feedback" }).click();
  await expect(page.getByText("Feedback repeat-order tersimpan")).toBeVisible();
  await expect(overdueRow).toContainText("Tidak relevan");

  await overdueRow.getByRole("link", { name: "Buka client" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${overdue.clientId}$`));
  const clientSummary = page.locator('[data-repeat-order-state="overdue"]');
  await expect(clientSummary).toContainText("Terlambat");
  await expect(clientSummary).toContainText("Pola proyek musiman fixture");

  await page.goto(`/clients/${insufficient.clientId}`);
  const insufficientSummary = page.locator(
    '[data-repeat-order-state="data_insufficient"]',
  );
  await expect(insufficientSummary).toContainText("Data belum cukup");
  await expect(insufficientSummary).toContainText("3 tanggal order");

  await page.goto(`/clients/${otherOwner.clientId}`);
  await expect(
    page.getByRole("heading", { name: "Klien tidak ditemukan" }),
  ).toBeVisible();

  expect(seededProgress[0].created_task).toBe(true);
  expectNoConsoleIssues(consoleIssues);
});
