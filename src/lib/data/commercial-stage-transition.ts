import type { CommercialItem } from "@/lib/domain";
import {
  convertRfqToQuotation,
  updateCommercialItem,
  type CommercialItemPatch,
} from "./commercial-items";

type TransitionDependencies = {
  convertRfqToQuotation: (id: string) => Promise<CommercialItem>;
  updateCommercialItem: (
    id: string,
    patch: CommercialItemPatch,
  ) => Promise<CommercialItem>;
};

export function isRfqReplacedByQuotation(
  item: CommercialItem,
  allItems: CommercialItem[],
): boolean {
  return (
    item.type === "RFQ" &&
    allItems.some(
      (candidate) =>
        candidate.type === "Quotation" &&
        candidate.sourceRfqDocumentId === item.id,
    )
  );
}

export async function transitionCommercialItemStage(
  item: CommercialItem,
  nextStage: string,
  patch: Omit<CommercialItemPatch, "stage"> = {},
  dependencies: TransitionDependencies = {
    convertRfqToQuotation,
    updateCommercialItem,
  },
): Promise<{
  item: CommercialItem;
  transitionedToQuotation: boolean;
}> {
  if (item.type === "RFQ" && nextStage === "Quotes Sent") {
    return {
      item: await dependencies.convertRfqToQuotation(item.id),
      transitionedToQuotation: true,
    };
  }

  return {
    item: await dependencies.updateCommercialItem(item.id, {
      ...patch,
      stage: nextStage,
    }),
    transitionedToQuotation: false,
  };
}
