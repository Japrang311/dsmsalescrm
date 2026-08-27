import { describe, expect, test } from "bun:test";
import type { QueryClient } from "@tanstack/react-query";
import {
  activeRealtimeTables,
  subscribeToTable,
  type RealtimeSubscribeClient,
} from "@/lib/realtime";

// Fake Supabase client that records channel lifecycle and lets a test fire
// postgres_changes events by hand.
function fakeClient() {
  const created: string[] = [];
  const removed: string[] = [];
  const handlers = new Map<string, () => void>();

  const client: RealtimeSubscribeClient = {
    channel(name) {
      created.push(name);
      const channel = {
        name,
        on(_event: "postgres_changes", _filter: unknown, callback: () => void) {
          handlers.set(name, callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel(channel) {
      removed.push((channel as unknown as { name: string }).name);
      return null;
    },
  };

  return {
    client,
    created,
    removed,
    // Topics carry a generation suffix, so fire the newest handler for a table.
    emit: (table: string) => {
      const key = [...handlers.keys()]
        .filter((name) => name.startsWith(`realtime:${table}:`))
        .pop();
      handlers.get(key ?? "")?.();
    },
  };
}

function fakeQueryClient() {
  const keys: string[] = [];
  const queryClient = {
    invalidateQueries: async ({ queryKey }: { queryKey: unknown[] }) => {
      keys.push(String(queryKey[0]));
    },
  } as unknown as QueryClient;
  return { queryClient, keys };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("subscribeToTable", () => {
  test("shares one channel across subscribers to the same table", () => {
    const { client, created } = fakeClient();
    const { queryClient } = fakeQueryClient();

    const stopA = subscribeToTable("tasks", queryClient, client);
    const stopB = subscribeToTable("tasks", queryClient, client);
    const stopC = subscribeToTable("tasks", queryClient, client);

    expect(created).toHaveLength(1);
    expect(created[0]).toStartWith("realtime:tasks:");
    stopA();
    stopB();
    stopC();
  });

  test("removes the channel only after the last subscriber leaves", () => {
    const { client, removed } = fakeClient();
    const { queryClient } = fakeQueryClient();

    const stopA = subscribeToTable("tasks", queryClient, client);
    const stopB = subscribeToTable("tasks", queryClient, client);

    stopA();
    expect(removed).toHaveLength(0);
    expect(activeRealtimeTables()).toContain("tasks");

    stopB();
    expect(removed).toHaveLength(1);
    expect(activeRealtimeTables()).not.toContain("tasks");
  });

  test("calling unsubscribe twice does not drop a live subscriber's channel", () => {
    const { client, removed } = fakeClient();
    const { queryClient } = fakeQueryClient();

    const stopA = subscribeToTable("tasks", queryClient, client);
    const stopB = subscribeToTable("tasks", queryClient, client);

    stopA();
    stopA();
    expect(removed).toHaveLength(0);
    expect(activeRealtimeTables()).toContain("tasks");

    stopB();
    expect(removed).toHaveLength(1);
  });

  test("repeated mount/unmount cycles leave no channel behind", () => {
    const { client, created, removed } = fakeClient();
    const { queryClient } = fakeQueryClient();

    for (let i = 0; i < 10; i++) {
      subscribeToTable("tasks", queryClient, client)();
    }

    expect(created).toHaveLength(10);
    expect(removed).toHaveLength(10);
    expect(activeRealtimeTables()).toEqual([]);
  });

  test("never reuses a topic a departing channel still holds", () => {
    // supabase.channel() returns the existing channel for a topic that has not
    // finished unsubscribing yet, and .on() on an already-subscribed channel
    // throws. Re-mounting fast must therefore never reuse a topic.
    const { client, created } = fakeClient();
    const { queryClient } = fakeQueryClient();

    for (let i = 0; i < 5; i++) {
      subscribeToTable("tasks", queryClient, client)();
    }

    expect(new Set(created).size).toBe(created.length);
  });

  test("keeps separate channels per table", () => {
    const { client, created } = fakeClient();
    const { queryClient } = fakeQueryClient();

    const stopTasks = subscribeToTable("tasks", queryClient, client);
    const stopOrders = subscribeToTable("sales_orders", queryClient, client);

    expect(created).toHaveLength(2);
    expect(created[0]).toStartWith("realtime:tasks:");
    expect(created[1]).toStartWith("realtime:sales_orders:");
    stopTasks();
    stopOrders();
  });

  test("debounces a burst of events into one invalidation round", async () => {
    const { client, emit } = fakeClient();
    const { queryClient, keys } = fakeQueryClient();

    const stop = subscribeToTable("sales_orders", queryClient, client);
    for (let i = 0; i < 20; i++) emit("sales_orders");

    await wait(800);
    expect(keys).toEqual(["sales-orders"]);
    stop();
  });

  test("invalidates once per event no matter how many components listen", async () => {
    const { client, emit } = fakeClient();
    const { queryClient, keys } = fakeQueryClient();

    const stops = Array.from({ length: 7 }, () =>
      subscribeToTable("sales_orders", queryClient, client),
    );
    emit("sales_orders");

    await wait(800);
    expect(keys).toEqual(["sales-orders"]);
    for (const stop of stops) stop();
  });

  test("does not fire a pending invalidation after unsubscribe", async () => {
    const { client, emit } = fakeClient();
    const { queryClient, keys } = fakeQueryClient();

    const stop = subscribeToTable("sales_orders", queryClient, client);
    emit("sales_orders");
    stop();

    await wait(800);
    expect(keys).toEqual([]);
  });
});
