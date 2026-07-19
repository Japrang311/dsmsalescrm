import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const CLIENT_ID = "a0000000-0000-4000-8000-000000000001";
const OWNER_ID = "22222222-2222-2222-2222-222222222222";

function quotation(number: string, uom = "Pcs") {
  return {
    header: {
      kind: "commercial",
      quotationNumber: number,
      quotationBaseNumber: number,
      quotationRevision: 0,
      isCurrentRevision: true,
      supersedesQuotationNumber: null,
      documentDate: "2026-07-19",
      clientId: CLIENT_ID,
      ownerId: OWNER_ID,
      clientAddress: null,
      stage: "Quotes Sent",
      soNumber: null,
      note: "Transactional import test",
    },
    items: [
      {
        productName: null,
        description: "Imported line",
        qty: 2,
        uom,
        unitPrice: 1000,
        lineTotal: 2000,
        linePosition: 1,
      },
    ],
  };
}

afterAll(async () => {
  await db`
    delete from public.commercial_documents
    where quotation_number like 'IMPORT-TX-%'
  `;
  await db`
    delete from private.document_number_counters
    where series = 'QUO' and year_code = 88
  `;
  await db.end();
});

describe("normalized Sheet import transaction", () => {
  test("authenticated browser roles cannot call the import RPC", async () => {
    const users = await createRoleFixtureUsers();
    try {
      const managerClient = await signInAs(users.manager);
      const { error } = await managerClient.rpc(
        "admin_import_normalized_documents",
        { p_documents: [], p_counter_seeds: [] },
      );
      expect(error?.code).toBe("42501");
    } finally {
      await deleteRoleFixtureUsers(users);
    }
  });

  test("a rejected item rolls back earlier headers and counter seeds", async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    const validNumber = `IMPORT-TX-VALID-${marker}`;
    const invalidNumber = `IMPORT-TX-INVALID-${marker}`;
    const { error } = await adminClient.rpc(
      "admin_import_normalized_documents",
      {
        p_documents: [quotation(validNumber), quotation(invalidNumber, "Box")],
        p_counter_seeds: [{ series: "QUO", yearCode: 88, lastValue: 999 }],
      },
    );
    expect(error).not.toBeNull();

    const documents = await db`
      select quotation_number
      from public.commercial_documents
      where quotation_number in ${db([validNumber, invalidNumber])}
    `;
    const counters = await db`
      select last_value
      from private.document_number_counters
      where series = 'QUO' and year_code = 88
    `;
    expect(documents).toHaveLength(0);
    expect(counters).toHaveLength(0);
  });

  test("service role imports a reconciled document and seed together", async () => {
    const number = `IMPORT-TX-SUCCESS-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await adminClient.rpc(
      "admin_import_normalized_documents",
      {
        p_documents: [quotation(number)],
        p_counter_seeds: [{ series: "QUO", yearCode: 88, lastValue: 12 }],
      },
    );
    expect(error).toBeNull();
    expect(data).toEqual({ documents: 1, items: 1, counter_seeds: 1 });

    const rows = await db`
      select d.quotation_number, count(i.id)::integer as item_count
      from public.commercial_documents d
      join public.commercial_document_items i
        on i.commercial_document_id = d.id
      where d.quotation_number = ${number}
      group by d.id
    `;
    const counter = await db`
      select last_value
      from private.document_number_counters
      where series = 'QUO' and year_code = 88
    `;
    expect(rows[0]).toMatchObject({ quotation_number: number, item_count: 1 });
    expect(counter[0]?.last_value).toBe(12);
  });
});
