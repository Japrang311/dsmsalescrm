import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRole } from "@/context/role-context-core";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { canUseAiSummary } from "@/lib/ai/access";
import { buildSummaryFacts } from "@/lib/ai/summary-facts";
import { targetForMonth } from "@/lib/data/dashboard-selectors";
import { getPipelineMetrics } from "@/lib/data/pipeline-metrics";
import { getRiskAlertCounts } from "@/lib/data/sales-performance-metrics";
import { getSalesOrdersMetrics } from "@/lib/data/sales-orders-metrics";
import {
  DATA_UNAVAILABLE_MESSAGE,
  summaryDataBlocked,
} from "@/lib/ai/summary-readiness";
import { supabase } from "@/lib/supabase";
import { CURRENT_MONTH, CURRENT_YEAR, NOW } from "@/lib/domain";
import { generateAiSummary } from "@/lib/ai/summary-server";

type SummaryBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

// The model is asked (see summary-prompt.ts) for a short opener followed by
// "- " bullet lines. Turn those bullets into a real list so the card is
// scannable instead of one inline run-on.
function parseSummary(text: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const bullet = line.match(/^[-•*]\s+(.*)/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(bullet[1]);
      else blocks.push({ type: "ul", items: [bullet[1]] });
    } else {
      blocks.push({ type: "p", text: line });
    }
  }
  return blocks;
}

export function AiSummaryCard() {
  const { role, realProfile } = useRole();
  const data = useDashboardData();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Convenience only — src/lib/ai/summary-server.ts re-checks independently.
  if (!canUseAiSummary(realProfile?.email)) return null;
  if (role !== "manager" && role !== "executive") return null;

  const audience = role === "manager" ? "manager" : "executive";
  const blocked = summaryDataBlocked(data);
  const dataUnavailable = data.hasError;

  async function onGenerate() {
    setBusy(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (!accessToken) {
        setError("Sesi Anda sudah berakhir. Silakan masuk kembali.");
        return;
      }

      // DateRange is { from: Date; to: Date }. This mirrors how the Dashboard
      // already builds ranges — see _app.dashboard.tsx:121. `now` is the real
      // wall-clock time (used only for periodLabel/generatedAtLabel), not the
      // pinned business clock NOW — NOW is pinned to the start of today and
      // would make the provenance line claim the summary was generated at
      // midnight.
      const now = new Date();
      const range = {
        from: new Date(CURRENT_YEAR, CURRENT_MONTH - 1, 1),
        to: NOW,
      };

      // Same RPC, same range as the Dashboard's own month KPI (see
      // _app.dashboard.tsx:125) so the paragraph and the box above it agree
      // by construction. Fetched here, on click — nothing loads before then.
      const [riskCounts, pipeline, monthMetrics] = await Promise.all([
        getRiskAlertCounts(),
        getPipelineMetrics(),
        getSalesOrdersMetrics({ from: range.from, to: range.to }),
      ]);

      const facts = buildSummaryFacts({
        audience,
        now,
        range,
        orders: data.orders,
        tasks: data.tasks,
        clients: data.clients,
        salesTeam: data.salesTeam,
        ownersById: data.ownersById,
        targetsByMember: data.targetsByMember,
        // useDashboardData().companyTarget is a MonthlyTarget[] (one entry
        // per calendar month), not a number — buildSummaryFacts wants the
        // single monthly target figure for the period being summarized.
        companyTarget: targetForMonth(data.companyTarget, CURRENT_MONTH),
        revenueTotals: {
          ppn: monthMetrics.ppnValue,
          nonPpn: monthMetrics.nonPpnValue,
        },
        riskCounts,
        pipeline,
      });

      const result = await generateAiSummary({ data: { accessToken, facts } });
      if (result.ok) {
        setText(result.text);
        setGeneratedAt(facts.generatedAtLabel);
      } else {
        setError(result.message);
      }
    } catch {
      setError("Ringkasan gagal dibuat. Coba lagi nanti.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4" />
          Ringkasan AI
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerate}
          disabled={busy || blocked}
        >
          {busy ? "Menyusun…" : "Buat Ringkasan"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {dataUnavailable ? (
          <p className="text-sm text-destructive">{DATA_UNAVAILABLE_MESSAGE}</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {text ? (
          <>
            <div className="space-y-2 text-sm leading-relaxed">
              {parseSummary(text).map((block, i) =>
                block.type === "ul" ? (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{block.text}</p>
                ),
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
              <p className="text-xs text-muted-foreground">
                Dirangkai AI dari data {generatedAt}. Angka berasal dari sistem
                — periksa sebelum dipakai di laporan resmi.
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(text)}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Salin
              </Button>
            </div>
          </>
        ) : !error && !dataUnavailable ? (
          <p className="text-sm text-muted-foreground">
            Tekan “Buat Ringkasan” untuk merangkum kinerja periode ini.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
