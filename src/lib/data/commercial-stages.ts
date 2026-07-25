// Quotation stages and forecast weights.
export const COMMERCIAL_STAGE_WEIGHTS = {
  "Quotes Sent": 0.3,
  Negotiation: 0.55,
  "Hot Prospect": 0.75,
  Commit: 0.9,
  "Closed Won": 1,
  "Closed Lost": 0,
} as const;

export type CommercialStage = keyof typeof COMMERCIAL_STAGE_WEIGHTS;

export const COMMERCIAL_STAGES = Object.keys(
  COMMERCIAL_STAGE_WEIGHTS,
) as CommercialStage[];

export function forecastValue(total: number, stage: string): number | null {
  const weight =
    COMMERCIAL_STAGE_WEIGHTS[stage as keyof typeof COMMERCIAL_STAGE_WEIGHTS];
  return weight === undefined ? null : total * weight;
}
