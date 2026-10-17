import { describe, expect, test } from "bun:test";
import {
  evaluateCrmSignalCandidate,
  type CrmSignalCandidate,
} from "../crm-signal-rules";
import { normalizeActionSignalsSnapshot } from "./action-signals";

const baseCandidate: CrmSignalCandidate = {
  entityId: "00000000-0000-4000-8000-000000000001",
  stage: "Quotes Sent",
  asOfDate: "2026-10-17",
  expectedCloseDate: null,
  quotationExpiredDate: null,
  lastMeaningfulProgressDate: null,
  wonEventDate: null,
  hasActiveSalesOrder: false,
};

describe("CRM action signal rules", () => {
  test("applies the approved expiry and stagnation cutoffs inclusively", () => {
    const rules = evaluateCrmSignalCandidate({
      ...baseCandidate,
      expectedCloseDate: "2026-10-16",
      quotationExpiredDate: "2026-10-24",
      lastMeaningfulProgressDate: "2026-10-03",
    });

    expect(rules.map((rule) => rule.ruleId)).toEqual([
      "expected_close_overdue",
      "quotation_expiry_due",
      "deal_stagnant",
    ]);
    expect(rules.find((rule) => rule.ruleId === "deal_stagnant")).toMatchObject(
      {
        state: "active",
        dataState: "complete",
        ageDays: 14,
        thresholdDays: 14,
      },
    );
  });

  test("does not mark day 13 or expiry day 8 as an exception", () => {
    expect(
      evaluateCrmSignalCandidate({
        ...baseCandidate,
        quotationExpiredDate: "2026-10-25",
        lastMeaningfulProgressDate: "2026-10-04",
      }),
    ).toEqual([]);
  });

  test("does not invent stagnation age when no meaningful progress exists", () => {
    expect(evaluateCrmSignalCandidate(baseCandidate)).toEqual([
      expect.objectContaining({
        ruleId: "deal_stagnant",
        state: "data_insufficient",
        dataState: "data_insufficient",
        baseDate: null,
        ageDays: null,
      }),
    ]);
  });

  test("keeps Won without SO actionable while disclosing missing Won event age", () => {
    const [signal] = evaluateCrmSignalCandidate({
      ...baseCandidate,
      stage: "Closed Won",
    });
    expect(signal).toMatchObject({
      ruleId: "won_without_so",
      state: "active",
      dataState: "data_insufficient",
      baseDate: null,
      ageDays: null,
    });
    expect(
      evaluateCrmSignalCandidate({
        ...baseCandidate,
        stage: "Closed Won",
        hasActiveSalesOrder: true,
      }),
    ).toEqual([]);
  });
});

describe("action signal adapter", () => {
  test("normalizes numeric values and accepts a stable keyset cursor", () => {
    const snapshot = normalizeActionSignalsSnapshot({
      asOfDate: "2026-10-17",
      fetchedAt: "2026-10-17T01:00:00Z",
      totals: {
        totalCount: 1,
        activeCount: 1,
        dataInsufficientCount: 0,
        incompleteEvidenceCount: 0,
        byRule: { won_without_so: 1 },
      },
      page: { limit: 1, returnedCount: 1 },
      nextCursor: {
        priority: 1,
        dueDate: "2026-10-15",
        valueKnown: true,
        value: "1250000",
        entityId: "00000000-0000-4000-8000-000000000001",
        ruleId: "won_without_so",
      },
      items: [
        {
          entityId: "00000000-0000-4000-8000-000000000001",
          clientId: "00000000-0000-4000-8000-000000000002",
          clientName: "Fixture Client",
          ownerId: "00000000-0000-4000-8000-000000000003",
          ownerName: "Fixture Owner",
          quotationNumber: "QUO-1",
          stage: "Closed Won",
          ruleId: "won_without_so",
          state: "active",
          dataState: "complete",
          priority: 1,
          reason: "Won tanpa Sales Order aktif.",
          baseDate: "2026-10-15",
          dueDate: "2026-10-15",
          ageDays: 2,
          thresholdDays: null,
          totalValue: "1250000",
          sourceHref: "/quotations/00000000-0000-4000-8000-000000000001",
        },
      ],
    });

    expect(snapshot.items[0].totalValue).toBe(1_250_000);
    expect(snapshot.nextCursor?.value).toBe(1_250_000);
  });

  test("rejects totals or rule priorities that do not reconcile", () => {
    expect(() =>
      normalizeActionSignalsSnapshot({
        asOfDate: "2026-10-17",
        fetchedAt: "2026-10-17T01:00:00Z",
        totals: {
          totalCount: 1,
          activeCount: 1,
          dataInsufficientCount: 0,
          incompleteEvidenceCount: 0,
          byRule: { won_without_so: 1 },
        },
        page: { limit: 50, returnedCount: 1 },
        nextCursor: null,
        items: [
          {
            entityId: "00000000-0000-4000-8000-000000000001",
            clientId: "00000000-0000-4000-8000-000000000002",
            clientName: "Fixture Client",
            ownerId: "00000000-0000-4000-8000-000000000003",
            ownerName: "Fixture Owner",
            quotationNumber: "QUO-1",
            stage: "Closed Won",
            ruleId: "won_without_so",
            state: "active",
            dataState: "complete",
            priority: 4,
            reason: "Wrong priority",
            baseDate: "2026-10-15",
            dueDate: "2026-10-15",
            ageDays: 2,
            thresholdDays: null,
            totalValue: 1_250_000,
            sourceHref: "/quotations/00000000-0000-4000-8000-000000000001",
          },
        ],
      }),
    ).toThrow("ACTION_SIGNAL_SNAPSHOT_MISMATCH");
  });
});
