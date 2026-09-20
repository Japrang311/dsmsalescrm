import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PipelineBoard,
  type PipelineColumnData,
} from "@/components/pipeline/PipelineBoard";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import type { CommercialItem } from "@/lib/domain";

const quotation: CommercialItem = {
  id: "quote-preview",
  clientId: "client-preview",
  ownerId: "sales-preview",
  type: "Quotation",
  sourceFlow: "New Product",
  stage: "Quotes Sent",
  description: "Long technical specifications belong in the detail drawer",
  projectName: "Panel distribusi",
  estimatedValue: 125000000,
  updatedAt: "2026-09-20",
};
const columns: PipelineColumnData[] = [
  {
    stage: "Quotes Sent",
    items: [quotation],
    sum: 125000000,
    hasMore: true,
    isFetching: false,
  },
  {
    stage: "Closed Won",
    items: [{ ...quotation, id: "won-preview", projectName: "Won fixture" }],
    sum: 125000000,
    hasMore: false,
    isFetching: false,
  },
];
const props = {
  columns,
  canDrag: false,
  canMoveItem: () => false,
  draggingId: null,
  dragOverStage: null,
  onDragOverStage: () => {},
  onDraggingChange: () => {},
  clientById: {},
  ownerById: {},
  nextByItem: new Map<string, string | undefined>(),
  onDrop: () => {},
  onLoadMore: () => {},
  onCardClick: () => {},
  pendingSoItemIds: new Set<string>(),
  onCreateSoForItem: () => {},
};

describe("Precision operational presentation", () => {
  test("mobile list limits cards to selected stage and retains partial-data disclosure/load more", () => {
    const html = renderToStaticMarkup(<PipelineBoard {...props} view="list" />);
    expect(html).toContain("Panel distribusi");
    expect(html).not.toContain("Won fixture");
    expect(html).toContain("Muat lebih banyak");
    expect(html).toContain("berdasarkan kartu yang dimuat");
    expect(html).not.toContain("Long technical specifications");
    expect(html).toContain('draggable="false"');
  });
  test("desktop board retains all stage cards and keyboard entry points", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard {...props} view="board" />,
    );
    expect(html).toContain("Panel distribusi");
    expect(html).toContain("Won fixture");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Belum dijadwalkan");
  });
  test("overview distinguishes monthly, yearly and waiting PO amounts without relabeling scope", () => {
    const html = renderToStaticMarkup(
      <DashboardOverview
        monthName="September"
        monthRev={1000000}
        monthPct={0.5}
        monthTgt={2000000}
        ytd={10000000}
        ytdPct={0.25}
        yearlyTgt={40000000}
        waitingPo={3000000}
        activeCi={12}
      />,
    );
    expect(html).toContain("Capaian September");
    expect(html).toContain("50% dari target");
    expect(html).toContain("25% dari target setahun");
    expect(html).toContain("12 item aktif di seluruh pipeline");
    expect(html).toContain("Menunggu PO");
  });
});
