export type ForecastDrilldownItem = {
  documentId: string;
  quotationNumber: string;
  clientId: string;
  clientName: string;
  ownerId: string;
  ownerName: string;
  stage: string;
  expectedCloseDate: string | null;
  totalValue: number;
  weight: number;
  weightedValue: number;
  bucket: "scheduled" | "overdue" | "undated";
  contributes: boolean;
};

export function reconcileForecastItems(
  items: readonly ForecastDrilldownItem[],
): number {
  return items.reduce(
    (sum, item) => sum + (item.contributes ? item.weightedValue : 0),
    0,
  );
}

export function forecastValuesMatch(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= scale * 1e-9;
}
