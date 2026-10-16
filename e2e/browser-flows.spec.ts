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
  await page.getByRole("button", { name: "Export", exact: true }).click();
  // "Nilai SO bulanan vs target" appears once under CSV and again
  // under Excel; the CSV entry is first in the menu.
  await page
    .getByRole("menuitem", { name: "Nilai SO bulanan vs target" })
    .first()
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
  await reassignDialog.getByRole("combobox", { name: "Pilih sales…" }).click();
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
  await expect(ownershipRow).toContainText("→ Leli Al");
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

test("sales can manually link released Sales Orders and Closed Won Quotations from both entry points", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const sales = await authenticatedSupabaseClient(USERS.sales);
  const documentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  async function createUnlinkedPair(label: string) {
    const productName = uniqueToken(`E2E manual link ${label}`);
    const { data: quotation, error: quotationError } = await sales.rpc(
      "create_quotation",
      {
        p_client_id: NUR_CLIENT_ID,
        p_document_date: documentDate,
        p_client_address: null,
        p_stage: "Closed Won",
        p_so_number: null,
        p_note: "Browser verification for manual document linking",
        p_items: [
          {
            productName,
            description: `${productName} description`,
            qty: 1,
            uom: "Unit",
            unitPrice: 456789,
          },
        ],
        p_next_action: "Verify manual Sales Order link",
        p_next_action_date: tomorrowIsoDate(),
      },
    );
    expect(quotationError).toBeNull();

    const soNumber = `E2E-LINK-SO-${Date.now()}-${label}`;
    const { data: salesOrder, error: salesOrderError } = await sales.rpc(
      "create_sales_order",
      {
        p_client_id: NUR_CLIENT_ID,
        p_date: documentDate,
        p_customer_po_number: `E2E-LINK-PO-${Date.now()}-${label}`,
        p_customer_po_date: documentDate,
        p_type: "Regular",
        p_tax_type: "PPN",
        p_prototype_status: null,
        p_source: "Existing / Repeat Order",
        p_number_mode: "Manual",
        p_manual_so_number: soNumber,
        p_backdate_reason: null,
        p_items: [
          {
            productName,
            description: `${productName} Sales Order item`,
            qty: 1,
            uom: "Unit",
            unitPrice: 456789,
          },
        ],
        p_source_commercial_document_id: null,
      },
    );
    expect(salesOrderError).toBeNull();

    return {
      productName,
      quotation: quotation as { id: string; quotation_number: string },
      salesOrder: salesOrder as { id: string },
      soNumber,
    };
  }

  const fromSalesOrder = await createUnlinkedPair("SO");
  const fromQuotation = await createUnlinkedPair("QUO");
  const backlogBefore = await sales.rpc("crm_won_without_so_backlog");
  expect(backlogBefore.error).toBeNull();
  const monthFrom = `${documentDate.slice(0, 7)}-01`;
  const monthTo = new Date(
    Date.UTC(
      Number(documentDate.slice(0, 4)),
      Number(documentDate.slice(5, 7)),
      0,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const forecastBefore = await sales.rpc("crm_forecast_snapshot", {
    p_from: monthFrom,
    p_to: monthTo,
  });
  expect(forecastBefore.error).toBeNull();

  await signIn(page, USERS.sales);
  await page.goto(`/sales-orders/${fromSalesOrder.salesOrder.id}`);
  await page
    .getByRole("button", { name: /Link Quotation|Hubungkan Quotation/ })
    .click();
  const quotationDialog = page.getByRole("dialog", {
    name: "Link Quotation",
  });
  await quotationDialog
    .getByRole("radio", {
      name: new RegExp(fromSalesOrder.quotation.quotation_number),
    })
    .click();
  await quotationDialog
    .getByRole("button", { name: "Link", exact: true })
    .click();
  await expect(
    page.getByText("Quotation dan Sales Order terhubung"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: fromSalesOrder.quotation.quotation_number,
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/pipeline");
  const closedWonColumn = page
    .getByTestId("pipeline-column")
    .filter({ hasText: "Closed Won" });
  const quotationCard = closedWonColumn
    .getByTestId("pipeline-card")
    .filter({ hasText: fromQuotation.productName });
  await quotationCard
    .getByRole("button", { name: /Link SO|Hubungkan SO/ })
    .click();
  const salesOrderDialog = page.getByRole("dialog", {
    name: "Link Sales Order",
  });
  await salesOrderDialog
    .getByRole("radio", { name: new RegExp(fromQuotation.soNumber) })
    .click();
  await salesOrderDialog
    .getByRole("button", { name: "Link", exact: true })
    .click();
  await expect(
    page.getByText("Quotation dan Sales Order terhubung"),
  ).toBeVisible();
  await expect(quotationCard.getByText("SO released")).toBeVisible();
  await quotationCard
    .getByRole("button", { name: new RegExp(fromQuotation.soNumber) })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/sales-orders/${fromQuotation.salesOrder.id}$`),
  );

  await expect
    .poll(async () => {
      const refreshed = await sales.rpc("crm_won_without_so_backlog");
      expect(refreshed.error).toBeNull();
      return refreshed.data.totals.exceptionCount;
    })
    .toBe(backlogBefore.data.totals.exceptionCount - 2);
  const forecastAfter = await sales.rpc("crm_forecast_snapshot", {
    p_from: monthFrom,
    p_to: monthTo,
  });
  expect(forecastAfter.error).toBeNull();
  expect(forecastAfter.data.forecastValue).toBe(
    forecastBefore.data.forecastValue,
  );

  await page.goto("/dashboard");
  const dashboardBacklog = page.getByRole("region", {
    name: "Backlog Won tanpa Sales Order",
  });
  await expect(dashboardBacklog).toHaveAttribute(
    "data-won-backlog-count",
    String(backlogBefore.data.totals.exceptionCount - 2),
  );

  expectNoConsoleIssues(consoleIssues);
});

test("creating an SO from a Closed Won card clears the exact backlog after reload", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const sales = await authenticatedSupabaseClient(USERS.sales);
  const documentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const productName = uniqueToken("E2E Won backlog create");
  const { data: quotation, error: quotationError } = await sales.rpc(
    "create_quotation",
    {
      p_client_id: NUR_CLIENT_ID,
      p_document_date: documentDate,
      p_client_address: null,
      p_stage: "Closed Won",
      p_so_number: null,
      p_note: "Browser verification for Won backlog create flow",
      p_items: [
        {
          productName,
          description: `${productName} description`,
          qty: 1,
          uom: "Unit",
          unitPrice: 567890,
        },
      ],
      p_next_action: "Create linked Sales Order",
      p_next_action_date: tomorrowIsoDate(),
    },
  );
  expect(quotationError).toBeNull();
  const backlogBefore = await sales.rpc("crm_won_without_so_backlog", {
    p_document_ids: [quotation.id],
  });
  expect(backlogBefore.error).toBeNull();
  expect(backlogBefore.data.requestedStates[0].status).toBe("missing");

  await signIn(page, USERS.sales);
  await page.goto("/pipeline");
  const closedWonColumn = page
    .getByTestId("pipeline-column")
    .filter({ hasText: "Closed Won" });
  const quotationCard = closedWonColumn
    .getByTestId("pipeline-card")
    .filter({ hasText: productName });
  await expect(quotationCard.getByText(/SO belum dibuat/)).toBeVisible();
  await quotationCard.getByRole("button", { name: "Buat SO" }).click();

  const dialog = page.getByRole("dialog", { name: "Record Sales Order" });
  await expect(
    dialog.getByText(quotation.quotation_number, { exact: false }),
  ).toBeVisible();
  const soNumber = `E2E-WON-SO-${Date.now()}`;
  await dialog.getByLabel("Nomor SO").fill(soNumber);
  await dialog.getByLabel("Nomor PO Customer").fill(`E2E-WON-PO-${Date.now()}`);
  await dialog.getByLabel("Nama Product item 1").fill(productName);
  await dialog
    .getByLabel("Description item 1")
    .fill("Created from Closed Won backlog browser flow");
  await dialog.getByLabel("Unit Price item 1").fill("567890");
  await dialog.getByRole("button", { name: "Simpan Sales Order" }).click();
  await expect(page.getByText("Sales Order dicatat")).toBeVisible();
  await expect(quotationCard.getByText("SO released")).toBeVisible();

  await page.reload();
  const refreshedCard = page
    .getByTestId("pipeline-column")
    .filter({ hasText: "Closed Won" })
    .getByTestId("pipeline-card")
    .filter({ hasText: productName });
  await expect(refreshedCard.getByText("SO released")).toBeVisible();
  await expect(refreshedCard.getByText(soNumber)).toBeVisible();
  await expect(refreshedCard.getByText(/SO belum dibuat/)).toHaveCount(0);

  await expect
    .poll(async () => {
      const refreshed = await sales.rpc("crm_won_without_so_backlog", {
        p_document_ids: [quotation.id],
      });
      expect(refreshed.error).toBeNull();
      return refreshed.data.requestedStates[0]?.status;
    })
    .toBe("linked");
  const backlogAfter = await sales.rpc("crm_won_without_so_backlog");
  expect(backlogAfter.error).toBeNull();
  expect(backlogAfter.data.totals.exceptionCount).toBe(
    backlogBefore.data.totals.exceptionCount - 1,
  );

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

test("quotation Commit transition requires Expected Close and revision confirms it", async ({
  page,
}) => {
  const consoleIssues = collectConsoleIssues(page);
  const quotationProduct = uniqueToken("E2E expected close quotation");
  const initialExpectedClose = "2099-12-31";
  const revisedExpectedClose = "2099-12-30";

  await signIn(page, USERS.sales);
  await page.goto(`/clients/${NUR_CLIENT_ID}`);
  await page.getByRole("button", { name: /Add Quotation/ }).click();
  const quotationDialog = page.getByRole("dialog", { name: "Buat Quotation" });
  await quotationDialog
    .getByLabel("Next Action")
    .fill("Prepare Commit expected close E2E");
  await quotationDialog.getByLabel("Tanggal Follow-up").fill(tomorrowIsoDate());
  await quotationDialog
    .getByLabel("Nama Product item 1")
    .fill(quotationProduct);
  await quotationDialog
    .getByLabel("Description item 1")
    .fill(`${quotationProduct} detail`);
  await quotationDialog.getByLabel("Unit Price item 1").fill("444444");
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
  await page.getByRole("option", { name: "Commit" }).click();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(
    page.getByText("Expected Close wajib saat masuk Commit"),
  ).toBeVisible();

  await page.getByLabel("Expected Close").fill(initialExpectedClose);
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Pipeline card diperbarui")).toBeVisible();

  await page.goto("/quotations");
  await page
    .getByPlaceholder("Cari klien, project, no. dokumen…")
    .fill(quotationProduct);
  const quotationRow = page
    .getByRole("link", { name: /Buka detail/ })
    .filter({ hasText: quotationProduct });
  await expect(quotationRow).toBeVisible();
  await quotationRow.click();
  await expect(page.locator("#detail-expected-close")).toHaveValue(
    initialExpectedClose,
  );

  await page.getByRole("button", { name: "Buat Revisi" }).click();
  const revisionDialog = page.getByRole("dialog", {
    name: "Buat Revisi Quotation",
  });
  await expect(revisionDialog.getByLabel("Expected Close")).toHaveValue(
    initialExpectedClose,
  );
  await revisionDialog.getByLabel("Expected Close").fill(revisedExpectedClose);
  await revisionDialog
    .getByLabel("Next Action")
    .fill("Follow up revised quotation E2E");
  await revisionDialog.getByLabel("Tanggal Follow-up").fill(tomorrowIsoDate());
  await revisionDialog.getByRole("button", { name: "Buat Revisi" }).click();
  await expect(page.getByText("Revisi Quotation dibuat")).toBeVisible();
  await expect(page.locator("#detail-expected-close")).toHaveValue(
    revisedExpectedClose,
  );

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
