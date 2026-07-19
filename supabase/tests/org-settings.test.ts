import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "./helpers";

let fixtures: RoleFixtureUsers;
let originalCompanyName: string;

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data, error } = await adminClient
    .from("org_settings")
    .select("company_name")
    .eq("id", true)
    .single();
  if (error) throw error;
  originalCompanyName = data.company_name;
});

afterAll(async () => {
  await adminClient
    .from("org_settings")
    .update({ company_name: originalCompanyName })
    .eq("id", true);
  await deleteRoleFixtureUsers(fixtures);
});

describe("org_settings RLS", () => {
  test("every role can read the singleton row", async () => {
    for (const fixture of [
      fixtures.sales,
      fixtures.manager,
      fixtures.executive,
    ]) {
      const client = await signInAs(fixture);
      const { data, error } = await client
        .from("org_settings")
        .select("*")
        .eq("id", true)
        .single();
      if (error) throw error;
      expect(data.id).toBe(true);
      await client.auth.signOut();
    }
  });

  test("manager can update org settings", async () => {
    const client = await signInAs(fixtures.manager);
    const { data, error } = await client
      .from("org_settings")
      .update({ company_name: "Updated by manager test" })
      .eq("id", true)
      .select("company_name");
    if (error) throw error;
    expect(data).toHaveLength(1);
    expect(data![0].company_name).toBe("Updated by manager test");
    await client.auth.signOut();
  });

  test("sales role cannot update org settings", async () => {
    const client = await signInAs(fixtures.sales);
    const { data, error } = await client
      .from("org_settings")
      .update({ company_name: "Should not stick" })
      .eq("id", true)
      .select("company_name");
    if (error) throw error;
    expect(data).toHaveLength(0);
    await client.auth.signOut();
  });

  test("executive role cannot update org settings", async () => {
    const client = await signInAs(fixtures.executive);
    const { data, error } = await client
      .from("org_settings")
      .update({ company_name: "Should not stick" })
      .eq("id", true)
      .select("company_name");
    if (error) throw error;
    expect(data).toHaveLength(0);
    await client.auth.signOut();
  });

  test("no role can insert a second row (singleton constraint)", async () => {
    const client = await signInAs(fixtures.manager);
    const { error } = await client.from("org_settings").insert({
      id: true,
      company_name: "Duplicate",
      fiscal_year: 2027,
      ppn_rate: 0.11,
      dormant_threshold_days: 30,
      risk_overdue_days: 5,
    });
    expect(error).not.toBeNull();
    await client.auth.signOut();
  });
});
