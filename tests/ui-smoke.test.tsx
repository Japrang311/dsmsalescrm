import { describe, expect, test } from "bun:test";
import { AlertTriangle } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatusBadge, RiskDot } from "@/components/clients/StatusBadges";
import { EmptyState } from "@/components/ui/empty-state";

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
});
