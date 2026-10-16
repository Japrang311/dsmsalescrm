import { describe, expect, test } from "bun:test";
import { AlertTriangle } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusBadge, RiskDot } from "@/components/clients/StatusBadges";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportsForecastSection } from "@/components/reports/ReportsForecastSection";
import type { ForecastSnapshot } from "@/lib/data/forecast-snapshot";

describe("UI smoke renders", () => {
  test("client status and risk badges render their visible labels", () => {
    const html = renderToStaticMarkup(
      <div>
        <StatusBadge status="Active Customer" />
        <RiskDot risk="High" />
      </div>,
    );

    expect(html).toContain("Active Customer");
    expect(html).toContain("High");
  });

  test("empty state renders title, description, and optional icon", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        icon={AlertTriangle}
        title="Tidak ada data"
        description="Coba ubah filter laporan."
      />,
    );

    expect(html).toContain("Tidak ada data");
    expect(html).toContain("Coba ubah filter laporan.");
    expect(html).toContain("lucide-triangle-alert");
  });

  test("forecast historical state never presents current pipeline", () => {
    const snapshot: ForecastSnapshot = {
      snapshotMode: "historical_unavailable",
      period: { from: "2026-08-01", to: "2026-08-31" },
      asOfDate: "2026-10-17",
      fetchedAt: "2026-10-17T03:00:00.000Z",
      salesOrderValue: 1_000,
      openPipelineValue: null,
      forecastValue: null,
      undated: { count: 0, totalValue: 0 },
      overdue: { count: 0, totalValue: 0, weightedValue: 0 },
      page: { limit: 100, offset: 0, totalCount: 0, contributionValue: 0 },
      items: [],
    };
    const html = renderToStaticMarkup(
      <ReportsForecastSection
        totalRevenue={0}
        sourceBreakdown={[]}
        snapshot={snapshot}
        target={0}
        targetComparable={false}
        isLoading={false}
        isError={false}
      />,
    );

    expect(html).toContain("Forecast historis tidak tersedia");
    expect(html).not.toContain("Snapshot saat ini");
  });

  test("forecast error state does not render a fabricated zero", () => {
    const html = renderToStaticMarkup(
      <ReportsForecastSection
        totalRevenue={0}
        sourceBreakdown={[]}
        target={0}
        targetComparable={false}
        isLoading={false}
        isError
      />,
    );

    expect(html).toContain("Forecast gagal dimuat");
    expect(html).not.toContain("Forecast periode</p><p");
  });
});
