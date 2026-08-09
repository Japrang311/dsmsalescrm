// Exercises the real src/lib/data/follow-ups.ts module end-to-end against
// the local Supabase stack — proves the module itself works, not just the
// raw RLS mechanics (already covered by supabase/tests/follow-up-logs.test.ts).
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  adminClient,
  createRoleFixtureUsers,
  deleteRoleFixtureUsers,
  signInAs,
  type RoleFixtureUsers,
} from "../../../supabase/tests/helpers";
import {
  logFollowUp,
  listFollowUpsForClient,
  listFollowUpsForCommercialDocument,
  recordClientFollowUp,
  recordCommercialFollowUp,
} from "./follow-ups";
import { supabase } from "@/lib/supabase";

let fixtures: RoleFixtureUsers;
let clientId: string;
let createdId: string;
let commercialDocumentId: string;
const createdTaskIds: string[] = [];
const createdFollowUpIds: string[] = [];
const createdActivityIds: string[] = [];

beforeAll(async () => {
  fixtures = await createRoleFixtureUsers();
  const { data: ownedClient, error: clientError } = await adminClient
    .from("clients")
    .insert({
      name: `follow-ups adapter client ${crypto.randomUUID()}`,
      status: "Prospect",
      source: "Referral",
      owner_id: fixtures.sales.id,
    })
    .select("id")
    .single();
  if (clientError) throw clientError;
  clientId = ownedClient.id;

  const { data: document, error: documentError } = await adminClient
    .from("commercial_documents")
    .insert({
      client_id: clientId,
      owner_id: fixtures.sales.id,
      type: "Quotation",
      source_flow: "RFQ / New Product",
      document_date: "2026-07-18",
      stage: "Quotes Sent",
    })
    .select("id")
    .single();
  if (documentError) throw documentError;
  commercialDocumentId = document.id;
});

afterAll(async () => {
  if (createdFollowUpIds.length > 0) {
    await adminClient
      .from("follow_up_logs")
      .delete()
      .in("id", createdFollowUpIds);
  }
  if (createdActivityIds.length > 0) {
    await adminClient
      .from("activity_log")
      .delete()
      .in("id", createdActivityIds);
  }
  if (createdTaskIds.length > 0) {
    await adminClient.from("tasks").delete().in("id", createdTaskIds);
  }
  if (createdId) {
    await adminClient.from("follow_up_logs").delete().eq("id", createdId);
  }
  if (commercialDocumentId) {
    await adminClient
      .from("commercial_documents")
      .delete()
      .eq("id", commercialDocumentId);
  }
  if (clientId) {
    await adminClient.from("clients").delete().eq("id", clientId);
  }
  await deleteRoleFixtureUsers(fixtures);
});

describe("src/lib/data/follow-ups.ts", () => {
  test("logFollowUp() persists a real follow-up and listFollowUpsForClient() returns it", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const created = await logFollowUp({
      clientId,
      commercialDocumentId,
      ownerId: session.user.id,
      fuDate: "2026-07-18",
      method: "Phone",
      result: "Interested",
      notes: "Data-layer fixture follow-up",
    });
    createdId = created.id;
    expect(created.clientId).toBe(clientId);
    expect(created.commercialDocumentId).toBe(commercialDocumentId);
    expect(created.result).toBe("Interested");

    const logs = await listFollowUpsForClient(clientId);
    expect(logs.some((l) => l.id === created.id)).toBe(true);

    await supabase.auth.signOut();
  });

  test("recordClientFollowUp() maps explicit existing Task progress through the atomic RPC", async () => {
    const { data: task, error: taskError } = await adminClient
      .from("tasks")
      .insert({
        client_id: clientId,
        owner_id: fixtures.sales.id,
        title: "Client follow-up adapter Task",
        due_date: "2026-08-06",
        method: "Phone",
        category: "Follow-Up",
      })
      .select("id")
      .single();
    if (taskError) throw taskError;
    createdTaskIds.push(task.id);

    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const result = await recordClientFollowUp({
      clientId,
      taskId: task.id,
      nextAction: "Send sample availability",
      nextActionDate: "2026-08-08",
      note: "Adapter client follow-up",
      method: "Phone",
      result: "Interested",
      fuDate: "2026-08-05",
      workflowStatusTarget: "In Progress",
    });

    createdFollowUpIds.push(result.followUpLogId);
    createdActivityIds.push(result.activityLogId);
    expect(result.taskId).toBe(task.id);
    expect(result.createdTask).toBe(false);
    expect(result.workflowStatus).toBe("In Progress");

    await supabase.auth.signOut();
  });

  test("recordCommercialFollowUp() maps explicit create-new Task through the atomic RPC", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const result = await recordCommercialFollowUp({
      commercialDocumentId,
      createTaskTitle: "Commercial follow-up adapter Task",
      taskDueDate: "2026-08-07",
      nextAction: "Confirm quotation feedback",
      nextActionDate: "2026-08-08",
      note: "Adapter commercial follow-up",
      method: "WhatsApp",
      result: "Negotiation",
      fuDate: "2026-08-05",
      workflowStatusTarget: "In Progress",
    });

    createdTaskIds.push(result.taskId);
    createdFollowUpIds.push(result.followUpLogId);
    createdActivityIds.push(result.activityLogId);
    expect(result.createdTask).toBe(true);
    expect(result.workflowStatus).toBe("In Progress");

    const { data: task } = await adminClient
      .from("tasks")
      .select("commercial_document_id, next_action")
      .eq("id", result.taskId)
      .single();
    expect(task?.commercial_document_id).toBe(commercialDocumentId);
    expect(task?.next_action).toBe("Confirm quotation feedback");

    await supabase.auth.signOut();
  });

  test("listFollowUpsForCommercialDocument() returns persisted commercial follow-up history", async () => {
    const fixtureClient = await signInAs(fixtures.sales);
    const session = (await fixtureClient.auth.getSession()).data.session!;
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const result = await recordCommercialFollowUp({
      commercialDocumentId,
      createTaskTitle: "Commercial follow-up history",
      taskDueDate: "2026-08-11",
      nextAction: "Kirim ulang quotation",
      nextActionDate: "2026-08-11",
      note: "History row for Pipeline drawer",
      method: "Email",
      result: "Quotation Sent",
      fuDate: "2026-08-05",
      workflowStatusTarget: "In Progress",
    });

    createdTaskIds.push(result.taskId);
    createdFollowUpIds.push(result.followUpLogId);
    createdActivityIds.push(result.activityLogId);

    const rows = await listFollowUpsForCommercialDocument(commercialDocumentId);

    expect(rows.map((row) => row.id)).toContain(result.followUpLogId);
    expect(rows.find((row) => row.id === result.followUpLogId)).toMatchObject({
      commercialDocumentId,
      result: "Quotation Sent",
      notes: "History row for Pipeline drawer",
    });

    await supabase.auth.signOut();
  });
});
