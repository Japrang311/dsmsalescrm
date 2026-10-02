import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { readEntryState, writeEntryState } from "@/lib/entry-state";

// Drop-in replacement for useState on list/filter state. When the user comes
// back to this page with the browser's Back button (e.g. from a detail page),
// the value is the one they left; any other visit starts from `initial`.
// `name` must be unique per page (e.g. "clients.search").
export function useEntryState<T>(name: string, initial: T | (() => T)) {
  const router = useRouter();
  const currentEntryKey = () => router.state.location.state.__TSR_key;

  const [value, setValue] = useState<T>(() => {
    const saved = readEntryState<T>(currentEntryKey(), name);
    if (saved) return saved.value;
    return initial instanceof Function ? initial() : initial;
  });

  useEffect(() => {
    writeEntryState(currentEntryKey(), name, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentEntryKey only reads the stable router
  }, [name, value]);

  return [value, setValue] as const;
}
