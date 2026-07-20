import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supabase/PostgREST errors (thrown as `if (error) throw error` in the data
// layer) carry a `.message` string but are plain objects, not `instanceof
// Error` — so `error instanceof Error ? error.message : "Unknown error"`
// silently discards the real reason. This checks for a `.message` string on
// any thrown value first.
export function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Unknown error";
}
