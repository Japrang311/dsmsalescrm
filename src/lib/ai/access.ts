/**
 * Limited pilot. The AI Dashboard summary is available to these two accounts
 * only — Adhitya (manager) and Triyanto (executive). Both were confirmed
 * against production `public.profiles` before this list was written; see
 * docs/superpowers/specs/2026-08-31-ai-dashboard-summary-design.md §9.
 *
 * This constant is the single source of truth: the Dashboard reads it to
 * decide whether to render the card, and the server function reads it to
 * decide whether to answer. Hiding the card is convenience; the server check
 * is the boundary.
 */
export const AI_SUMMARY_ALLOWED_EMAILS: readonly string[] = [
  "adhitya@dutasolusimetalindo.com",
  "triyanto@dutasolusimetalindo.com",
];

export function canUseAiSummary(email: string | null | undefined): boolean {
  if (!email) return false;
  return AI_SUMMARY_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
