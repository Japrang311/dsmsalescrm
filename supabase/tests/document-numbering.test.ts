import { SQL } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

const db = new SQL("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
const createdClients: string[] = [];
let fixtures: RoleFixtureUsers | undefined;
let ownedClientId: string | undefined;
let hariffClientId: string | undefined;

const paidItems = [
  {
    productName: "Bracket A",
    description: "Laser cut",
    qty: 2,
    uom: "Pcs",
    unitPrice: 125_000,
  },
];

function users(): RoleFixtureUsers {
  if (!fixtures) throw new Error("Numbering fixtures unavailable");
  return fixtures;
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  for (const name of [
    `Numbering Client ${crypto.randomUUID()}`,
    "PT. HARIFF DAYA TUNGGAL ENGINEERING",
  ]) {
    const { data, error } = await adminClient
      .from("clients")
      .insert({
        name,
        status: "Active Customer",
        source: "Referral",
        owner_id: users().sales.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    createdClients.push(data.id);
    if (name.startsWith("Numbering Client")) ownedClientId = data.id;
    else hariffClientId = data.id;
  }
});

afterAll(async () => {
  if (fixtures) {
    await adminClient
      .from("activity_log")
      .delete()
      .eq("owner_id", fixtures.sales.id);
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("owner_id", fixtures.sales.id);
    await adminClient
      .from("sales_orders")
      .delete()
      .eq("owner_id", fixtures.sales.id);
  }
  if (createdClients.length > 0) {
    await adminClient.from("clients").delete().in("id", createdClients);
  }
  await db`
    delete from private.document_number_counters
    where year_code in (91, 92, 93, 94)
  `;
  await deleteRoleFixtureUsers(fixtures);
  await db.end();
});

describe("Phase 11 atomic document numbering", () => {
  test("allocates independent seeded series and resets each in the next year", async () => {
    await db`
      delete from private.document_number_counters
      where year_code = 92
    `;
    await db`
      insert into private.document_number_counters (series, year_code, last_value)
      values ('QUO', 91, 404), ('SO', 91, 143), ('NP', 91, 16), ('PROTY', 91, 8)
      on conflict (series, year_code)
      do update set last_value = excluded.last_value
    `;

    const rows = await Promise.all([
      db`select private.allocate_document_number('QUO', 91::smallint) as number`,
      db`select private.allocate_document_number('SO', 91::smallint) as number`,
      db`select private.allocate_document_number('NP', 91::smallint) as number`,
      db`select private.allocate_document_number('PROTY', 91::smallint) as number`,
      db`select private.allocate_document_number('QUO', 92::smallint) as number`,
      db`select private.allocate_document_number('SO', 92::smallint) as number`,
      db`select private.allocate_document_number('NP', 92::smallint) as number`,
      db`select private.allocate_document_number('PROTY', 92::smallint) as number`,
    ]);

    expect(rows.map((row) => row[0]?.number)).toEqual([
      "DSM-91QUO-0405",
      "DSM-91SO144",
      "DSM-91NP017",
      "DSM-91PROTY009",
      "DSM-92QUO-0001",
      "DSM-92SO001",
      "DSM-92NP001",
      "DSM-92PROTY001",
    ]);
  });

  test("serializes 20 concurrent allocations without duplicate or gap", async () => {
    await db`
      delete from private.document_number_counters
      where series = 'SO' and year_code = 93
    `;
    const rows = await Promise.all(
      Array.from(
        { length: 20 },
        () =>
          db`select private.allocate_document_number('SO', 93::smallint) as number`,
      ),
    );
    const numbers = rows
      .map((row) => String(row[0]?.number))
      .sort((a, b) => a.localeCompare(b));

    expect(new Set(numbers).size).toBe(20);
    expect(numbers[0]).toBe("DSM-93SO001");
    expect(numbers[19]).toBe("DSM-93SO020");
  });

  test("failed quotation items roll back both header and counter", async () => {
    const salesClient = await signInAs(users().sales);
    await db`
      delete from private.document_number_counters
      where series = 'QUO' and year_code = 94
    `;

    const { error } = await salesClient.rpc("create_quotation", {
      p_client_id: ownedClientId,
      p_document_date: "2094-07-19",
      p_client_address: null,
      p_stage: "Quotes Sent",
      p_so_number: null,
      p_note: null,
      p_items: [{ ...paidItems[0], productName: "" }],
    });
    expect(error?.message).toContain("PRODUCT_NAME_REQUIRED");

    const { data, error: validError } = await salesClient.rpc(
      "create_quotation",
      {
        p_client_id: ownedClientId,
        p_document_date: "2094-07-19",
        p_client_address: null,
        p_stage: "Quotes Sent",
        p_so_number: null,
        p_note: null,
        p_items: paidItems,
      },
    );
    expect(validError).toBeNull();
    expect(data.quotation_number).toBe("DSM-94QUO-0001");
  });

  test("creates canonical sequential revisions and only one current version", async () => {
    const salesClient = await signInAs(users().sales);
    const { data: base, error: baseError } = await salesClient.rpc(
      "create_quotation",
      {
        p_client_id: ownedClientId,
        p_document_date: "2094-07-19",
        p_client_address: "Workshop A",
        p_stage: "Quotes Sent",
        p_so_number: null,
        p_note: "Base",
        p_items: paidItems,
      },
    );
    expect(baseError).toBeNull();

    const { data: rev1, error: rev1Error } = await salesClient.rpc(
      "revise_quotation",
      {
        p_document_id: base.id,
        p_document_date: "2094-07-20",
        p_client_address: "Workshop A",
        p_so_number: null,
        p_note: "Revision 1",
        p_items: [{ ...paidItems[0], unitPrice: 130_000 }],
      },
    );
    expect(rev1Error).toBeNull();
    expect(rev1.quotation_number).toBe(`${base.quotation_number}_REV.1`);

    const { data: rev2, error: rev2Error } = await salesClient.rpc(
      "revise_quotation",
      {
        p_document_id: rev1.id,
        p_document_date: "2094-07-21",
        p_client_address: "Workshop B",
        p_so_number: null,
        p_note: "Revision 2",
        p_items: paidItems,
      },
    );
    expect(rev2Error).toBeNull();
    expect(rev2.quotation_number).toBe(`${base.quotation_number}_REV.2`);

    const chain = await db`
      select quotation_revision, is_current_revision, supersedes_document_id
      from public.commercial_documents
      where quotation_base_number = ${base.quotation_number}
      order by quotation_revision
    `;
    expect(
      chain.map(
        (row: { is_current_revision: boolean }) => row.is_current_revision,
      ),
    ).toEqual([false, false, true]);
    expect(chain[2]?.supersedes_document_id).toBe(rev1.id);
  });

  test("selects SO, NP, and PROTY series from classification", async () => {
    const salesClient = await signInAs(users().sales);
    await db`
      delete from private.document_number_counters
      where year_code = 94 and series in ('SO', 'NP', 'PROTY')
    `;
    const inputs = [
      {
        type: "Regular",
        taxType: "PPN",
        prototypeStatus: null,
        expected: "DSM-94SO001",
      },
      {
        type: "Regular",
        taxType: "Non-PPN",
        prototypeStatus: null,
        expected: "DSM-94NP001",
      },
      {
        type: "Prototype",
        taxType: "PPN",
        prototypeStatus: "Paid",
        expected: "DSM-94PROTY001",
      },
      {
        type: "Prototype",
        taxType: null,
        prototypeStatus: "FOC",
        expected: "DSM-94PROTY002",
      },
    ];

    for (const input of inputs) {
      const foc = input.prototypeStatus === "FOC";
      const { data, error } = await salesClient.rpc("create_sales_order", {
        p_client_id: ownedClientId,
        p_date: "2094-07-19",
        p_customer_po_number: `PO-${crypto.randomUUID()}`,
        p_type: input.type,
        p_tax_type: input.taxType,
        p_prototype_status: input.prototypeStatus,
        p_source: foc ? "Prototype FOC" : "RFQ / New Product",
        p_number_mode: "Auto",
        p_manual_so_number: null,
        p_backdate_reason: null,
        p_items: foc ? [{ ...paidItems[0], unitPrice: null }] : paidItems,
      });
      expect(error).toBeNull();
      expect(data.so_number).toBe(input.expected);
      expect(data.total_value).toBe(foc ? null : 250_000);
    }
  });

  test("HARIFF backdate is restricted, rejects duplicates, and consumes no counter", async () => {
    const salesClient = await signInAs(users().sales);
    const before = await db`
      select last_value from private.document_number_counters
      where series = 'SO' and year_code = 94
    `;
    const manual = `DSM-22SO-${crypto.randomUUID().slice(0, 8)}`;
    const args = {
      p_client_id: hariffClientId,
      p_date: "2094-07-19",
      p_customer_po_number: `PO-${crypto.randomUUID()}`,
      p_type: "Regular",
      p_tax_type: "PPN",
      p_prototype_status: null,
      p_source: "Existing / Repeat Order",
      p_number_mode: "Hariff Backdate",
      p_manual_so_number: manual,
      p_backdate_reason: "Historical HARIFF reference",
      p_items: paidItems,
    };

    const first = await salesClient.rpc("create_sales_order", args);
    expect(first.error).toBeNull();
    expect(first.data.so_number).toBe(manual);

    const duplicate = await salesClient.rpc("create_sales_order", {
      ...args,
      p_customer_po_number: `PO-${crypto.randomUUID()}`,
    });
    expect(duplicate.error?.message).toContain("SO_NUMBER_ALREADY_EXISTS");

    const invalidClient = await salesClient.rpc("create_sales_order", {
      ...args,
      p_client_id: ownedClientId,
      p_manual_so_number: `${manual}-OTHER`,
    });
    expect(invalidClient.error?.message).toContain(
      "HARIFF_BACKDATE_CLIENT_REQUIRED",
    );

    const after = await db`
      select last_value from private.document_number_counters
      where series = 'SO' and year_code = 94
    `;
    expect(after[0]?.last_value).toBe(before[0]?.last_value);
  });
});
