// UI state remembered per browser-history entry (the "page visit" the Back
// button returns to). Held in memory only: it survives Back/Forward inside the
// app, while a fresh visit, a sidebar click or a reload starts from defaults.
// Values are never serialized, so Dates and Sets are safe to keep here.

const MAX_ENTRIES = 200;
const entries = new Map<string, Map<string, unknown>>();

export function readEntryState<T>(
  entryKey: string | undefined,
  name: string,
): { value: T } | undefined {
  const saved = entryKey ? entries.get(entryKey) : undefined;
  return saved?.has(name) ? { value: saved.get(name) as T } : undefined;
}

export function writeEntryState(
  entryKey: string | undefined,
  name: string,
  value: unknown,
) {
  if (!entryKey) return;
  let saved = entries.get(entryKey);
  if (!saved) {
    saved = new Map();
    entries.set(entryKey, saved);
    if (entries.size > MAX_ENTRIES) {
      entries.delete(entries.keys().next().value as string);
    }
  }
  saved.set(name, value);
}
