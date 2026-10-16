import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";

import {
  NUR_CLIENT_ID,
  USERS,
  authenticatedSupabaseClient,
  collectConsoleIssues,
  expectNoConsoleIssues,
  signIn,
} from "./fixtures";

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
  await expect(
    page.getByText(String(valueFor("Snapshot")), { exact: false }),
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
