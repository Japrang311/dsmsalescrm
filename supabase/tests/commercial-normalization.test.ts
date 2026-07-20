import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";

const LOCAL_POSTGRES_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const db = new SQL(LOCAL_POSTGRES_URL);

type Row = Record<string, unknown>;

afterAll(async () => {
  await db.end();
});

// Mock-client fixture ...0001 was removed 2026-07-19 along with the rest of
// the mockup demo data (see supabase/seed.sql); ...000d (HARIFF) is the only
// client guaranteed to exist locally now, so tests use it as a fixture.
const CLIENT_ID = "a0000000-0000-4000-8000-00000000000d";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";

async function cleanupCommercialFixture(
  legacyIds: string[],
  quotationBaseNumber?: string,
): Promise<void> {
  if (quotationBaseNumber) {
    await db`
      delete from public.commercial_documents
      where quotation_base_number = ${quotationBaseNumber}
    `;
  }
  await db`
    delete from private.commercial_item_id_map
    where legacy_item_id in ${db(legacyIds)}
  `;
  await db`
    delete from private.commercial_document_migration_review
    where source_table = 'commercial_items'
      and legacy_id in ${db(legacyIds)}
  `;
  await db`
    delete from private.legacy_commercial_items_20260718
    where id in ${db(legacyIds)}
  `;
}

describe("Phase 11 legacy commercial normalization", () => {
  test("migrates a base Quotation plus REV.1 with exactly one current revision", async () => {
    const marker = crypto.randomUUID();
    const baseNumber = `DSM-26QUO-${marker.slice(0, 8)}`;
    const legacyIds = [crypto.randomUUID(), crypto.randomUUID()];

    try {
      await db`
        insert into private.legacy_commercial_items_20260718 (
          id, client_id, owner_id, type, source_flow, stage, description,
          estimated_value, quotation_number, created_at
        ) values
          (
            ${legacyIds[0]}, ${CLIENT_ID}, ${OWNER_ID}, 'Quotation',
            'RFQ / New Product', 'Quotes Sent', 'Base quotation item',
            100000, ${baseNumber}, '2026-07-18T00:00:00Z'
          ),
          (
            ${legacyIds[1]}, ${CLIENT_ID}, ${OWNER_ID}, 'Quotation',
            'RFQ / New Product', 'Quotes Sent', 'Revision quotation item',
            120000, ${`${baseNumber}_REV.1`}, '2026-07-19T00:00:00Z'
          )
      `;

      await db`select private.migrate_commercial_document_data()`;

      const rows = (await db`
        select
          id,
          quotation_number,
          quotation_revision,
          is_current_revision,
          supersedes_document_id
        from public.commercial_documents
        where quotation_base_number = ${baseNumber}
        order by quotation_revision
      `) as Row[];

      expect(rows).toHaveLength(2);
      expect(rows[0]?.quotation_revision).toBe(0);
      expect(rows[0]?.is_current_revision).toBe(false);
      expect(rows[0]?.supersedes_document_id).toBeNull();
      expect(rows[1]?.quotation_revision).toBe(1);
      expect(rows[1]?.is_current_revision).toBe(true);
      expect(rows[1]?.supersedes_document_id).toBe(rows[0]?.id);
    } finally {
      await cleanupCommercialFixture(legacyIds, baseNumber);
    }
  });

  test("preserves Prototype FOC work while normalizing its money to NULL", async () => {
    const legacyId = crypto.randomUUID();

    try {
      await db`
        insert into private.legacy_commercial_items_20260718 (
          id, client_id, owner_id, type, source_flow, stage, description,
          estimated_value, prototype_status, created_at
        ) values (
          ${legacyId}, ${CLIENT_ID}, ${OWNER_ID}, 'Prototype', 'Prototype',
          'Prototype in Progress', 'FOC prototype item', 0, 'FOC',
          '2026-07-19T00:00:00Z'
        )
      `;

      await db`select private.migrate_commercial_document_data()`;

      const rows = (await db`
        select i.product_name, i.line_total
        from private.commercial_item_id_map m
        join public.commercial_document_items i
          on i.id = m.commercial_document_item_id
        where m.legacy_item_id = ${legacyId}
      `) as Row[];

      expect(rows).toHaveLength(1);
      expect(rows[0]?.product_name).toBeNull();
      expect(rows[0]?.line_total).toBeNull();
    } finally {
      const mapped = (await db`
        select commercial_document_id
        from private.commercial_item_id_map
        where legacy_item_id = ${legacyId}
      `) as Row[];
      if (mapped[0]?.commercial_document_id) {
        await db`
          delete from public.commercial_documents
          where id = ${mapped[0].commercial_document_id as string}
        `;
      }
      await cleanupCommercialFixture([legacyId]);
    }
  });

  test("groups RFQ/SO rows, preserves totals, and repoints history links", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const rfqNumber = `RFQ-NORMALIZE-${marker}`;
    const soNumber = `SO-NORMALIZE-${marker}`;
    const commercialIds = [crypto.randomUUID(), crypto.randomUUID()];
    const salesOrderIds = [crypto.randomUUID(), crypto.randomUUID()];
    const taskId = crypto.randomUUID();
    const followUpId = crypto.randomUUID();
    const commercialActivityId = crypto.randomUUID();
    const salesOrderActivityId = crypto.randomUUID();

    try {
      await db`
        insert into private.legacy_commercial_items_20260718 (
          id, client_id, owner_id, type, source_flow, stage, description,
          estimated_value, qty, unit_price, rfq_number, created_at
        ) values
          (
            ${commercialIds[0]}, ${CLIENT_ID}, ${OWNER_ID}, 'RFQ',
            'RFQ / New Product', 'Client Request for Quotes', 'RFQ line A',
            200000, 2, 100000, ${rfqNumber}, '2026-07-18T00:00:00Z'
          ),
          (
            ${commercialIds[1]}, ${CLIENT_ID}, ${OWNER_ID}, 'RFQ',
            'RFQ / New Product', 'Client Request for Quotes', 'RFQ line B',
            450000, 3, 150000, ${rfqNumber}, '2026-07-18T00:00:00Z'
          )
      `;

      await db`
        insert into public.tasks (
          id, client_id, owner_id, commercial_item_id, title, due_date,
          method, status, priority
        ) values (
          ${taskId}, ${CLIENT_ID}, ${OWNER_ID}, ${commercialIds[0]},
          ${`Normalization task ${marker}`}, '2026-07-20', 'Email',
          'Upcoming', 'Normal'
        )
      `;

      await db`
        insert into public.follow_up_logs (
          id, client_id, commercial_item_id, owner_id, fu_date, method, result
        ) values (
          ${followUpId}, ${CLIENT_ID}, ${commercialIds[1]}, ${OWNER_ID},
          '2026-07-19', 'Phone', 'Interested'
        )
      `;

      await db`
        insert into public.activity_log (
          id, kind, owner_id, actor_id, client_id, commercial_item_id, title
        ) values (
          ${commercialActivityId}, 'commercial_item_created', ${OWNER_ID},
          ${OWNER_ID}, ${CLIENT_ID}, ${commercialIds[0]},
          ${`Normalization commercial activity ${marker}`}
        )
      `;

      await db`
        insert into private.legacy_sales_orders_20260718 (
          id, so_number, client_id, owner_id, type, tax_type,
          prototype_status, source, value, qty, unit_price, date
        ) values
          (
            ${salesOrderIds[0]}, ${soNumber}, ${CLIENT_ID}, ${OWNER_ID},
            'Regular', 'PPN', null, 'RFQ / New Product', 300000,
            2, 150000, '2026-07-19'
          ),
          (
            ${salesOrderIds[1]}, ${soNumber}, ${CLIENT_ID}, ${OWNER_ID},
            'Regular', 'PPN', null, 'RFQ / New Product', 400000,
            4, 100000, '2026-07-19'
          )
      `;

      // Task 2 has already repointed the live FK to normalized sales_orders.
      // Temporarily bypass FK triggers on one reserved local connection so
      // this fixture can reproduce the pre-migration state: activity_log
      // still holding a legacy sales-order UUID when the conversion runs.
      const reserved = await db.reserve();
      try {
        await reserved`set session_replication_role = 'replica'`;
        await reserved`
          insert into public.activity_log (
            id, kind, owner_id, actor_id, client_id, sales_order_id, title
          ) values (
            ${salesOrderActivityId}, 'sales_order_created', ${OWNER_ID},
            ${OWNER_ID}, ${CLIENT_ID}, ${salesOrderIds[0]},
            ${`Normalization sales-order activity ${marker}`}
          )
        `;
      } finally {
        await reserved`set session_replication_role = 'origin'`;
        reserved.release();
      }

      await db`select private.migrate_commercial_document_data()`;

      const commercialRows = (await db`
        select d.id, count(i.id)::integer as item_count, sum(i.line_total) as total
        from public.commercial_documents d
        join public.commercial_document_items i
          on i.commercial_document_id = d.id
        where d.rfq_number = ${rfqNumber}
        group by d.id
      `) as Row[];
      expect(commercialRows).toHaveLength(1);
      expect(commercialRows[0]?.item_count).toBe(2);
      expect(commercialRows[0]?.total).toBe("650000");

      const salesOrderRows = (await db`
        select s.id, count(i.id)::integer as item_count, s.total_value
        from public.sales_orders s
        join public.sales_order_items i on i.sales_order_id = s.id
        where s.so_number = ${soNumber}
        group by s.id
      `) as Row[];
      expect(salesOrderRows).toHaveLength(1);
      expect(salesOrderRows[0]?.item_count).toBe(2);
      expect(salesOrderRows[0]?.total_value).toBe("700000");

      const linkRows = (await db`
        select
          t.commercial_document_id as task_document_id,
          f.commercial_document_id as follow_up_document_id,
          ac.commercial_document_id as activity_document_id,
          aso.sales_order_id as activity_sales_order_id
        from public.tasks t
        cross join public.follow_up_logs f
        cross join public.activity_log ac
        cross join public.activity_log aso
        where t.id = ${taskId}
          and f.id = ${followUpId}
          and ac.id = ${commercialActivityId}
          and aso.id = ${salesOrderActivityId}
      `) as Row[];
      expect(linkRows).toHaveLength(1);
      expect(linkRows[0]?.task_document_id).toBe(commercialRows[0]?.id);
      expect(linkRows[0]?.follow_up_document_id).toBe(commercialRows[0]?.id);
      expect(linkRows[0]?.activity_document_id).toBe(commercialRows[0]?.id);
      expect(linkRows[0]?.activity_sales_order_id).toBe(salesOrderRows[0]?.id);
    } finally {
      await db`
        delete from public.activity_log
        where id in ${db([commercialActivityId, salesOrderActivityId])}
      `;
      await db`delete from public.follow_up_logs where id = ${followUpId}`;
      await db`delete from public.tasks where id = ${taskId}`;
      await db`delete from public.sales_orders where so_number = ${soNumber}`;
      await db`
        delete from private.sales_order_id_map
        where legacy_sales_order_id in ${db(salesOrderIds)}
      `;
      await db`
        delete from private.commercial_document_migration_review
        where source_table = 'sales_orders'
          and legacy_id in ${db(salesOrderIds)}
      `;
      await db`
        delete from private.legacy_sales_orders_20260718
        where id in ${db(salesOrderIds)}
      `;
      await db`
        delete from public.commercial_documents
        where rfq_number = ${rfqNumber}
      `;
      await cleanupCommercialFixture(commercialIds);
    }
  });

  test("rejects incompatible same-number groups into the review table", async () => {
    const rfqNumber = `RFQ-COLLISION-${crypto.randomUUID().slice(0, 8)}`;
    const legacyIds = [crypto.randomUUID(), crypto.randomUUID()];
    const otherClientId = "a0000000-0000-4000-8000-000000000014";

    try {
      await db`
        insert into private.legacy_commercial_items_20260718 (
          id, client_id, owner_id, type, source_flow, stage, description,
          estimated_value, rfq_number
        ) values
          (
            ${legacyIds[0]}, ${CLIENT_ID}, ${OWNER_ID}, 'RFQ',
            'RFQ / New Product', 'Client Request for Quotes',
            'Collision line A', 100000, ${rfqNumber}
          ),
          (
            ${legacyIds[1]}, ${otherClientId}, ${OWNER_ID}, 'RFQ',
            'RFQ / New Product', 'Client Request for Quotes',
            'Collision line B', 100000, ${rfqNumber}
          )
      `;

      await db`select private.migrate_commercial_document_data()`;

      const reviewRows = (await db`
        select reason
        from private.commercial_document_migration_review
        where source_table = 'commercial_items'
          and legacy_id in ${db(legacyIds)}
      `) as Row[];
      const documentRows = await db`
        select id
        from public.commercial_documents
        where rfq_number = ${rfqNumber}
      `;

      expect(reviewRows).toHaveLength(2);
      expect(
        reviewRows.every(
          (row) => row.reason === "INCOMPATIBLE_GROUP_COLLISION",
        ),
      ).toBe(true);
      expect(documentRows).toHaveLength(0);
    } finally {
      await cleanupCommercialFixture(legacyIds);
    }
  });
});
