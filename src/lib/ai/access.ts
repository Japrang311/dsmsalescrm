/**
 * Limited pilot. The AI Dashboard summary is available to one account only —
 * Adhitya (manager), confirmed against production `public.profiles`; see
 * docs/superpowers/specs/2026-08-31-ai-dashboard-summary-design.md §9.
 * Triyanto (executive) was on this list originally but was removed on
 * 2026-09-01 at the owner's request — the executive-audience code paths in
 * summary-facts.ts / summary-prompt.ts are kept as defensive dead code.
 *
 * This constant is the single source of truth: the Dashboard reads it to
 * decide whether to render the card, and the server function reads it to
 * decide whether to answer. Hiding the card is convenience; the server check
 * is the boundary.
 */
export const AI_SUMMARY_ALLOWED_EMAILS: readonly string[] = [
  "adhitya@dutasolusimetalindo.com",
];

export function canUseAiSummary(email: string | null | undefined): boolean {
  if (!email) return false;
  return AI_SUMMARY_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
