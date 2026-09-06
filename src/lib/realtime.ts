import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  invalidateCommercialStageQueries,
  invalidateFollowUpQueries,
} from "@/lib/query-invalidation";

// Postgres tables the app subscribes to for live updates. Each must also be a
// member of the `supabase_realtime` publication (see the migration adding
// them), otherwise the channel connects but never receives an event.
export type RealtimeTable = "commercial_documents" | "tasks" | "sales_orders";

// What a change to each table invalidates. Keyed by table rather than by
// caller, so one event refetches once no matter how many components listen.
const invalidateFor: Record<
  RealtimeTable,
  (queryClient: QueryClient) => Promise<void>
> = {
  commercial_documents: invalidateCommercialStageQueries,
  tasks: invalidateFollowUpQueries,
  sales_orders: async (queryClient) => {
    await queryClient.invalidateQueries({ queryKey: ["sales-orders"] });
  },
};

// Minimal shape this module needs from a Supabase client — narrow enough
// that tests can pass a plain fake object instead of reaching for
// mock.module() (which replaces the "@/lib/supabase" module globally for
// the whole `bun test` process, breaking every other data-layer test file
// that imports the real client afterwards).
type ChannelLike = {
  on(
    event: "postgres_changes",
    filter: { event: "*"; schema: string; table: string },
    callback: () => void,
  ): ChannelLike;
  subscribe(): unknown;
};
export type RealtimeSubscribeClient = {
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): unknown;
};

// Cast, not a structural default-param check: TypeScript's comparison of the
// real (deeply generic) SupabaseClient against this narrow shape fails on the
// channel callback's payload generics, which this module never reads.
const realRealtimeClient = supabase as unknown as RealtimeSubscribeClient;

type Subscription = {
  channel: ChannelLike;
  subscribers: number;
  timer: ReturnType<typeof setTimeout> | null;
};

// One channel per table, shared by every subscriber, and one invalidation per
// event. useDashboardData() is called by ~11 components and several render on
// the same page; without sharing, a single row change fired one refetch per
// mounted component instead of one per page.
const subscriptions = new Map<RealtimeTable, Subscription>();

const DEBOUNCE_MS = 500;

// supabase.removeChannel() is async — it waits for the server to acknowledge
// the unsubscribe. Until that lands the channel is still registered under its
// topic, and supabase.channel() hands back that same already-subscribed object
// instead of a fresh one, which makes .on() throw. Fast route changes hit this
// (it crashed the dashboard into its error boundary), so every subscription
// generation gets its own topic and can never collide with a departing one.
let channelSeq = 0;

/**
 * Keep React Query in sync with `table` until the returned function is called.
 * The underlying channel is removed once the last subscriber leaves.
 *
 * Events are debounced so a batch write (import, bulk stage move) triggers one
 * refetch instead of one per row. RLS applies to realtime events too, so a
 * sales user is only notified about rows they can already read.
 */
export function subscribeToTable(
  table: RealtimeTable,
  queryClient: QueryClient,
  client: RealtimeSubscribeClient = realRealtimeClient,
): () => void {
  let entry = subscriptions.get(table);

  if (!entry) {
    const created: Subscription = {
      channel: client.channel(`realtime:${table}:${++channelSeq}`),
      subscribers: 0,
      timer: null,
    };
    created.channel
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        if (created.timer) clearTimeout(created.timer);
        created.timer = setTimeout(() => {
          created.timer = null;
          void invalidateFor[table](queryClient);
        }, DEBOUNCE_MS);
      })
      .subscribe();
    subscriptions.set(table, created);
    entry = created;
  }

  const current = entry;
  current.subscribers += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    current.subscribers -= 1;
    if (current.subscribers > 0) return;
    if (current.timer) clearTimeout(current.timer);
    subscriptions.delete(table);
    void client.removeChannel(current.channel);
  };
}

// Test-only view of the internal registry.
export function activeRealtimeTables(): RealtimeTable[] {
  return [...subscriptions.keys()];
}
