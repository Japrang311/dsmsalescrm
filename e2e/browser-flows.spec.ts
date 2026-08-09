import { expect, test } from "@playwright/test";

import {
  NUR_CLIENT_ID,
  USERS,
  USER_IDS,
  authenticatedSupabaseClient,
  collectConsoleIssues,
  expectNoConsoleIssues,
  signIn,
  tomorrowIsoDate,
  uniqueToken,
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

test("Tasks inbox renders agenda, calendar, and history modes", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);

  await signIn(page, USERS.sales);
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "My Tasks" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Agenda/ })).toBeChecked();

  await page.getByRole("radio", { name: /Kalender/ }).click();
  await expect(page.getByRole("button", { name: "Hari ini" })).toBeVisible();
  await expect(page.getByText("Sen")).toBeVisible();

  await page.getByRole("button", { name: /COMPLETED/i }).click();
  await expect(page.getByRole("radio", { name: /Agenda/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Kalender/ })).toBeDisabled();

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

test("sales can create a client that appears after create and reload", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const clientName = uniqueToken("E2E cache client");

  await signIn(page, USERS.sales);
  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  const addClientButton = page.getByRole("button", { name: "Add Client" });
  const dialog = page.getByRole("dialog", { name: "Tambah Klien Baru" });
  await expect(addClientButton).toBeEnabled();
  await addClientButton.click();
  try {
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  } catch {
    await addClientButton.click();
    await expect(dialog).toBeVisible();
  }
  await expect(dialog.locator('input[value="Nur Iman"]')).toBeVisible();
  await dialog.getByLabel("Nama Klien").fill(clientName);
  const saveClientButton = dialog.getByRole("button", {
    name: "Simpan Klien",
  });
  await expect(saveClientButton).toBeEnabled();
  await saveClientButton.click();
  await expect(page.getByText("Klien berhasil ditambahkan")).toBeVisible();

  await page.getByPlaceholder("Cari nama klien…").fill(clientName);
  await expect(
    page.getByRole("link", { name: clientName, exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "CV. ABADI TECHNIC", exact: true }),
  ).toBeVisible();
  const reloadedClientSearch = page.getByPlaceholder("Cari nama klien…");
  await reloadedClientSearch.fill(clientName);
  await expect(reloadedClientSearch).toHaveValue(clientName);
  await expect(
    page.getByRole("link", { name: clientName, exact: true }),
  ).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("manager can reassign client owner and see ownership audit after reload", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const clientName = uniqueToken("E2E owner handover client");
  const note = uniqueToken("E2E owner handover note");
  const managerClient = await authenticatedSupabaseClient(USERS.manager);
  const { data: client, error: clientError } = await managerClient
    .from("clients")
    .insert({
      name: clientName,
      source: "Referral",
      status: "Prospect",
      owner_id: USER_IDS.sales,
    })
    .select("id")
    .single();

  expect(clientError).toBeNull();
  expect(client?.id).toBeTruthy();

  await signIn(page, USERS.manager);
  await page.goto(`/clients/${client!.id}`);
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await expect(page.getByText("Sales: Nur Iman")).toBeVisible();

  await page.getByRole("button", { name: "Reassign" }).click();
  const reassignDialog = page.getByRole("alertdialog", {
    name: "Reassign / Handover Klien",
  });
  await expect(reassignDialog).toBeVisible();
  await reassignDialog.getByText("Pilih sales...").click();
  await page.getByRole("option", { name: "Leli Al" }).click();
  await reassignDialog.getByLabel("Alasan / catatan (opsional)").fill(note);
  await reassignDialog
    .getByRole("button", { name: "Konfirmasi reassign" })
    .click();
  await expect(page.getByText("Klien direassign ke Leli Al")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await expect(page.getByText("Sales: Leli Al")).toBeVisible();

  await page.goto("/activity");
  await page.getByPlaceholder("Cari client / catatan / owner…").fill(note);
  const ownershipRow = page.getByRole("button").filter({ hasText: note });
  await expect(ownershipRow).toContainText(clientName);
  await expect(ownershipRow).toContainText("Perubahan Owner");
  await expect(ownershipRow).toContainText("Owner baru: Leli Al");
  await expect(ownershipRow).not.toContainText("Perubahan Status Client");

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

test("sales can create normalized Quotation and Sales Order records", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const quotationProduct = uniqueToken("E2E quotation product");
  const quotationDescription = `${quotationProduct} description`;
  const soNumber = `E2E-SO-${Date.now()}`;
  const customerPo = `E2E-PO-${Date.now()}`;

  await signIn(page, USERS.sales);
  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await expect(
    page.getByRole("heading", { name: /CV\. ABADI TECHNIC/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Add Quotation/ }).click();
  const quotationDialog = page.getByRole("dialog", {
    name: "Buat Quotation",
  });
  await quotationDialog
    .getByLabel("Next Action")
    .fill("Follow up quotation E2E");
  await quotationDialog.getByLabel("Tanggal Follow-up").fill(tomorrowIsoDate());
  await quotationDialog
    .getByLabel("Nama Product item 1")
    .fill(quotationProduct);
  await quotationDialog
    .getByLabel("Description item 1")
    .fill(quotationDescription);
  await quotationDialog.getByLabel("Unit Price item 1").fill("123456");
  await quotationDialog
    .getByRole("button", { name: "Simpan Quotation" })
    .click();
  await expect(page.getByText("Quotation dibuat")).toBeVisible();

  await page.goto("/quotations");
  await page
    .getByPlaceholder("Cari klien, project, no. dokumen…")
    .fill(quotationProduct);
  await expect(
    page.getByRole("link", { name: /Buka detail/ }).filter({
      hasText: quotationProduct,
    }),
  ).toBeVisible();

  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await page.getByRole("button", { name: /Record Sales Order/ }).click();
  const salesOrderDialog = page.getByRole("dialog", {
    name: "Record Sales Order",
  });
  await salesOrderDialog.getByLabel("Nomor SO").fill(soNumber);
  await salesOrderDialog.getByLabel("Nomor PO Customer").fill(customerPo);
  await salesOrderDialog
    .getByLabel("Nama Product item 1")
    .fill(uniqueToken("E2E SO product"));
  await salesOrderDialog
    .getByLabel("Description item 1")
    .fill("Sales Order smoke item from browser E2E");
  await salesOrderDialog.getByLabel("Unit Price item 1").fill("654321");
  await salesOrderDialog
    .getByRole("button", { name: "Simpan Sales Order" })
    .click();
  await expect(page.getByText("Sales Order dicatat")).toBeVisible();

  await page.goto("/sales-orders");
  await expect(page.getByText(soNumber)).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("sales can log commercial follow-up that survives reload", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const quotationProduct = uniqueToken("E2E follow-up quotation");
  const followUpNote = uniqueToken("E2E commercial follow-up note");

  await signIn(page, USERS.sales);
  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await page.getByRole("button", { name: /Add Quotation/ }).click();
  const quotationDialog = page.getByRole("dialog", { name: "Buat Quotation" });
  await quotationDialog
    .getByLabel("Next Action")
    .fill("Prepare commercial follow-up E2E");
  await quotationDialog.getByLabel("Tanggal Follow-up").fill(tomorrowIsoDate());
  await quotationDialog
    .getByLabel("Nama Product item 1")
    .fill(quotationProduct);
  await quotationDialog
    .getByLabel("Description item 1")
    .fill(`${quotationProduct} detail`);
  await quotationDialog.getByLabel("Unit Price item 1").fill("222222");
  await quotationDialog
    .getByRole("button", { name: "Simpan Quotation" })
    .click();
  await expect(page.getByText("Quotation dibuat")).toBeVisible();

  await page.goto("/quotations");
  await page
    .getByPlaceholder("Cari klien, project, no. dokumen…")
    .fill(quotationProduct);
  const quotationRow = page
    .getByRole("link", { name: /Buka detail/ })
    .filter({ hasText: quotationProduct });
  await expect(quotationRow).toBeVisible();
  await quotationRow.click();

  await page.getByRole("button", { name: /Log Follow-Up/ }).click();
  const followUpDialog = page.getByRole("dialog", {
    name: /Log Follow-Up · Quotation/,
  });
  await followUpDialog.getByLabel("Next action").fill("Review FU E2E result");
  await followUpDialog.getByLabel("Tanggal next FU").fill(tomorrowIsoDate());
  await followUpDialog.getByLabel("Catatan").fill(followUpNote);
  await followUpDialog
    .getByRole("button", { name: "Simpan Follow-Up" })
    .click();
  await expect(page.getByText("Follow-up tercatat")).toBeVisible();

  await page.reload();
  await expect(page.getByText(followUpNote)).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("pipeline Closed Lost transition requires a reason and persists", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const quotationProduct = uniqueToken("E2E closed lost quotation");

  await signIn(page, USERS.sales);
  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await page.getByRole("button", { name: /Add Quotation/ }).click();
  const quotationDialog = page.getByRole("dialog", { name: "Buat Quotation" });
  await quotationDialog
    .getByLabel("Next Action")
    .fill("Prepare Closed Lost validation E2E");
  await quotationDialog.getByLabel("Tanggal Follow-up").fill(tomorrowIsoDate());
  await quotationDialog
    .getByLabel("Nama Product item 1")
    .fill(quotationProduct);
  await quotationDialog
    .getByLabel("Description item 1")
    .fill(`${quotationProduct} detail`);
  await quotationDialog.getByLabel("Unit Price item 1").fill("333333");
  await quotationDialog
    .getByRole("button", { name: "Simpan Quotation" })
    .click();
  await expect(page.getByText("Quotation dibuat")).toBeVisible();

  await page.goto("/pipeline");
  const quotesSentColumn = page
    .getByTestId("pipeline-column")
    .filter({ hasText: "Quotes Sent" });
  await quotesSentColumn
    .getByTestId("pipeline-card")
    .filter({ hasText: quotationProduct })
    .click();

  await page.getByTestId("pipeline-drawer-stage-select").click();
  await page.getByRole("option", { name: "Closed Lost" }).click();
  await page.getByRole("button", { name: "Simpan alasan" }).click();
  await expect(
    page.getByRole("dialog", { name: "Alasan closed lost" }),
  ).toBeVisible();

  await page.getByTestId("pipeline-drawer-lost-reason-select").click();
  await page.getByRole("option", { name: "Harga tidak kompetitif" }).click();
  await page.getByRole("button", { name: "Simpan alasan" }).click();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Pipeline card diperbarui")).toBeVisible();

  await page.reload();
  const closedLostColumn = page
    .getByTestId("pipeline-column")
    .filter({ hasText: "Closed Lost" });
  await expect(
    closedLostColumn.getByTestId("pipeline-card").filter({
      hasText: quotationProduct,
    }),
  ).toBeVisible();

  expectNoConsoleIssues(consoleIssues);
});

test("executive direct write is denied by Supabase RLS/RPC boundary", async () => {
  const executive = await authenticatedSupabaseClient(USERS.executive);
  const { error } = await executive.rpc("create_sales_order", {
    p_client_id: NUR_CLIENT_ID,
    p_date: tomorrowIsoDate(),
    p_customer_po_number: `E2E-DENIED-PO-${Date.now()}`,
    p_type: "Regular",
    p_tax_type: "PPN",
    p_prototype_status: null,
    p_source: "Existing / Repeat Order",
    p_number_mode: "Manual",
    p_manual_so_number: `E2E-DENIED-SO-${Date.now()}`,
    p_backdate_reason: null,
    p_items: [
      {
        productName: "Forbidden executive SO",
        description: "Executive role must not create Sales Orders",
        qty: 1,
        uom: "Pcs",
        unitPrice: 1000,
      },
    ],
  });

  expect(error).not.toBeNull();
  expect(error?.message).toMatch(
    /ACTIVE_MUTATING_ROLE_REQUIRED|UNAUTHORIZED|permission|not authorized/i,
  );
});
