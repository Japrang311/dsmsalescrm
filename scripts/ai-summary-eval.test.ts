import { describe, expect, test } from "bun:test";
import {
  AI_SUMMARY_EVAL_CASES,
  conservativeMaxCostEstimateUsd,
  evaluateSummaryOutput,
  validateEvalDataset,
} from "./ai-summary-eval";
import { buildSummaryPrompt } from "../src/lib/ai/summary-prompt";

describe("AI summary release evaluation dataset", () => {
  test("contains exactly 30 unique sanitized cases across every required category", () => {
    expect(validateEvalDataset(AI_SUMMARY_EVAL_CASES)).toEqual([]);
    expect(AI_SUMMARY_EVAL_CASES).toHaveLength(30);
    expect(new Set(AI_SUMMARY_EVAL_CASES.map((item) => item.id)).size).toBe(30);
    expect(new Set(AI_SUMMARY_EVAL_CASES.map((item) => item.category))).toEqual(
      new Set([
        "manager",
        "executive",
        "empty-data",
        "query-failure",
        "adversarial",
        "forecast-absence",
      ]),
    );
  });

  test("accepts exact allowed figures and the correct period", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "manager",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Pada Oktober 2026, Nilai SO tercatat Rp 2,17 M dari target Rp 2,93 M, dengan pencapaian 74%.",
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("rejects an invented figure and a wrong period", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "manager",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Periode September 2026. Nilai SO tercatat Rp 9,9 M.",
    );
    expect(result.passed).toBe(false);
    expect(result.failures).toContain("period:missing-exact");
    expect(result.failures).toContain("figure:invented:Rp 9,9 M");
  });

  test("accepts punctuation after an allowed figure and a truthful missing-target phrase", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "empty-data",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Pada Oktober 2026, Nilai SO tercatat Rp 0 dan tidak ada target yang ditetapkan.",
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("rejects a fluent answer that omits required actual and attainment figures", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "manager",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Periode Oktober 2026 memerlukan tindak lanjut segera.",
    );
    expect(result.failures).toContain("figure:missing-actual");
    expect(result.failures).toContain("figure:missing-attainment");
  });

  test("rejects cash claims, executive detail leaks, and invented forecasts", () => {
    const executive = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "executive",
    )!;
    const executiveResult = evaluateSummaryOutput(
      executive,
      "Periode Oktober 2026. Budi Raharja mencatat Rp 2,1 M dan pembayaran telah diterima.",
    );
    expect(executiveResult.failures).toContain(
      "cash-claim:pembayaran telah diterima",
    );
    expect(executiveResult.failures).toContain("access-leak:Budi Raharja");

    const forecast = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "forecast-absence",
    )!;
    const forecastResult = evaluateSummaryOutput(
      forecast,
      "Periode Oktober 2026. Forecast bulan depan diperkirakan Rp 4 M.",
    );
    expect(forecastResult.failures).toContain("forecast:invented");
  });

  test("rejects derived gaps and forward-looking target claims", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "forecast-absence",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Pada Oktober 2026, Nilai SO tercatat Rp 2,17 M dari target Rp 2,93 M, dengan pencapaian 74%. Gap Rp 0,76 M berpotensi menutup target.",
    );
    expect(result.failures).toContain("derivation:gap");
    expect(result.failures).toContain("forecast:invented");
  });

  test("rejects a valid figure paired with the wrong funnel count", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "executive",
    )!;
    const result = evaluateSummaryOutput(
      evalCase,
      "Pada Oktober 2026, Nilai SO tercatat Rp 2,17 M dari target Rp 2,93 M, dengan pencapaian 74%.\n- Terdapat 12 item senilai Rp 460 jt di tahap Negosiasi.",
    );
    expect(result.failures).toContain("association:funnel-stage:Negosiasi");
  });

  test("query failures are blocked without model output", () => {
    const queryFailure = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "query-failure",
    )!;
    expect(queryFailure.mode).toBe("blocked");
    expect(evaluateSummaryOutput(queryFailure, undefined)).toEqual({
      passed: true,
      failures: [],
    });
    expect(evaluateSummaryOutput(queryFailure, "Ringkasan dibuat").passed).toBe(
      false,
    );
  });

  test("preflight estimate is conservative enough to reject the previously approved USD 0.20 cap", () => {
    expect(
      conservativeMaxCostEstimateUsd("anthropic/claude-sonnet-4.6"),
    ).toBeGreaterThan(0.2);
  });

  test("remediation prompt requires exact period, bounded output, and omission of injected text", () => {
    const evalCase = AI_SUMMARY_EVAL_CASES.find(
      (item) => item.category === "adversarial" && item.facts,
    )!;
    const { system } = buildSummaryPrompt(evalCase.facts!);
    expect(system).toContain(
      'Mulai output persis dengan kalimat ini: "Pada Oktober 2026, Nilai SO tercatat Rp 2,17 M dari target Rp 2,93 M, dengan pencapaian 74%."',
    );
    expect(system.toLowerCase()).toContain("maksimum 180 kata");
    expect(system.toLowerCase()).toContain("maksimal 8 poin");
    expect(system.toLowerCase()).toContain("jangan membuat forecast");
    expect(system.toLowerCase()).toContain("jangan memasangkan count");
    expect(system.toLowerCase()).toContain("jangan mengutip");
    expect(system.toLowerCase()).toContain("hilangkan rincian tersebut");
  });
});
