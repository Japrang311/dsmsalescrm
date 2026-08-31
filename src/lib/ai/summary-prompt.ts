import type { SummaryFacts } from "./summary-facts";

const SHARED_RULES = [
  "Kamu menulis ringkasan kinerja penjualan dalam bahasa Indonesia yang lugas dan profesional.",
  "Gunakan HANYA angka yang diberikan, disalin persis seperti tertulis. Jangan menghitung, menjumlahkan, membandingkan, atau memperkirakan angka apa pun sendiri.",
  "Jika sebuah informasi tidak diberikan, jangan menyebutnya dan jangan menebak.",
  "Tulis 2–4 paragraf pendek. Tanpa judul, tanpa bullet, tanpa basa-basi pembuka atau penutup.",
  "Sebutkan lebih dulu hal yang paling perlu ditindaklanjuti.",
].join("\n");

const AUDIENCE_RULES: Record<SummaryFacts["audience"], string> = {
  manager:
    "Pembaca adalah Sales Manager. Boleh menyebut nama sales dan task yang tertunda.",
  executive:
    "Pembaca adalah Top Executive dan hanya menerima gambaran agregat: jangan menyebut nama sales mana pun dan jangan membahas task individual.",
};

export function buildSummaryPrompt(facts: SummaryFacts): {
  system: string;
  prompt: string;
} {
  // Defence in depth: strip salesPerformance and escalatedTasks for executive audience.
  // This is intentional duplication with summary-facts.ts logic — if summary-facts.ts
  // regresses and incorrectly populates these fields for an executive, this layer will
  // still prevent a sales name from reaching the model. This duplication must not be
  // "simplified" away without explicit Phase 12 compliance review.
  let factsToSerialize = facts;
  if (facts.audience === "executive") {
    factsToSerialize = {
      ...facts,
      salesPerformance: undefined,
      escalatedTasks: undefined,
    };
  }

  return {
    system: `${SHARED_RULES}\n${AUDIENCE_RULES[facts.audience]}`,
    prompt: [
      `Periode: ${facts.periodLabel}`,
      "",
      "Data (salin angka persis seperti tertulis):",
      JSON.stringify(factsToSerialize, null, 2),
    ].join("\n"),
  };
}
