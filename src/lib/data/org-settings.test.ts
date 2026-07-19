// Exercises the real src/lib/data/org-settings.ts module end-to-end
// against the local Supabase stack — proves the module itself works, not
// just the raw RLS mechanics (already covered by
// supabase/tests/org-settings.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import { getOrgSettings, updateOrgSettings } from "./org-settings";
import { supabase } from "@/lib/supabase";

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

describe("src/lib/data/org-settings.ts", () => {
  test("getOrgSettings() returns the singleton row", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const org = await getOrgSettings();
    expect(org.companyName).toBe(originalCompanyName);
    expect(typeof org.ppnRate).toBe("number");

    await supabase.auth.signOut();
  });

  test("updateOrgSettings() persists a real change as manager", async () => {
    const fixtureClient = await signInAs(fixtures.manager);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const updated = await updateOrgSettings({
      companyName: "Data-layer fixture name",
    });
    expect(updated.companyName).toBe("Data-layer fixture name");

    const { data: fromDb } = await adminClient
      .from("org_settings")
      .select("company_name")
      .eq("id", true)
      .single();
    expect(fromDb?.company_name).toBe("Data-layer fixture name");

    await supabase.auth.signOut();
  });
});
