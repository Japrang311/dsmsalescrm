import type { QueryClient } from "@tanstack/react-query";

// Shared by client and commercial follow-up dialogs. Kept in one place so a
// screen that shows follow-up state (task list, activity log) can't drift out
// of sync with only some of the call sites that log a follow-up.
export async function invalidateFollowUpQueries(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
  await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
}

// Shared by every place that can change a commercial document's pipeline
// stage (Pipeline board drag, Pipeline card drawer, Commercial detail page).
export async function invalidateCommercialStageQueries(
  queryClient: QueryClient,
) {
  await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
  await queryClient.invalidateQueries({ queryKey: ["commercial-documents"] });
  await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  await queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
  await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
}
