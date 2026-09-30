import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";

/**
 * Per-device theme preference.
 *
 * Deliberately separate from `preferences-store.ts`: that store is keyed by
 * user id and saved behind a Save button, but the theme has to be applied
 * before auth resolves (otherwise the app flashes light while the session
 * loads) and has to take effect the moment it is picked.
 */
export const THEME_STORAGE_KEY = "dsm.theme.v1";

const listeners = new Set<() => void>();
let mode: ThemeMode = "system";

function isMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(value: ThemeMode): "light" | "dark" {
  return value === "system" ? (systemPrefersDark() ? "dark" : "light") : value;
}

// The inline boot script in __root.tsx applies the class before first paint;
// this keeps it in sync afterwards.
function applyToDocument() {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isMode(raw)) mode = raw;
  } catch {
    // Blocked storage just means the default ("system") stays in effect.
  }
  applyToDocument();

  // Follow the OS while the mode is "system".
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    ?.addEventListener("change", () => {
      if (mode !== "system") return;
      applyToDocument();
      for (const listener of listeners) listener();
    });
}

load();

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Preference still applies for this session.
  }
  applyToDocument();
  for (const listener of listeners) listener();
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => mode,
    // The server has no preference to read; the boot script corrects the
    // class before paint, so SSR always renders the default.
    () => "system" as ThemeMode,
  );
}
