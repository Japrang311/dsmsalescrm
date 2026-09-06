import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToTable, type RealtimeTable } from "@/lib/realtime";

/**
 * Refetch this screen's data whenever `tables` change in Postgres, so a change
 * made by a teammate (or in another tab) shows up without a manual refresh.
 *
 * Pass `enabled: authReady` — subscribing before the session exists would
 * open the channel unauthenticated, and RLS filters events by session.
 */
export function useRealtimeSync(tables: RealtimeTable[], enabled: boolean) {
  const queryClient = useQueryClient();
  // Subscriptions are keyed by table name, so a caller passing a fresh array
  // literal each render must not resubscribe on every render.
  const tableKey = tables.join(",");

  useEffect(() => {
    if (!enabled) return;
    const stops = tableKey
      .split(",")
      .map((table) => subscribeToTable(table as RealtimeTable, queryClient));
    return () => {
      for (const stop of stops) stop();
    };
  }, [enabled, tableKey, queryClient]);
}
