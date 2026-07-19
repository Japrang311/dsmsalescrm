import { useSyncExternalStore } from "react";

export type UserPreferences = {
  displayName: string;
  email: string;
  language: "id" | "en";
  timezone: "WIB" | "WITA" | "WIT";
  dateFormat: "dd/MM/yyyy" | "yyyy-MM-dd" | "dd MMM yyyy";
  currencyFormat: "compact" | "full";
};

type PreferencesState = {
  preferences: Record<string, UserPreferences>;
};

const STORAGE_KEY = "dsm.settings.v1";
let state: PreferencesState = { preferences: {} };
const listeners = new Set<() => void>();

export function defaultUserPreferences(
  displayName: string,
  email: string,
): UserPreferences {
  return {
    displayName,
    email,
    language: "id",
    timezone: "WIB",
    dateFormat: "dd/MM/yyyy",
    currencyFormat: "compact",
  };
}

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<PreferencesState>;
    state = { preferences: parsed.preferences ?? {} };
  } catch {
    // Corrupt browser preferences must not prevent the app from loading.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Browsers may block storage; preferences remain valid for this session.
  }
}

function emit() {
  persist();
  for (const listener of listeners) listener();
}

load();

export function useSettings(): PreferencesState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

export const settingsActions = {
  updatePreferences(userId: string, preferences: UserPreferences) {
    state = {
      preferences: {
        ...state.preferences,
        [userId]: preferences,
      },
    };
    emit();
  },
};
