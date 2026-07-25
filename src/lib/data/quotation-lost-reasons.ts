import type {
  CommercialItem,
  CommercialType,
  QuotationLostReason,
} from "@/lib/domain";

export const QUOTATION_LOST_REASONS = [
  "Harga tidak kompetitif",
  "Kalah tender/kompetitor",
  "Spesifikasi tidak sesuai",
  "Project ditunda/dibatalkan",
  "Tidak ada respons",
  "Lead time",
  "Anggaran",
  "Lainnya",
] as const satisfies readonly Exclude<
  QuotationLostReason,
  "Belum diklasifikasi"
>[];

type LostReasonState = {
  type: CommercialType;
  stage: string;
  lostReason?: QuotationLostReason | null;
  lostReasonDetail?: string | null;
};

export function validateQuotationLostReason(
  state: LostReasonState,
): string | null {
  if (state.type !== "Quotation" || state.stage !== "Closed Lost") return null;
  if (!state.lostReason || state.lostReason === "Belum diklasifikasi") {
    return "Pilih alasan quotation lost.";
  }
  if (
    state.lostReason === "Lainnya" &&
    !state.lostReasonDetail?.trim()
  ) {
    return "Jelaskan alasan lainnya.";
  }
  return null;
}

export function activeLostReasonPatch(state: LostReasonState): {
  lostReason: QuotationLostReason | null;
  lostReasonDetail: string | null;
} {
  if (state.type !== "Quotation" || state.stage !== "Closed Lost") {
    return { lostReason: null, lostReasonDetail: null };
  }
  return {
    lostReason: state.lostReason ?? null,
    lostReasonDetail: state.lostReasonDetail?.trim() || null,
  };
}

export function quotationLostReasonBreakdown(items: CommercialItem[]) {
  const totals = new Map<
    QuotationLostReason,
    { quotationCount: number; lostValue: number }
  >();
  for (const item of items) {
    if (
      item.type !== "Quotation" ||
      item.stage !== "Closed Lost" ||
      !item.lostReason
    ) {
      continue;
    }
    const current = totals.get(item.lostReason) ?? {
      quotationCount: 0,
      lostValue: 0,
    };
    current.quotationCount += 1;
    current.lostValue += item.estimatedValue;
    totals.set(item.lostReason, current);
  }
  return Array.from(totals, ([reason, values]) => ({ reason, ...values })).sort(
    (a, b) => b.lostValue - a.lostValue || a.reason.localeCompare(b.reason),
  );
}
