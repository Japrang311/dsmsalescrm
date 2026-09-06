# AI Dashboard Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Buat Ringkasan" card to the Dashboard that turns already-computed figures into an Indonesian paragraph, for two allow-listed accounts only.

**Architecture:** The browser computes every number with existing selectors, formats each one to its final display string, and posts that facts object to a TanStack Start server function. The server verifies the caller's Supabase session and allow-list membership, calls Vercel AI Gateway, and returns plain text. No database schema change, no migration, no RLS change.

**Tech Stack:** TanStack Start 1.168.40 (`createServerFn`), React 19, `ai` v6 (Vercel AI Gateway), Supabase JS 2.110, bun:test.

**Spec:** `docs/superpowers/specs/2026-08-31-ai-dashboard-summary-design.md`

## Global Constraints

- **The AI never computes.** Every figure reaching the model is already a formatted string (`"Rp 1,2 M"`, `"75%"`, `"7 task"`). No numbers, no raw rows, no arrays of records. This is permanent, not a phase-one shortcut.
- **Executive facts must never contain a sales person's name or id, and never any task-level detail.** These come from accepted Phase 12 rules, not layout.
- Manager receives every topic, including the quotation funnel and forecast.
- Allow list is exactly `adhitya@dutasolusimetalindo.com` (manager) and `triyanto@dutasolusimetalindo.com` (executive), compared lower-cased.
- Hiding the card in the browser is convenience. The server-side check is the boundary. Both must exist.
- The Dashboard must stay fully usable when the AI feature fails. Errors render inside the card only.
- No schema change, no migration, no RLS change, no CSP change (`connect-src 'self'` already covers a same-origin server function).
- Package manager is **bun**. Tests run with `bun run test`, never bare `bun test`.
- Do not force-push or rewrite published history (Lovable is connected to this repo).

## Environment prerequisites

Two things must exist before Task 4 can run end to end. Neither is a code change.

1. **Vercel AI Gateway enabled** for the `dsmsalescrm` project, then `vercel env pull .env.local` to provision `VERCEL_OIDC_TOKEN` (valid ~24h locally; auto-refreshed on deployments).
2. **Server-side Supabase env vars** — `SUPABASE_URL` and `SUPABASE_ANON_KEY` (no `VITE_` prefix) set in Vercel for Production and Preview. The browser client uses the `VITE_`-prefixed pair; those are not readable from server code.

## Owner checkpoint before Task 1

The allow list is only correct if both addresses match real production rows. Run this in the Supabase dashboard SQL editor for project `qhtfixgbcpcitokeryxb` (read-only):

```sql
select email, role, status
from public.profiles
where lower(email) in (
  'adhitya@dutasolusimetalindo.com',
  'triyanto@dutasolusimetalindo.com'
);
```

Expected: exactly two rows — `adhitya…` with `role = 'manager'`, `triyanto…` with `role = 'executive'`, both `status = 'active'`.

If either row is missing or differs, **stop and report**. Do not edit the allow list to match whatever the query returned; a mismatch means an assumption in the spec is wrong.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/ai/access.ts` | Allow list and `canUseAiSummary`. No imports from the data layer. |
| `src/lib/ai/access.test.ts` | Tests for the above. |
| `src/lib/ai/summary-facts.ts` | Dashboard data → role-specific facts object of formatted strings. Pure. |
| `src/lib/ai/summary-facts.test.ts` | Tests, including the Executive redaction guarantees. |
| `src/lib/ai/summary-prompt.ts` | Facts → system + user prompt. Pure. |
| `src/lib/ai/summary-prompt.test.ts` | Tests for prompt content rules. |
| `src/server/ai-summary.ts` | Server function: session check, allow-list gate, Gateway call, error mapping. |
| `src/server/ai-summary.test.ts` | Tests for the gate and error mapping (no network). |
| `src/components/dashboard/AiSummaryCard.tsx` | Card UI: button, states, result, Copy. |
| `src/routes/_app.dashboard.tsx` | Mount the card. Modify only. |

---

### Task 1: Allow list

**Files:**
- Create: `src/lib/ai/access.ts`
- Test: `src/lib/ai/access.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AI_SUMMARY_ALLOWED_EMAILS: readonly string[]`, `canUseAiSummary(email: string | null | undefined): boolean`.

Note on the "active account" check the spec mentions: the browser gets `realProfile` from `useRole()`, and `src/lib/auth/account-status.ts` only attaches a `profile` to the `{ kind: "active" }` variant. So a non-null `realProfile` already proves the account is active, and `canUseAiSummary` only needs the email. The server performs its own independent active check in Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ai/access.test.ts
import { describe, expect, test } from "bun:test";
import { AI_SUMMARY_ALLOWED_EMAILS, canUseAiSummary } from "./access";

describe("canUseAiSummary", () => {
  test("allows exactly the two pilot accounts", () => {
    expect(canUseAiSummary("adhitya@dutasolusimetalindo.com")).toBe(true);
    expect(canUseAiSummary("triyanto@dutasolusimetalindo.com")).toBe(true);
    expect(AI_SUMMARY_ALLOWED_EMAILS).toHaveLength(2);
  });

  test("is case-insensitive and ignores surrounding whitespace", () => {
    expect(canUseAiSummary("ADHITYA@dutasolusimetalindo.com")).toBe(true);
    expect(canUseAiSummary("  Triyanto@DutaSolusiMetalindo.com  ")).toBe(true);
  });

  test("rejects everyone else", () => {
    expect(canUseAiSummary("leli@dutasolusimetalindo.com")).toBe(false);
    expect(canUseAiSummary("iman@dutasolusimetalindo.com")).toBe(false);
    expect(canUseAiSummary("")).toBe(false);
    expect(canUseAiSummary(null)).toBe(false);
    expect(canUseAiSummary(undefined)).toBe(false);
  });

  test("rejects a lookalike address that merely contains an allowed one", () => {
    expect(canUseAiSummary("adhitya@dutasolusimetalindo.com.evil.test")).toBe(
      false,
    );
    expect(canUseAiSummary("xadhitya@dutasolusimetalindo.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/ai/access.test.ts`
Expected: FAIL — cannot resolve module `./access`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ai/access.ts

/**
 * Limited pilot. The AI Dashboard summary is available to these two accounts
 * only — Adhitya (manager) and Triyanto (executive). Both were confirmed
 * against production `public.profiles` before this list was written; see
 * docs/superpowers/specs/2026-08-31-ai-dashboard-summary-design.md §9.
 *
 * This constant is the single source of truth: the Dashboard reads it to
 * decide whether to render the card, and the server function reads it to
 * decide whether to answer. Hiding the card is convenience; the server check
 * is the boundary.
 */
export const AI_SUMMARY_ALLOWED_EMAILS: readonly string[] = [
  "adhitya@dutasolusimetalindo.com",
  "triyanto@dutasolusimetalindo.com",
];

export function canUseAiSummary(email: string | null | undefined): boolean {
  if (!email) return false;
  return AI_SUMMARY_ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/ai/access.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/access.ts src/lib/ai/access.test.ts
git commit -m "feat: add AI summary allow list for the two pilot accounts"
```

---

### Task 2: Facts builder

This is the task that carries the safety guarantees. Everything the model ever sees is produced here.

**Files:**
- Create: `src/lib/ai/summary-facts.ts`
- Test: `src/lib/ai/summary-facts.test.ts`

**Interfaces:**
- Consumes: `canUseAiSummary` is not used here. Existing selectors and types only.
- Produces: `SummaryAudience`, `SummaryFacts`, `SummaryFactsInput`, `buildSummaryFacts(input: SummaryFactsInput): SummaryFacts`.

Existing signatures this task calls, confirmed in the repo:

```ts
salesPerformanceInRange(orders, tasks, salesTeam, range, byMember)
  // → { member: SalesTeamMember; revenue: number; target: number;
  //     pct: number; overdue: number; openTasks: number }[]
topCustomersInRange(orders, clients, range, limit = 5)
  // → { client: Client; revenue: number }[]
revenueInRange(orders, range)          // → number
revenueByTaxInRange(orders, range)     // → { ppn: number; nonPpn: number }
filterManagerTeamExceptions(tasks, ownersById)  // → Task[]
```

`RiskAlertCounts` and `PipelineMetrics` are fetched asynchronously by the caller (Task 5) and passed in, so this function stays pure and testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ai/summary-facts.test.ts
import { describe, expect, test } from "bun:test";
import type { Client, SalesOrder, Task } from "@/lib/domain";
import type { RiskAlertCounts } from "@/lib/data/sales-performance-metrics";
import type { PipelineMetrics } from "@/lib/data/pipeline-metrics";
import { buildSummaryFacts, type SummaryFactsInput } from "./summary-facts";

// DateRange is { from: Date; to: Date } — Date objects, not ISO strings.
const RANGE = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) };

function order(id: string, ownerId: string, clientId: string, value: number): SalesOrder {
  return {
    id,
    ownerId,
    clientId,
    number: id,
    date: "2026-08-10",
    value,
    paymentStatus: "Paid",
    taxType: "PPN",
    source: "New Product",
  } as unknown as SalesOrder;
}

function task(id: string, ownerId: string): Task {
  return {
    id,
    ownerId,
    title: `Follow up ${id}`,
    dueDate: "2026-08-01",
    method: "Phone",
    workflowStatus: "Open",
    dueState: "Escalated",
    calendarIncomplete: false,
    category: "Follow-Up",
    priority: "Normal",
    archived: false,
  } as unknown as Task;
}

const RISK: RiskAlertCounts = {
  overdueTaskCount: 7,
  bigPendingCommitCount: 3,
  bigPendingCommitValue: 480_000_000,
  dormantHighValueClientCount: 2,
};

const PIPELINE: PipelineMetrics = {
  stages: [
    {
      stage: "Negosiasi",
      itemCount: 12,
      totalValue: 3_100_000_000,
      openValue: 3_100_000_000,
      wonValue: 0,
      lostValue: 0,
      wonCount: 0,
      lostCount: 0,
    },
  ],
  totals: {
    itemCount: 12,
    totalValue: 3_100_000_000,
    openValue: 3_100_000_000,
    wonValue: 0,
    lostValue: 0,
    wonCount: 0,
    lostCount: 0,
    winRate: 0.42,
  },
};

function input(overrides: Partial<SummaryFactsInput> = {}): SummaryFactsInput {
  return {
    audience: "manager",
    now: new Date("2026-08-31T14:30:00+07:00"),
    range: RANGE,
    orders: [order("SO-1", "sales-budi", "client-1", 1_200_000_000)],
    tasks: [task("T-1", "sales-budi")],
    clients: [{ id: "client-1", name: "PT Karya Utama" } as unknown as Client],
    salesTeam: [{ id: "sales-budi", name: "Budi Santoso", initials: "BS" }],
    ownersById: { "sales-budi": { role: "sales" } },
    targetsByMember: {},
    companyTarget: 2_800_000_000,
    riskCounts: RISK,
    pipeline: PIPELINE,
    ...overrides,
  };
}

describe("buildSummaryFacts", () => {
  test("manager facts include per-sales performance and escalated tasks", () => {
    const facts = buildSummaryFacts(input({ audience: "manager" }));
    expect(facts.salesPerformance).toBeDefined();
    expect(facts.salesPerformance?.[0]?.name).toBe("Budi Santoso");
    expect(facts.escalatedTasks).toBeDefined();
    expect(facts.escalatedTasks?.[0]?.ownerName).toBe("Budi Santoso");
  });

  test("executive facts omit per-sales performance and escalated tasks entirely", () => {
    const facts = buildSummaryFacts(input({ audience: "executive" }));
    expect(facts.salesPerformance).toBeUndefined();
    expect(facts.escalatedTasks).toBeUndefined();
  });

  test("no sales person's name or id survives anywhere in executive facts", () => {
    const facts = buildSummaryFacts(input({ audience: "executive" }));
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toContain("Budi Santoso");
    expect(serialized).not.toContain("sales-budi");
    expect(serialized).not.toContain("Follow up");
  });

  test("both audiences keep client names and shared topics", () => {
    for (const audience of ["manager", "executive"] as const) {
      const facts = buildSummaryFacts(input({ audience }));
      expect(JSON.stringify(facts.topCustomers)).toContain("PT Karya Utama");
      expect(facts.funnel.stages.length).toBeGreaterThan(0);
      expect(facts.risk.overdueTaskCountLabel).toBeTruthy();
    }
  });

  test("every leaf value is a string, so the model never receives a raw number", () => {
    const facts = buildSummaryFacts(input({ audience: "manager" }));
    const leaves: unknown[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        return Object.values(value).forEach(walk);
      }
      leaves.push(value);
    };
    walk(facts);
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) expect(typeof leaf).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/ai/summary-facts.test.ts`
Expected: FAIL — cannot resolve module `./summary-facts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ai/summary-facts.ts
import type { Client, DateRange, Role, SalesOrder, Task } from "@/lib/domain";
import type { PipelineMetrics } from "@/lib/data/pipeline-metrics";
import type { RiskAlertCounts } from "@/lib/data/sales-performance-metrics";
// SalesTeamMember lives in dashboard-selectors; TargetsByMember lives in
// targets. They are not in the same module — importing both from
// dashboard-selectors will not typecheck.
import type { SalesTeamMember } from "@/lib/data/dashboard-selectors";
import type { TargetsByMember } from "@/lib/data/targets";
import {
  revenueByTaxInRange,
  revenueInRange,
  salesPerformanceInRange,
  topCustomersInRange,
} from "@/lib/data/dashboard-selectors";
import { filterManagerTeamExceptions } from "@/lib/data/task-exceptions";
import { formatDateShort, formatPercent, formatRupiahShort } from "@/lib/format";

export type SummaryAudience = "manager" | "executive";

/**
 * Everything the model is ever allowed to see. Every leaf is a string that is
 * already formatted for display, because the model must never do arithmetic —
 * it reuses these strings verbatim. `summary-facts.test.ts` asserts the
 * all-strings rule, so adding a numeric field here will fail the suite.
 */
export type SummaryFacts = {
  audience: SummaryAudience;
  periodLabel: string;
  generatedAtLabel: string;
  revenue: {
    actualLabel: string;
    targetLabel: string;
    attainmentLabel: string;
    ppnLabel: string;
    nonPpnLabel: string;
  };
  topCustomers: { name: string; revenueLabel: string }[];
  risk: {
    overdueTaskCountLabel: string;
    bigPendingCommitCountLabel: string;
    bigPendingCommitValueLabel: string;
    dormantHighValueClientCountLabel: string;
  };
  funnel: {
    winRateLabel: string;
    openValueLabel: string;
    stages: { stage: string; countLabel: string; openValueLabel: string }[];
  };
  /** Manager only. Absent for executive — aggregate-only reporting. */
  salesPerformance?: {
    name: string;
    revenueLabel: string;
    targetLabel: string;
    attainmentLabel: string;
  }[];
  /** Manager only. Absent for executive — Reports withholds task detail. */
  escalatedTasks?: { ownerName: string; title: string }[];
};

export type SummaryFactsInput = {
  audience: SummaryAudience;
  now: Date;
  range: DateRange;
  orders: SalesOrder[];
  tasks: Task[];
  clients: Client[];
  salesTeam: SalesTeamMember[];
  ownersById: Record<string, { role?: Role }>;
  targetsByMember: TargetsByMember;
  companyTarget: number;
  riskCounts: RiskAlertCounts;
  pipeline: PipelineMetrics;
};

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function attainment(actual: number, target: number): string {
  if (target <= 0) return "tidak ada target";
  return formatPercent(actual / target);
}

export function buildSummaryFacts(input: SummaryFactsInput): SummaryFacts {
  const {
    audience, now, range, orders, tasks, clients, salesTeam,
    ownersById, targetsByMember, companyTarget, riskCounts, pipeline,
  } = input;

  const actual = revenueInRange(orders, range);
  const tax = revenueByTaxInRange(orders, range);

  const facts: SummaryFacts = {
    audience,
    periodLabel: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    generatedAtLabel: `${formatDateShort(now)}, ${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
    revenue: {
      actualLabel: formatRupiahShort(actual),
      targetLabel: formatRupiahShort(companyTarget),
      attainmentLabel: attainment(actual, companyTarget),
      ppnLabel: formatRupiahShort(tax.ppn),
      nonPpnLabel: formatRupiahShort(tax.nonPpn),
    },
    topCustomers: topCustomersInRange(orders, clients, range).map((row) => ({
      name: row.client.name,
      revenueLabel: formatRupiahShort(row.revenue),
    })),
    risk: {
      overdueTaskCountLabel: `${riskCounts.overdueTaskCount} task`,
      bigPendingCommitCountLabel: `${riskCounts.bigPendingCommitCount} dokumen`,
      bigPendingCommitValueLabel: formatRupiahShort(
        riskCounts.bigPendingCommitValue,
      ),
      dormantHighValueClientCountLabel: `${riskCounts.dormantHighValueClientCount} client`,
    },
    funnel: {
      winRateLabel: formatPercent(pipeline.totals.winRate),
      openValueLabel: formatRupiahShort(pipeline.totals.openValue),
      stages: pipeline.stages.map((stage) => ({
        stage: stage.stage,
        countLabel: `${stage.itemCount} item`,
        openValueLabel: formatRupiahShort(stage.openValue),
      })),
    },
  };

  // Executive receives aggregates only. Returning early — rather than
  // building these and deleting them — means a sales name can never
  // transiently exist in the executive object.
  if (audience === "executive") return facts;

  const nameById = new Map(salesTeam.map((m) => [m.id, m.name]));

  facts.salesPerformance = salesPerformanceInRange(
    orders, tasks, salesTeam, range, targetsByMember,
  ).map((row) => ({
    name: row.member.name,
    revenueLabel: formatRupiahShort(row.revenue),
    targetLabel: formatRupiahShort(row.target),
    attainmentLabel: attainment(row.revenue, row.target),
  }));

  facts.escalatedTasks = filterManagerTeamExceptions(tasks, ownersById).map(
    (t) => ({
      ownerName: nameById.get(t.ownerId) ?? "Sales",
      title: t.title,
    }),
  );

  return facts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/ai/summary-facts.test.ts`
Expected: PASS, 5 tests.

If the all-strings test fails, do not cast the offending value — format it. That test is the guardrail for the "AI never computes" rule.

- [ ] **Step 5: Typecheck, then commit**

```bash
bun run typecheck
git add src/lib/ai/summary-facts.ts src/lib/ai/summary-facts.test.ts
git commit -m "feat: build role-specific AI summary facts with executive redaction"
```

---

### Task 3: Prompt builder

**Files:**
- Create: `src/lib/ai/summary-prompt.ts`
- Test: `src/lib/ai/summary-prompt.test.ts`

**Interfaces:**
- Consumes: `SummaryFacts` from Task 2.
- Produces: `buildSummaryPrompt(facts: SummaryFacts): { system: string; prompt: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/ai/summary-prompt.test.ts
import { describe, expect, test } from "bun:test";
import type { SummaryFacts } from "./summary-facts";
import { buildSummaryPrompt } from "./summary-prompt";

function facts(audience: SummaryFacts["audience"]): SummaryFacts {
  const base: SummaryFacts = {
    audience,
    periodLabel: "Agustus 2026",
    generatedAtLabel: "31 Agu 2026, 14:30",
    revenue: {
      actualLabel: "Rp 2,1 M",
      targetLabel: "Rp 2,8 M",
      attainmentLabel: "75%",
      ppnLabel: "Rp 1,4 M",
      nonPpnLabel: "Rp 0,7 M",
    },
    topCustomers: [{ name: "PT Karya Utama", revenueLabel: "Rp 800 jt" }],
    risk: {
      overdueTaskCountLabel: "7 task",
      bigPendingCommitCountLabel: "3 dokumen",
      bigPendingCommitValueLabel: "Rp 480 jt",
      dormantHighValueClientCountLabel: "2 client",
    },
    funnel: {
      winRateLabel: "42%",
      openValueLabel: "Rp 3,1 M",
      stages: [
        { stage: "Negosiasi", countLabel: "12 item", openValueLabel: "Rp 3,1 M" },
      ],
    },
  };
  if (audience === "manager") {
    base.salesPerformance = [
      {
        name: "Budi Santoso",
        revenueLabel: "Rp 900 jt",
        targetLabel: "Rp 700 jt",
        attainmentLabel: "129%",
      },
    ];
    base.escalatedTasks = [
      { ownerName: "Budi Santoso", title: "Follow up PT Karya Utama" },
    ];
  }
  return base;
}

describe("buildSummaryPrompt", () => {
  test("forbids inventing or recomputing figures", () => {
    const { system } = buildSummaryPrompt(facts("manager"));
    expect(system).toContain("persis seperti tertulis");
    expect(system).toContain("Jangan menghitung");
  });

  test("asks for Indonesian output", () => {
    const { system } = buildSummaryPrompt(facts("manager"));
    expect(system.toLowerCase()).toContain("bahasa indonesia");
  });

  test("carries every provided figure into the prompt", () => {
    const { prompt } = buildSummaryPrompt(facts("manager"));
    expect(prompt).toContain("Rp 2,1 M");
    expect(prompt).toContain("75%");
    expect(prompt).toContain("PT Karya Utama");
    expect(prompt).toContain("Budi Santoso");
  });

  test("executive prompt names no sales person and instructs aggregate-only", () => {
    const { system, prompt } = buildSummaryPrompt(facts("executive"));
    expect(prompt).not.toContain("Budi Santoso");
    expect(system).toContain("jangan menyebut nama sales");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/ai/summary-prompt.test.ts`
Expected: FAIL — cannot resolve module `./summary-prompt`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ai/summary-prompt.ts
import type { SummaryFacts } from "./summary-facts";

const SHARED_RULES = [
  "Kamu menulis ringkasan kinerja penjualan dalam bahasa Indonesia yang lugas dan profesional.",
  "Gunakan HANYA angka yang diberikan, disalin persis seperti tertulis. Jangan menghitung, menjumlahkan, membandingkan, atau memperkirakan angka apa pun sendiri.",
  "Jika sebuah informasi tidak diberikan, jangan menyebutnya dan jangan menebak.",
  "Tulis 2–4 paragraf pendek. Tanpa judul, tanpa bullet, tanpa basa-basi pembuka atau penutup.",
  "Sebutkan lebih dulu hal yang paling perlu ditindaklanjuti.",
].join("\n");

const AUDIENCE_RULES: Record<SummaryFacts["audience"], string> = {
  manager:
    "Pembaca adalah Sales Manager. Boleh menyebut nama sales dan task yang tertunda.",
  executive:
    "Pembaca adalah Top Executive dan hanya menerima gambaran agregat: jangan menyebut nama sales mana pun dan jangan membahas task individual.",
};

export function buildSummaryPrompt(facts: SummaryFacts): {
  system: string;
  prompt: string;
} {
  return {
    system: `${SHARED_RULES}\n${AUDIENCE_RULES[facts.audience]}`,
    prompt: [
      `Periode: ${facts.periodLabel}`,
      "",
      "Data (salin angka persis seperti tertulis):",
      JSON.stringify(facts, null, 2),
    ].join("\n"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/ai/summary-prompt.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/summary-prompt.ts src/lib/ai/summary-prompt.test.ts
git commit -m "feat: build AI summary prompt with per-audience rules"
```

---

### Task 4: Server function

**Files:**
- Create: `src/server/ai-summary.ts`
- Test: `src/server/ai-summary.test.ts`
- Modify: `package.json` (add `ai`)

**Interfaces:**
- Consumes: `canUseAiSummary` (Task 1), `SummaryFacts` (Task 2), `buildSummaryPrompt` (Task 3).
- Produces: `generateAiSummary` server function accepting `{ accessToken: string; facts: SummaryFacts }` and resolving to `AiSummaryResult = { ok: true; text: string } | { ok: false; message: string }`; plus the exported pure helper `mapGatewayError(statusCode: number | undefined): string`.

Three things that will trip you up if you skip them:

1. **The installed API is `.validator()`, not `.inputValidator()`.** Verified against `node_modules/@tanstack/start-client-core/dist/esm/createServerFn.d.ts` at v1.168.40, where `inputValidator` is marked `@deprecated`.
2. **The session lives in localStorage, not cookies.** `src/lib/supabase.ts` uses plain `createClient` with no `@supabase/ssr`, so the server cannot read the session from the request. The client must send its access token explicitly, and the server verifies it by constructing its own client with that token.
3. **Server code cannot read `VITE_`-prefixed env vars.** Use `SUPABASE_URL` / `SUPABASE_ANON_KEY` (see Environment prerequisites).

The result is a discriminated union rather than a thrown error, because error objects do not serialize reliably across the server-function boundary and the UI needs a readable Indonesian message either way.

- [ ] **Step 1: Add the dependency**

```bash
bun add ai
```

Confirm it resolved to v6 or later:

```bash
bun pm ls | grep " ai@"
```

- [ ] **Step 2: Write the failing test**

Only the pure, network-free parts are tested here. The Gateway call itself is covered by the manual check in Task 6.

```ts
// src/server/ai-summary.test.ts
import { describe, expect, test } from "bun:test";
import { canUseAiSummary } from "@/lib/ai/access";
import { mapGatewayError } from "./ai-summary";

describe("mapGatewayError", () => {
  test("maps budget exhaustion to a plain Indonesian message", () => {
    expect(mapGatewayError(402)).toContain("Kuota");
  });

  test("maps rate limiting", () => {
    expect(mapGatewayError(429)).toContain("Terlalu sering");
  });

  test("maps service unavailability", () => {
    expect(mapGatewayError(503)).toContain("bermasalah");
  });

  test("falls back to a generic message for anything else", () => {
    expect(mapGatewayError(undefined)).toBeTruthy();
    expect(mapGatewayError(418)).toBeTruthy();
  });
});

describe("server gate reuses the shared allow list", () => {
  test("a non-pilot account is rejected by the same predicate the UI uses", () => {
    expect(canUseAiSummary("feni@dutasolusimetalindo.com")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test src/server/ai-summary.test.ts`
Expected: FAIL — cannot resolve module `./ai-summary`.

- [ ] **Step 4: Write the implementation**

```ts
// src/server/ai-summary.ts
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { APICallError, generateText } from "ai";
import { canUseAiSummary } from "@/lib/ai/access";
import { buildSummaryPrompt } from "@/lib/ai/summary-prompt";
import type { SummaryFacts } from "@/lib/ai/summary-facts";

export type AiSummaryResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

const DENIED: AiSummaryResult = {
  ok: false,
  message: "Fitur ini tidak tersedia untuk akun Anda.",
};

export function mapGatewayError(statusCode: number | undefined): string {
  switch (statusCode) {
    case 402:
      return "Kuota AI bulan ini sudah habis.";
    case 429:
      return "Terlalu sering. Coba lagi sebentar.";
    case 503:
      return "Layanan AI sedang bermasalah. Coba lagi nanti.";
    default:
      return "Ringkasan gagal dibuat. Coba lagi nanti.";
  }
}

/**
 * Independently re-checks the caller. The Dashboard already hides the card
 * for everyone else, but that is convenience — this is the boundary. Reads
 * the caller's own profile with the caller's own token, so RLS applies.
 */
async function authorize(accessToken: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(
    accessToken,
  );
  if (userError || !userData.user) return false;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("email, status")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) return false;
  if (profile.status !== "active") return false;

  return canUseAiSummary(profile.email);
}

export const generateAiSummary = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; facts: SummaryFacts }) => data)
  .handler(async ({ data }): Promise<AiSummaryResult> => {
    if (!data.accessToken) return DENIED;
    if (!(await authorize(data.accessToken))) return DENIED;

    const { system, prompt } = buildSummaryPrompt(data.facts);

    try {
      const result = await generateText({
        model: "anthropic/claude-sonnet-4.6",
        system,
        prompt,
        providerOptions: {
          gateway: {
            models: ["openai/gpt-5.4"],
            tags: ["feature:dashboard-summary"],
          },
        },
      });
      return { ok: true, text: result.text.trim() };
    } catch (error) {
      if (APICallError.isInstance(error)) {
        return { ok: false, message: mapGatewayError(error.statusCode) };
      }
      console.error("AI summary failed", error);
      return { ok: false, message: mapGatewayError(undefined) };
    }
  });
```

Model-slug caveat: `anthropic/claude-sonnet-4.6` with an `openai/gpt-5.4` fallback matches the AI Gateway guidance at the time of writing, but slugs change. If the first live call returns a 400 for an unknown model, list the current ids with `gateway.getAvailableModels()` and pick from that result rather than guessing a variant.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/server/ai-summary.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck and commit**

```bash
bun run typecheck
git add package.json bun.lock src/server/ai-summary.ts src/server/ai-summary.test.ts
git commit -m "feat: add server function gating and generating the AI summary"
```

---

### Task 5: Dashboard card

**Files:**
- Create: `src/components/dashboard/AiSummaryCard.tsx`
- Modify: `src/routes/_app.dashboard.tsx`

**Interfaces:**
- Consumes: `canUseAiSummary`, `buildSummaryFacts`, `generateAiSummary`, `useDashboardData`, `useRole`.
- Produces: `AiSummaryCard` (no props).

`useDashboardData()` returns `{ orders, tasks, taskMetrics, items, clients, ownersById, salesTeam, targetsByMember, companyTarget, currentUserId, isLoading }`. `useRole()` returns `{ role, hydrated, authReady, realProfile, signOut }`, and `realProfile` is non-null only for an active account.

`getRiskAlertCounts()` and `getPipelineMetrics()` are async and are fetched inside the click handler, so nothing extra loads until the button is pressed — the card costs nothing while idle.

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/AiSummaryCard.tsx
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRole } from "@/context/role-context-core";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { canUseAiSummary } from "@/lib/ai/access";
import { buildSummaryFacts } from "@/lib/ai/summary-facts";
import { getPipelineMetrics } from "@/lib/data/pipeline-metrics";
import { getRiskAlertCounts } from "@/lib/data/sales-performance-metrics";
import { supabase } from "@/lib/supabase";
import { CURRENT_MONTH, CURRENT_YEAR, NOW } from "@/lib/domain";
import { generateAiSummary } from "@/server/ai-summary";

export function AiSummaryCard() {
  const { role, realProfile } = useRole();
  const data = useDashboardData();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Convenience only — src/server/ai-summary.ts re-checks independently.
  if (!canUseAiSummary(realProfile?.email)) return null;
  if (role !== "manager" && role !== "executive") return null;

  const audience = role === "manager" ? "manager" : "executive";

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
      // already builds ranges — see _app.dashboard.tsx:121.
      const now = NOW;
      const range = {
        from: new Date(CURRENT_YEAR, CURRENT_MONTH - 1, 1),
        to: NOW,
      };

      const [riskCounts, pipeline] = await Promise.all([
        getRiskAlertCounts(),
        getPipelineMetrics(),
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
        companyTarget: data.companyTarget,
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
          disabled={busy || data.isLoading}
        >
          {busy ? "Menyusun…" : "Buat Ringkasan"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        {text ? (
          <>
            <div className="space-y-2 text-sm leading-relaxed">
              {text.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
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
        ) : !error ? (
          <p className="text-sm text-muted-foreground">
            Tekan “Buat Ringkasan” untuk merangkum kinerja periode ini.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it on the Dashboard**

In `src/routes/_app.dashboard.tsx`, add the import next to the other dashboard component imports:

```tsx
import { AiSummaryCard } from "@/components/dashboard/AiSummaryCard";
```

Then render it near the top of the page body, before the role-specific blocks, so both audiences see it in the same place. The component returns `null` for everyone not on the allow list, so no role condition is needed at the call site:

```tsx
<AiSummaryCard />
```

- [ ] **Step 3: Verify it builds and typechecks**

```bash
bun run typecheck
bun run lint
bun run build
```

Expected: all three succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/AiSummaryCard.tsx src/routes/_app.dashboard.tsx
git commit -m "feat: add AI summary card to the Dashboard for pilot accounts"
```

---

### Task 6: Full verification and documentation

**Files:**
- Modify: `tasks/todo.md`
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run the full suite**

```bash
bun run verify:app
```

Expected: lint, typecheck, tests, and build all pass. `verify:db` is deliberately not run — this feature changes no schema.

- [ ] **Step 2: Manual check against a real account**

Requires `vercel env pull .env.local` to have provisioned `VERCEL_OIDC_TOKEN`, and `SUPABASE_URL` / `SUPABASE_ANON_KEY` present for the server side.

Run `bun run dev`, then confirm each of these:

1. Signed in as `adhitya@dutasolusimetalindo.com` — the card appears; generating produces a paragraph that mentions per-sales names.
2. Signed in as `triyanto@dutasolusimetalindo.com` — the card appears; the output names **no** sales person and mentions no individual task.
3. Signed in as any other account (for example a sales account) — the card is absent.
4. Stop the network mid-request, or temporarily point the model slug at a nonexistent id — an error message renders inside the card and every other Dashboard widget still works.

Record the outcome of check 2 explicitly; it is the one that protects an accepted Phase 12 rule.

- [ ] **Step 3: Update project docs**

Append to `tasks/todo.md`, following the existing entry format, a line recording this feature as done with today's date and a pointer to the spec and this plan. In `HANDOFF.md`, note that `src/server/` now exists and is the app's first server-side code, that it requires `SUPABASE_URL`/`SUPABASE_ANON_KEY` and AI Gateway to be enabled on Vercel, and that the AI summary is a two-account pilot governed by `src/lib/ai/access.ts`.

- [ ] **Step 4: Commit**

```bash
git add tasks/todo.md HANDOFF.md
git commit -m "docs: record AI dashboard summary pilot and its server-side prerequisites"
```

- [ ] **Step 5: Owner gate before production**

Do not push to `main` until the owner confirms both:

- Management has approved sending DSM business figures, sales names, and client names to a third-party model provider (spec §11).
- AI Gateway is enabled on the `dsmsalescrm` Vercel project, and `SUPABASE_URL` / `SUPABASE_ANON_KEY` are set for Production.

Pushing to `main` deploys to production automatically, so this gate is the last point at which either decision can still be made cheaply.

---

## Self-Review

**Spec coverage.** §2 scope and non-goals — nothing outside the listed files is built. §3 invariant — Task 2 Step 1 test 3 asserts it for Executive. §4 all-strings rule — Task 2 Step 1 test 5, plus the type. §5 architecture — Tasks 2, 4, 5 in that order; server-side-only credential in Task 4. §6 role content — Task 2 implementation and tests 1–4. §7 modules and all six required test cases — Tasks 1–4 (case 1 → Task 1; cases 2, 3, 4, 5 → Task 2; case 6 → Task 3). §8 failure handling — `mapGatewayError` in Task 4, card-local errors in Task 5, manual check 4 in Task 6. §9 access control and the production-profile verification — owner checkpoint before Task 1, plus `authorize()`. §10 provider and cost — Task 4 Step 1 and the tags/fallback in the handler. §11 governance — Task 6 Step 5. §12 verification — Task 6 Steps 1–2.

**Placeholder scan.** No TBD/TODO markers. Every code step carries the actual code. Task 6 Step 3 describes doc edits in prose rather than a diff because the surrounding file content is append-style and dated at execution time; the required content is stated explicitly.

**Type consistency.** `SummaryFacts` is defined once in Task 2 and imported unchanged by Tasks 3, 4, and 5. `buildSummaryFacts` takes a single `SummaryFactsInput` object in both its definition and its Task 5 call site. `generateAiSummary` is invoked as `generateAiSummary({ data: { accessToken, facts } })`, matching the `createServerFn().validator()` contract. `AiSummaryResult` is consumed in Task 5 via `result.ok`, matching the union in Task 4. `canUseAiSummary` takes one argument everywhere; the spec was updated to match, since a non-null `realProfile` already proves the account is active and the server re-checks `status` itself.

**Symbols verified against the repo, not assumed.** Three would have failed typecheck as first drafted and were corrected: `DateRange` is `{ from: Date; to: Date }`, so fixtures and the card build `Date` objects rather than ISO strings; `TargetsByMember` is exported from `@/lib/data/targets`, not `dashboard-selectors`; and `createServerFn` at the installed v1.168.40 exposes `.validator()`, with `.inputValidator()` marked `@deprecated`. `CURRENT_MONTH`, `CURRENT_YEAR`, and `NOW` are re-exported from `@/lib/domain` (originally `@/lib/app-time`), and the range shape mirrors `_app.dashboard.tsx:121`.
