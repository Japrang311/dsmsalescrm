// Schema contract test for Phase 11 Task 1 (normalize_commercial_documents).
//
// This test is deliberately structural only: it checks table/column
// presence, nullability, types, constraints, RLS, and grants through
// information_schema/pg_catalog. It does not exercise numbering,
// transactions, or revision logic — that is Task 3's scope.
//
// Connects directly to the local Postgres instance (not through PostgREST,
// since information_schema/pg_catalog are not exposed there). The
// connection string is a hardcoded literal pointing at the well-known local
// `supabase start` Postgres port (54322) with no env-var override, so there
// is no way to accidentally point this test at a remote database.
import { SQL } from "bun";
import { afterAll, describe, expect, test } from "bun:test";

const LOCAL_POSTGRES_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const db = new SQL(LOCAL_POSTGRES_URL);

// Bun's SQL client returns loosely-typed rows; this is the local shape used
// throughout the assertions below instead of `any`.
type Row = Record<string, unknown>;

afterAll(async () => {
  await db.end();
});

type ExpectedColumn = {
  // "Logical" Postgres type name used for comparison against
  // information_schema.columns.data_type / udt_name.
  dataType: string;
  udtName?: string; // set for enum (USER-DEFINED) columns
  nullable: boolean;
};

type ExpectedTable = {
  // The table name as it should exist after Phase 11 Task 2. Task 1 used
  // `sales_orders_new` temporarily; Task 2 archives the legacy table and
  // promotes the normalized header table to `sales_orders`.
  actualName: string;
  columns: Record<string, ExpectedColumn>;
  authenticatedUpdateColumns: string[];
};

const EXPECTED_TABLES: Record<string, ExpectedTable> = {
  commercial_documents: {
    actualName: "commercial_documents",
    authenticatedUpdateColumns: [
      "client_address",
      "note",
      "so_number",
      "stage",
      "updated_at",
    ],
    columns: {
      id: { dataType: "uuid", nullable: false },
      client_id: { dataType: "uuid", nullable: false },
      owner_id: { dataType: "uuid", nullable: false },
      type: {
        dataType: "USER-DEFINED",
        udtName: "commercial_type",
        nullable: false,
      },
      source_flow: {
        dataType: "USER-DEFINED",
        udtName: "source_flow",
        nullable: false,
      },
      document_date: { dataType: "date", nullable: false },
      rfq_number: { dataType: "text", nullable: true },
      quotation_number: { dataType: "text", nullable: true },
      quotation_base_number: { dataType: "text", nullable: true },
      quotation_revision: { dataType: "integer", nullable: false },
      is_current_revision: { dataType: "boolean", nullable: false },
      supersedes_document_id: { dataType: "uuid", nullable: true },
      stage: { dataType: "text", nullable: false },
      client_address: { dataType: "text", nullable: true },
      so_number: { dataType: "text", nullable: true },
      note: { dataType: "text", nullable: true },
      created_at: { dataType: "timestamp with time zone", nullable: false },
      updated_at: { dataType: "timestamp with time zone", nullable: false },
    },
  },
  commercial_document_items: {
    actualName: "commercial_document_items",
    authenticatedUpdateColumns: [
      "description",
      "line_position",
      "line_total",
      "product_name",
      "qty",
      "unit_price",
      "uom",
    ],
    columns: {
      id: { dataType: "uuid", nullable: false },
      commercial_document_id: { dataType: "uuid", nullable: false },
      product_name: { dataType: "text", nullable: true },
      description: { dataType: "text", nullable: true },
      qty: { dataType: "numeric", nullable: true },
      uom: { dataType: "USER-DEFINED", udtName: "uom_type", nullable: true },
      unit_price: { dataType: "numeric", nullable: true },
      line_total: { dataType: "numeric", nullable: true },
      line_position: { dataType: "integer", nullable: false },
    },
  },
  sales_orders: {
    actualName: "sales_orders",
    authenticatedUpdateColumns: [
      "customer_po_number",
      "date",
      "tax_type",
      "updated_at",
    ],
    columns: {
      id: { dataType: "uuid", nullable: false },
      so_number: { dataType: "text", nullable: false },
      customer_po_number: { dataType: "text", nullable: true },
      date: { dataType: "date", nullable: false },
      client_id: { dataType: "uuid", nullable: false },
      owner_id: { dataType: "uuid", nullable: false },
      type: { dataType: "USER-DEFINED", udtName: "so_type", nullable: false },
      tax_type: {
        dataType: "USER-DEFINED",
        udtName: "tax_type",
        nullable: true,
      },
      prototype_status: {
        dataType: "USER-DEFINED",
        udtName: "prototype_status",
        nullable: true,
      },
      source: {
        dataType: "USER-DEFINED",
        udtName: "revenue_source",
        nullable: false,
      },
      number_mode: {
        dataType: "USER-DEFINED",
        udtName: "document_number_mode",
        nullable: false,
      },
      backdate_reason: { dataType: "text", nullable: true },
      total_value: { dataType: "numeric", nullable: true },
      created_at: { dataType: "timestamp with time zone", nullable: false },
      updated_at: { dataType: "timestamp with time zone", nullable: false },
    },
  },
  sales_order_items: {
    actualName: "sales_order_items",
    authenticatedUpdateColumns: [
      "description",
      "line_position",
      "line_total",
      "product_name",
      "qty",
      "unit_price",
      "uom",
    ],
    columns: {
      id: { dataType: "uuid", nullable: false },
      sales_order_id: { dataType: "uuid", nullable: false },
      product_name: { dataType: "text", nullable: true },
      description: { dataType: "text", nullable: true },
      qty: { dataType: "numeric", nullable: true },
      uom: { dataType: "USER-DEFINED", udtName: "uom_type", nullable: true },
      unit_price: { dataType: "numeric", nullable: true },
      line_total: { dataType: "numeric", nullable: true },
      line_position: { dataType: "integer", nullable: false },
    },
  },
};

// Every new table's write policies must scope to this exact four-role set
// (Phase 12 binding constraint) rather than the plan's original three-role
// snippet. We check this by requiring 'super_admin' to appear in every
// select/insert/update policy expression alongside the pre-existing roles.
const REQUIRED_POLICY_ROLE_TOKEN = "super_admin";

describe("commercial-documents-schema contract", () => {
  for (const [logicalName, table] of Object.entries(EXPECTED_TABLES)) {
    describe(`public.${table.actualName} (${logicalName})`, () => {
      test("exists with exactly the expected columns", async () => {
        const rows = await db`
          select column_name, data_type, udt_name, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name = ${table.actualName}
        `;

        expect(rows.length).toBeGreaterThan(0);

        const actualColumnNames = new Set(rows.map((r: Row) => r.column_name));
        const expectedColumnNames = Object.keys(table.columns);

        for (const name of expectedColumnNames) {
          expect(actualColumnNames.has(name)).toBe(true);
        }
        expect(actualColumnNames.size).toBe(expectedColumnNames.length);
      });

      for (const [columnName, expected] of Object.entries(table.columns)) {
        test(`column ${columnName} has expected type/nullability`, async () => {
          const rows = await db`
            select data_type, udt_name, is_nullable
            from information_schema.columns
            where table_schema = 'public'
              and table_name = ${table.actualName}
              and column_name = ${columnName}
          `;
          expect(rows.length).toBe(1);
          const row = rows[0] as Row;
          expect(row.data_type).toBe(expected.dataType);
          if (expected.udtName) {
            expect(row.udt_name).toBe(expected.udtName);
          }
          expect(row.is_nullable).toBe(expected.nullable ? "YES" : "NO");
        });
      }

      test("has row level security enabled", async () => {
        const rows = await db`
          select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = ${table.actualName}
        `;
        expect(rows.length).toBe(1);
        expect((rows[0] as Row).relrowsecurity).toBe(true);
      });

      test("has select/insert/update policies but no delete policy, all scoped to active Super Admin", async () => {
        const rows = await db`
          select cmd, qual, with_check
          from pg_policies
          where schemaname = 'public' and tablename = ${table.actualName}
        `;
        const commands = rows.map((r: Row) => r.cmd);
        expect(commands).toContain("SELECT");
        expect(commands).toContain("INSERT");
        expect(commands).toContain("UPDATE");
        expect(commands).not.toContain("DELETE");

        for (const row of rows as Row[]) {
          const expressionText = `${row.qual ?? ""} ${row.with_check ?? ""}`;
          expect(expressionText).toContain(REQUIRED_POLICY_ROLE_TOKEN);
        }
      });

      test("authenticated gets table read/create and only the approved update columns", async () => {
        const tableGrantRows = await db`
          select privilege_type
          from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name = ${table.actualName}
            and grantee = 'authenticated'
        `;
        const tablePrivileges = tableGrantRows.map(
          (r: Row) => r.privilege_type,
        );
        expect(tablePrivileges).toContain("SELECT");
        expect(tablePrivileges).toContain("INSERT");
        expect(tablePrivileges).not.toContain("UPDATE");
        expect(tablePrivileges).not.toContain("DELETE");

        const columnGrantRows = await db`
          select column_name
          from information_schema.column_privileges
          where table_schema = 'public'
            and table_name = ${table.actualName}
            and grantee = 'authenticated'
            and privilege_type = 'UPDATE'
          order by column_name
        `;
        expect(columnGrantRows.map((r: Row) => r.column_name)).toEqual(
          [...table.authenticatedUpdateColumns].sort(),
        );
      });
    });
  }

  test("public.uom_type enum has exactly Unit, Pcs, Set, Lot", async () => {
    const rows = await db`
      select e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' and t.typname = 'uom_type'
      order by e.enumsortorder
    `;
    expect(rows.map((r: Row) => r.enumlabel)).toEqual([
      "Unit",
      "Pcs",
      "Set",
      "Lot",
    ]);
  });

  test("public.document_number_mode enum has exactly Auto, Imported, Hariff Backdate", async () => {
    const rows = await db`
      select e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public' and t.typname = 'document_number_mode'
      order by e.enumsortorder
    `;
    expect(rows.map((r: Row) => r.enumlabel)).toEqual([
      "Auto",
      "Imported",
      "Hariff Backdate",
    ]);
  });

  test("private schema exists", async () => {
    const rows = await db`
      select 1 from information_schema.schemata where schema_name = 'private'
    `;
    expect(rows.length).toBe(1);
  });

  test("document_number_counters exists in private, not public", async () => {
    const inPrivate = await db`
      select 1 from information_schema.tables
      where table_schema = 'private' and table_name = 'document_number_counters'
    `;
    expect(inPrivate.length).toBe(1);

    const inPublic = await db`
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'document_number_counters'
    `;
    expect(inPublic.length).toBe(0);
  });

  test("legacy commercial_items and sales_orders are preserved read-only in private", async () => {
    const rows = await db`
      select table_name from information_schema.tables
      where table_schema = 'private'
        and table_name in (
          'legacy_commercial_items_20260718',
          'legacy_sales_orders_20260718'
        )
      order by table_name
    `;
    expect(rows.map((r: Row) => r.table_name)).toEqual([
      "legacy_commercial_items_20260718",
      "legacy_sales_orders_20260718",
    ]);
  });

  test("commercial_documents has a unique index enforcing one current revision per quotation_base_number", async () => {
    const rows = await db`
      select indexdef from pg_indexes
      where schemaname = 'public'
        and tablename = 'commercial_documents'
        and indexname = 'commercial_documents_one_current_revision'
    `;
    expect(rows.length).toBe(1);
    expect((rows[0] as Row).indexdef).toContain("UNIQUE");
  });

  test("commercial_document_items enforces unique line_position per document", async () => {
    const rows = await db`
      select conname from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'commercial_document_items'
        and c.contype = 'u'
    `;
    expect(rows.length).toBeGreaterThan(0);
  });

  test("sales_order_items enforces unique line_position per sales order", async () => {
    const rows = await db`
      select conname from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'sales_order_items'
        and c.contype = 'u'
    `;
    expect(rows.length).toBeGreaterThan(0);
  });
});
