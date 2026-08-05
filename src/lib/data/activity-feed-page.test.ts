import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { supabase } from "@/lib/supabase";
import {
  listActivityFeedPage,
  mapActivityFeedRow,
  type ActivityFeedEventRow,
} from "./activity-feed-page";

let fixtures: RoleFixtureUsers;
let clientId: string;
const activityIds: string[] = [];
const followUpIds: string[] = [];

async function authenticate(user: RoleFixtureUsers[keyof RoleFixtureUsers]) {
  const authClient = await signInAs(user);
  const session = (await authClient.auth.getSession()).data.session!;
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: client, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `Activity feed fixture ${crypto.randomUUID()}`,
      status: "Active Customer",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = client.id;

  const activityRows = [
    {
      kind: "client_created",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.sales.id,
      client_id: clientId,
      title: "Client dibuat oleh Sales",
      created_at: "2096-06-01T08:00:00Z",
    },
    {
      kind: "commercial_item_stage_change",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.sales.id,
      client_id: clientId,
      title: "Pindah tahap ke Negotiation",
      detail: "Alasan khusus PENANDA-CARI",
      created_at: "2096-06-01T10:00:00Z",
    },
    {
      // Not mapped to any feed_kind — must never appear in results.
      kind: "client_details_change",
      owner_id: fixtures.sales.id,
      actor_id: fixtures.sales.id,
      client_id: clientId,
      title: "Info klien diperbarui",
      created_at: "2096-06-01T11:00:00Z",
    },
    {
      kind: "client_created",
      owner_id: fixtures.manager.id,
      actor_id: fixtures.manager.id,
      client_id: null,
      title: "Client dibuat oleh Manager",
      created_at: "2096-06-01T12:00:00Z",
    },
  ];
  const { data: insertedActivity, error: activityError } = await adminClient
    .from("activity_log")
    .insert(activityRows)
    .select("id");
  if (activityError) throw activityError;
  activityIds.push(...(insertedActivity ?? []).map((row) => row.id));

  const { data: insertedFollowUp, error: followUpError } = await adminClient
    .from("follow_up_logs")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      fu_date: "2096-06-01",
      method: "Phone",
      result: "Interested",
      notes: "Catatan follow-up PENANDA-CARI",
      created_at: "2096-06-01T09:00:00Z",
    })
    .select("id")
    .single();
  if (followUpError) throw followUpError;
  followUpIds.push(insertedFollowUp.id);
});

afterAll(async () => {
  await supabase.auth.signOut();
  await adminClient.from("follow_up_logs").delete().in("id", followUpIds);
  await adminClient.from("activity_log").delete().in("id", activityIds);
  await adminClient.from("clients").delete().eq("id", clientId);
  await deleteRoleFixtureUsers(fixtures);
});

describe("listActivityFeedPage", () => {
  test("merges both sources ordered by time descending across pages with no duplicates or gaps", async () => {
    await authenticate(fixtures.manager);
    const firstPage = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
      },
      page: { pageSize: 2 },
    });
    expect(firstPage.rows).toHaveLength(2);
    expect(firstPage.rows[0].at >= firstPage.rows[1].at).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
      },
      page: { pageSize: 2, cursor: firstPage.nextCursor },
    });
    expect(secondPage.rows).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();

    // 4 total: 3 mapped activity_log rows + 1 follow_up row.
    // client_details_change is excluded by the view.
    const allIds = [...firstPage.rows, ...secondPage.rows].map(
      (r) => r.eventId,
    );
    expect(new Set(allIds).size).toBe(4);
    expect(firstPage.totalCount).toBe(4);

    const ats = [...firstPage.rows, ...secondPage.rows].map((r) => r.at);
    const sortedDesc = [...ats].sort().reverse();
    expect(ats).toEqual(sortedDesc);
    await supabase.auth.signOut();
  });

  test("excludes db_kinds with no feed-kind mapping", async () => {
    await authenticate(fixtures.manager);
    const page = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
      },
      page: { pageSize: 25 },
    });
    expect(page.rows.some((r) => r.title === "Info klien diperbarui")).toBe(
      false,
    );
    await supabase.auth.signOut();
  });

  test("filters by feed_kind", async () => {
    await authenticate(fixtures.manager);
    const page = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
        feedKind: "commercial_history",
      },
      page: { pageSize: 25 },
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].feedKind).toBe("commercial_history");
    await supabase.auth.signOut();
  });

  test("filters by owner id", async () => {
    await authenticate(fixtures.manager);
    const page = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
        ownerId: fixtures.manager.id,
      },
      page: { pageSize: 25 },
    });
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].title).toBe("Client dibuat oleh Manager");
    await supabase.auth.signOut();
  });

  test("free-text search matches enriched fields across both sources", async () => {
    await authenticate(fixtures.manager);
    const page = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
        query: "PENANDA-CARI",
      },
      page: { pageSize: 25 },
    });
    // One activity_log row (detail) + one follow_up row (notes).
    expect(page.rows).toHaveLength(2);
    await supabase.auth.signOut();
  });

  test("Sales only sees own owner_id rows; Manager sees all", async () => {
    await authenticate(fixtures.sales);
    const salesPage = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
      },
      page: { pageSize: 25 },
    });
    expect(
      salesPage.rows.every((r) => r.title !== "Client dibuat oleh Manager"),
    ).toBe(true);
    await supabase.auth.signOut();

    await authenticate(fixtures.manager);
    const managerPage = await listActivityFeedPage({
      filters: {
        from: new Date("2096-06-01T00:00:00Z"),
        to: new Date("2096-06-01T23:59:59Z"),
      },
      page: { pageSize: 25 },
    });
    expect(
      managerPage.rows.some((r) => r.title === "Client dibuat oleh Manager"),
    ).toBe(true);
    await supabase.auth.signOut();
  });
});

describe("mapActivityFeedRow", () => {
  const owners = {
    "owner-1": { name: "Nur Iman" },
    "actor-1": { name: "Leli Al" },
    "target-1": { name: "Andri Sutomo" },
  };

  function baseRow(
    overrides: Partial<ActivityFeedEventRow>,
  ): ActivityFeedEventRow {
    return {
      eventId: "activity-1",
      source: "activity_log",
      sourceId: "1",
      at: "2096-06-01T10:00:00Z",
      feedKind: "client_created",
      dbKind: "client_created",
      clientId: null,
      ownerId: "owner-1",
      actorId: null,
      targetProfileId: null,
      targetProfileSnapshot: null,
      administrativeReason: null,
      kindLabel: null,
      title: "Client dibuat",
      detail: null,
      commercialItemId: null,
      commercialItemType: null,
      salesOrderId: null,
      ...overrides,
    };
  }

  test("builds a Quotation link for commercial_history rows", () => {
    const event = mapActivityFeedRow(
      baseRow({
        feedKind: "commercial_history",
        commercialItemId: "doc-1",
        commercialItemType: "Quotation",
      }),
      owners,
    );
    expect(event.link).toEqual({
      to: "/quotations/$id",
      params: { id: "doc-1" },
      label: "Buka Quotation",
    });
  });

  test("builds a Sales Order link only for the restored record_lifecycle variant", () => {
    const restored = mapActivityFeedRow(
      baseRow({
        feedKind: "record_lifecycle",
        dbKind: "sales_order_restored",
        salesOrderId: "so-1",
      }),
      owners,
    );
    expect(restored.link?.to).toBe("/sales-orders/$soId");

    const deleted = mapActivityFeedRow(
      baseRow({
        feedKind: "record_lifecycle",
        dbKind: "sales_order_deleted",
        salesOrderId: "so-1",
      }),
      owners,
    );
    expect(deleted.link).toBeUndefined();
  });

  test("resolves actor/target names for team_admin rows", () => {
    const event = mapActivityFeedRow(
      baseRow({
        feedKind: "team_admin",
        dbKind: "team_member_role_changed",
        actorId: "actor-1",
        targetProfileId: "target-1",
        kindLabel: "Role Anggota Tim Diubah",
        administrativeReason: "Promosi ke Manager",
      }),
      owners,
    );
    expect(event.actorName).toBe("Leli Al");
    expect(event.targetName).toBe("Andri Sutomo");
    expect(event.kindLabel).toBe("Role Anggota Tim Diubah");
    expect(event.administrativeReason).toBe("Promosi ke Manager");
  });
});
