import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PipelineBoard,
  type PipelineColumnData,
} from "@/components/pipeline/PipelineBoard";
import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { ActionSignalList } from "@/components/tasks/ActionSignalList";
import type { CommercialItem } from "@/lib/domain";
import type { ActionSignalsSnapshot } from "@/lib/data/action-signals";

function renderWithQueryClient(node: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

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
    items: [
      {
        ...quotation,
        id: "won-preview",
        stage: "Closed Won",
        projectName: "Won fixture",
      },
    ],
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
  salesOrderLinksUnavailable: false,
  canMutateSalesOrders: true,
  onCreateSoForItem: () => {},
  linkedSalesOrderByItemId: new Map<string, { id: string; soNumber: string }>(),
  onLinkSoForItem: () => {},
  onOpenSalesOrder: () => {},
};

const signalSnapshot: ActionSignalsSnapshot = {
  asOfDate: "2026-10-17",
  fetchedAt: "2026-10-17T01:00:00Z",
  totals: {
    totalCount: 3,
    activeCount: 2,
    dataInsufficientCount: 1,
    incompleteEvidenceCount: 1,
    byRule: {
      won_without_so: 0,
      expected_close_overdue: 1,
      quotation_expiry_due: 1,
      deal_stagnant: 1,
    },
  },
  page: { limit: 25, returnedCount: 3 },
  nextCursor: null,
  items: [
    {
      entityId: "00000000-0000-4000-8000-000000000001",
      clientId: "00000000-0000-4000-8000-000000000011",
      clientName: "PT Fixture Utama",
      ownerId: "00000000-0000-4000-8000-000000000021",
      ownerName: "Nur Iman",
      quotationNumber: "DSM-26QUO001",
      stage: "Negotiation",
      ruleId: "expected_close_overdue",
      state: "active",
      dataState: "complete",
      priority: 1,
      reason: "Expected close lewat 1 hari.",
      baseDate: "2026-10-16",
      dueDate: "2026-10-16",
      ageDays: 1,
      thresholdDays: null,
      totalValue: 125_000_000,
      sourceHref: "/quotations/00000000-0000-4000-8000-000000000001",
    },
    {
      entityId: "00000000-0000-4000-8000-000000000001",
      clientId: "00000000-0000-4000-8000-000000000011",
      clientName: "PT Fixture Utama",
      ownerId: "00000000-0000-4000-8000-000000000021",
      ownerName: "Nur Iman",
      quotationNumber: "DSM-26QUO001",
      stage: "Negotiation",
      ruleId: "quotation_expiry_due",
      state: "active",
      dataState: "complete",
      priority: 2,
      reason: "Quotation kedaluwarsa dalam 7 hari.",
      baseDate: "2026-10-24",
      dueDate: "2026-10-24",
      ageDays: 0,
      thresholdDays: 7,
      totalValue: 125_000_000,
      sourceHref: "/quotations/00000000-0000-4000-8000-000000000001",
    },
    {
      entityId: "00000000-0000-4000-8000-000000000002",
      clientId: "00000000-0000-4000-8000-000000000012",
      clientName: "PT Data Lama",
      ownerId: "00000000-0000-4000-8000-000000000021",
      ownerName: "Nur Iman",
      quotationNumber: "DSM-26QUO002",
      stage: "Hot Prospect",
      ruleId: "deal_stagnant",
      state: "data_insufficient",
      dataState: "data_insufficient",
      priority: 4,
      reason: "Data belum cukup: belum ada stage event atau follow-up valid.",
      baseDate: null,
      dueDate: null,
      ageDays: null,
      thresholdDays: 14,
      totalValue: null,
      sourceHref: "/quotations/00000000-0000-4000-8000-000000000002",
    },
  ],
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
  test("unlinked Closed Won quotation offers create and manual-link actions", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard
        {...props}
        view="board"
        pendingSoItemIds={new Set(["won-preview"])}
      />,
    );
    expect(html).toContain("SO belum dibuat");
    expect(html).toContain("Buat SO");
    expect(html).toContain("Link SO");
  });
  test("linked Closed Won quotation exposes the released SO number", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard
        {...props}
        view="board"
        linkedSalesOrderByItemId={
          new Map([
            ["won-preview", { id: "so-preview", soNumber: "DSM-26SO777" }],
          ])
        }
      />,
    );
    expect(html).toContain("SO released");
    expect(html).toContain("DSM-26SO777");
  });
  test("does not claim an SO is missing when link status cannot be loaded", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard
        {...props}
        view="board"
        pendingSoItemIds={new Set(["won-preview"])}
        salesOrderLinksUnavailable
      />,
    );
    expect(html).toContain("Status Sales Order tidak dapat dimuat");
    expect(html).not.toContain("SO belum dibuat atau dihubungkan");
  });
  test("read-only roles see missing SO status without mutation actions", () => {
    const html = renderToStaticMarkup(
      <PipelineBoard
        {...props}
        view="board"
        pendingSoItemIds={new Set(["won-preview"])}
        canMutateSalesOrders={false}
      />,
    );
    expect(html).toContain("SO belum dibuat atau dihubungkan");
    expect(html).not.toContain("Hubungkan SO");
    expect(html).not.toContain("Buat SO");
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
  test("action queue groups rules by entity and keeps reasons, priority, source, and insufficient data visible", () => {
    const html = renderWithQueryClient(
      <ActionSignalList snapshot={signalSnapshot} />,
    );
    expect(html.match(/PT Fixture Utama/g)).toHaveLength(1);
    expect(html).toContain("Expected close lewat");
    expect(html).toContain("Quotation hampir kedaluwarsa");
    expect(html).toContain("Prioritas 1");
    expect(html).toContain("Data belum cukup");
    expect(html).toContain("Buka quotation");
    expect(html).toContain("3 sinyal");
    expect(html).toContain("2 quotation dimuat");
  });
  test("action queue distinguishes loading, error, empty, aggregate-only, and pagination states", () => {
    expect(renderWithQueryClient(<ActionSignalList isLoading />)).toContain(
      "Memuat antrean tindakan",
    );
    expect(
      renderWithQueryClient(<ActionSignalList isError onRetry={() => {}} />),
    ).toContain("Antrean tindakan gagal dimuat");
    expect(renderWithQueryClient(<ActionSignalList />)).toContain(
      "Tidak ada exception aktif",
    );
    expect(
      renderWithQueryClient(
        <ActionSignalList snapshot={signalSnapshot} aggregateOnly />,
      ),
    ).toContain("Detail dibatasi untuk role Executive");
    expect(
      renderWithQueryClient(
        <ActionSignalList
          snapshot={signalSnapshot}
          hasNextPage
          onLoadMore={() => {}}
          showAllHref="/tasks"
        />,
      ),
    ).toContain("Muat lebih banyak");
    expect(
      renderWithQueryClient(
        <ActionSignalList
          snapshot={signalSnapshot}
          compact
          showAllHref="/tasks"
        />,
      ),
    ).toContain("Lihat antrean lengkap");
  });
});
