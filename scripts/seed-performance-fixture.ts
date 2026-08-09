// Local-only synthetic performance fixture. Inserts a large batch of
// clearly-fake ("Synthetic Perf …") clients/commercial documents/sales
// orders/tasks directly via the raw Postgres connection, on top of the
// existing supabase/seed.sql data, so Stage 3's paginated routes and
// aggregate RPCs can be measured against a company-scale dataset instead
// of the small real-imported local seed.
//
// Never run against anything but loopback Supabase (see assertLoopback
// below) and never merged into supabase/seed.sql — this is a throwaway
// local benchmark aid. Reset with `bunx supabase db reset` afterward.
//
// Usage: bun scripts/seed-performance-fixture.ts
// Scale overrides: PERF_FIXTURE_CLIENTS / PERF_FIXTURE_TASKS_PER_CLIENT env vars.

import { SQL } from "bun";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function assertLoopback(url: string): void {
  const parsed = new URL(url.replace("postgresql://", "http://"));
  const isLoopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLoopback) {
    throw new Error(
      `Performance fixture is local-only. Refusing non-loopback DB URL: ${parsed.hostname}`,
    );
  }
}
assertLoopback(DB_URL);

const CLIENT_COUNT = Number(process.env.PERF_FIXTURE_CLIENTS ?? 2000);
const TASKS_PER_CLIENT = Number(process.env.PERF_FIXTURE_TASKS_PER_CLIENT ?? 2);

const CLIENT_STATUSES = [
  "Prospect",
  "Active Customer",
  "Dormant",
  "Lost",
  "Repeat Order",
] as const;
const CLIENT_SOURCES = [
  "Referral",
  "Website Inquiry",
  "Business Relationship",
  "Repeat",
] as const;
const STAGES = [
  "Quotes Sent",
  "Negotiation",
  "Hot Prospect",
  "Commit",
  "Closed Won",
  "Closed Lost",
] as const;
// Weighted toward the real distribution seen in production (most items sit
// in Quotes Sent/Negotiation; Closed Won/Lost are the minority terminal
// stages) rather than a flat 1/6 split.
const STAGE_WEIGHTS = [50, 25, 5, 5, 10, 5];
// "Lainnya" deliberately excluded — it requires a non-empty
// lost_reason_detail, not worth the extra column for a synthetic fixture.
const LOST_REASONS = [
  "Harga tidak kompetitif",
  "Kalah tender/kompetitor",
  "Spesifikasi tidak sesuai",
  "Project ditunda/dibatalkan",
  "Tidak ada respons",
  "Lead time",
  "Anggaran",
] as const;
const UOMS = ["Unit", "Pcs", "Set", "Lot"] as const;
const TAX_TYPES = ["PPN", "Non-PPN"] as const;
const SOURCES = [
  "RFQ / New Product",
  "Existing / Repeat Order",
  "Prototype Paid",
] as const;
const TASK_METHODS = [
  "Phone",
  "Email",
  "Visit",
  "WhatsApp",
  "Meeting",
] as const;
const TASK_CATEGORIES = [
  "Follow-Up",
  "Quotation",
  "Sales Order",
  "Client Meeting/Visit",
  "Internal/Admin",
] as const;
const WORKFLOW_STATUSES = [
  "Open",
  "In Progress",
  "Waiting External",
  "Done",
  "Cancelled",
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T>(arr: readonly T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function randomDateWithinDays(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  return d.toISOString().slice(0, 10);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

async function main() {
  const db = new SQL(DB_URL);

  const owners = await db<{ id: string; role: string }[]>`
    select id, role from public.profiles where role in ('sales', 'manager')
  `;
  if (owners.length === 0) {
    throw new Error(
      "No sales/manager profiles found — run `bunx supabase db reset` first so the base seed exists.",
    );
  }
  const ownerIds = owners.map((o) => o.id);

  console.log(
    `Generating ${CLIENT_COUNT} synthetic clients (owners: ${ownerIds.length})...`,
  );

  const startedAt = Date.now();

  // --- Clients --------------------------------------------------------
  const clientRows: {
    id: string;
    name: string;
    status: string;
    source: string;
    owner_id: string;
  }[] = [];
  for (let i = 1; i <= CLIENT_COUNT; i += 1) {
    clientRows.push({
      id: crypto.randomUUID(),
      name: `Synthetic Perf Client ${pad(i, 5)}`,
      status: pick(CLIENT_STATUSES),
      source: pick(CLIENT_SOURCES),
      owner_id: pick(ownerIds),
    });
  }
  await insertBatches(
    db,
    "clients",
    clientRows.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      source: c.source,
      owner_id: c.owner_id,
    })),
  );
  console.log(`  clients: ${clientRows.length} inserted`);

  // --- Commercial documents (Quotations) + items -----------------------
  const docRows: {
    id: string;
    client_id: string;
    owner_id: string;
    stage: string;
    quotation_number: string;
    document_date: string;
  }[] = [];
  const docItemRows: Record<string, unknown>[] = [];
  let docSeq = 0;
  for (const client of clientRows) {
    const docsForClient = 1 + Math.floor(Math.random() * 3); // 1-3 quotations
    for (let d = 0; d < docsForClient; d += 1) {
      docSeq += 1;
      const id = crypto.randomUUID();
      const stage = pickWeighted(STAGES, STAGE_WEIGHTS);
      const quotationNumber = `PERF-QUO-${pad(docSeq, 6)}`;
      const date = randomDateWithinDays(365);
      docRows.push({
        id,
        client_id: client.id,
        owner_id: client.owner_id,
        stage,
        quotation_number: quotationNumber,
        document_date: date,
      });
      const itemCount = 1 + Math.floor(Math.random() * 3);
      for (let p = 1; p <= itemCount; p += 1) {
        const qty = 1 + Math.floor(Math.random() * 10);
        const unitPrice = 100_000 + Math.floor(Math.random() * 20_000_000);
        docItemRows.push({
          id: crypto.randomUUID(),
          commercial_document_id: id,
          product_name: `Synthetic Item ${p}`,
          qty,
          uom: pick(UOMS),
          unit_price: unitPrice,
          line_total: qty * unitPrice,
          line_position: p,
        });
      }
    }
  }
  await insertBatches(
    db,
    "commercial_documents",
    docRows.map((r) => ({
      id: r.id,
      client_id: r.client_id,
      owner_id: r.owner_id,
      type: "Quotation",
      source_flow: "Existing / Repeat Order",
      document_date: r.document_date,
      quotation_number: r.quotation_number,
      quotation_base_number: r.quotation_number,
      quotation_revision: 0,
      is_current_revision: true,
      stage: r.stage,
      lost_reason: r.stage === "Closed Lost" ? pick(LOST_REASONS) : null,
    })),
  );
  console.log(`  commercial_documents: ${docRows.length} inserted`);
  await insertBatches(db, "commercial_document_items", docItemRows);
  console.log(`  commercial_document_items: ${docItemRows.length} inserted`);

  // --- Sales orders + items --------------------------------------------
  // Closed Won quotations get a linked SO (respects the
  // source_commercial_document_id unique constraint); everything else is a
  // mix of unlinked direct/repeat-order SOs, matching the app's two real
  // creation paths (Closed-Won hand-off vs. direct Quick Create).
  const closedWonDocs = docRows.filter((d) => d.stage === "Closed Won");
  const soRows: {
    id: string;
    so_number: string;
    client_id: string;
    owner_id: string;
    date: string;
    tax_type: string;
    source: string;
    source_commercial_document_id: string | null;
  }[] = [];
  const soItemRows: Record<string, unknown>[] = [];
  let soSeq = 0;

  for (const doc of closedWonDocs) {
    soSeq += 1;
    const id = crypto.randomUUID();
    soRows.push({
      id,
      so_number: `PERF-SO-${pad(soSeq, 6)}`,
      client_id: doc.client_id,
      owner_id: doc.owner_id,
      date: randomDateWithinDays(300),
      tax_type: pick(TAX_TYPES),
      source: pick(SOURCES),
      source_commercial_document_id: doc.id,
    });
  }
  // Extra direct/repeat-order SOs on top, roughly 1.5x the Closed Won count,
  // spread across random clients, to match production's mix of new-product
  // and repeat-order revenue.
  const extraSoCount = Math.floor(closedWonDocs.length * 1.5);
  for (let i = 0; i < extraSoCount; i += 1) {
    soSeq += 1;
    const client = pick(clientRows);
    soRows.push({
      id: crypto.randomUUID(),
      so_number: `PERF-SO-${pad(soSeq, 6)}`,
      client_id: client.id,
      owner_id: client.owner_id,
      date: randomDateWithinDays(300),
      tax_type: pick(TAX_TYPES),
      source: "Existing / Repeat Order",
      source_commercial_document_id: null,
    });
  }
  const soTotals = new Map<string, number>();
  for (const so of soRows) {
    const itemCount = 1 + Math.floor(Math.random() * 3);
    let total = 0;
    for (let p = 1; p <= itemCount; p += 1) {
      const qty = 1 + Math.floor(Math.random() * 10);
      const unitPrice = 100_000 + Math.floor(Math.random() * 20_000_000);
      const lineTotal = qty * unitPrice;
      total += lineTotal;
      soItemRows.push({
        id: crypto.randomUUID(),
        sales_order_id: so.id,
        product_name: `Synthetic Item ${p}`,
        qty,
        uom: pick(UOMS),
        unit_price: unitPrice,
        line_total: lineTotal,
        line_position: p,
      });
    }
    soTotals.set(so.id, total);
  }
  await insertBatches(
    db,
    "sales_orders",
    soRows.map((r) => ({
      id: r.id,
      so_number: r.so_number,
      date: r.date,
      client_id: r.client_id,
      owner_id: r.owner_id,
      type: "Regular",
      tax_type: r.tax_type,
      source: r.source,
      number_mode: "Manual",
      total_value: soTotals.get(r.id) ?? 0,
      source_commercial_document_id: r.source_commercial_document_id,
    })),
  );
  console.log(`  sales_orders: ${soRows.length} inserted`);
  await insertBatches(db, "sales_order_items", soItemRows);
  console.log(`  sales_order_items: ${soItemRows.length} inserted`);

  // --- Tasks -------------------------------------------------------------
  const taskRows: Record<string, unknown>[] = [];
  for (const client of clientRows) {
    for (let t = 0; t < TASKS_PER_CLIENT; t += 1) {
      const dueOffset = Math.floor(Math.random() * 60) - 20; // -20..+40 days
      const due = new Date();
      due.setDate(due.getDate() + dueOffset);
      const workflowStatus = pick(WORKFLOW_STATUSES);
      taskRows.push({
        id: crypto.randomUUID(),
        client_id: client.id,
        owner_id: client.owner_id,
        title: `Synthetic follow-up ${t + 1}`,
        due_date: due.toISOString().slice(0, 10),
        method: pick(TASK_METHODS),
        workflow_status: workflowStatus,
        category: pick(TASK_CATEGORIES),
        cancellation_reason:
          workflowStatus === "Cancelled" ? "Synthetic cancellation" : null,
      });
    }
  }
  await insertBatches(db, "tasks", taskRows);
  console.log(`  tasks: ${taskRows.length} inserted`);

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `Done in ${(elapsedMs / 1000).toFixed(1)}s. Totals: ${clientRows.length} clients, ${docRows.length} quotations (${docItemRows.length} items), ${soRows.length} sales orders (${soItemRows.length} items), ${taskRows.length} tasks.`,
  );
  console.log(
    "Reminder: this is a throwaway local fixture. Run `bunx supabase db reset` to remove it.",
  );

  await db.end();
}

async function insertBatches(
  db: SQL,
  table: string,
  rows: Record<string, unknown>[],
  batchSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    await db`insert into ${db(table)} ${db(batch)}`;
  }
}

await main();
