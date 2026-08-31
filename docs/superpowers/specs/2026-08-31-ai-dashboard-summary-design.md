# AI Dashboard Summary — Design

Status: Accepted
Date: 2026-08-31
Author: Adhitya Wirambara (with Claude Code)

## 1. Problem

Manager and Executive read the Dashboard as a grid of numbers. Turning those
numbers into "what actually happened and what needs attention" is manual work
repeated every week. This feature writes that paragraph automatically, in
Indonesian, on demand.

This is a limited pilot for two named accounts, not a company-wide feature.

## 2. Scope

In scope: one Dashboard card, one button, one generated paragraph, per-role
content, two allow-listed accounts.

Out of scope, deliberately:

| Not building | Reason |
| --- | --- |
| Chatbot / free-form Q&A | Different problem; far higher cost and accuracy burden. |
| Saving summary history | Needs a table and a production migration. Wait for proven demand. |
| Scheduled weekly generation | Needs cron plus an edge function. Prove the button first. |
| Summaries for Sales / Super Admin | Get two roles right, then copy the pattern. |
| Streaming (progressive text) | A 2–4 second spinner is acceptable. Trivial to add later. |
| AI computing any number | See §4. This is a permanent rule, not a phase-one shortcut. |

## 3. Core invariant

> **The summary may only discuss data the signed-in role can already reach in
> the app under RLS, and must honour the Executive aggregate-only rule.**

The AI never surfaces information the reader could not already obtain by
navigating the app. This keeps the privacy story simple, keeps the Phase 12
role rules intact, and is directly testable (§7).

An earlier draft phrased this as "only what that role sees on its own
Dashboard". That was too narrow: Dashboard card placement is a layout choice,
not an authorization rule. `commercial_documents_select` grants `manager`
read access to every commercial document, and `_app.pipeline.tsx:347` already
shows Manager the full pipeline. So Manager may be told about the quotation
funnel even though `ExecutiveCards.tsx` renders that card only for Executive.

The Executive restrictions in §6 are different in kind — they come from
accepted Phase 12 decisions (aggregate-only reporting, `includeTaskDetail =
false` in Reports), not from layout. They are binding.

## 4. Second invariant: code computes, AI only writes sentences

Language models are unreliable at arithmetic and will produce confident wrong
numbers. Therefore:

- Every figure is computed by existing selectors in `src/lib/data/`.
- Every figure is formatted to its final display string in TypeScript
  (`"Rp 1,2 M"`, `"-18%"`, `"7 task"`) before the AI sees it.
- The AI receives no raw rows, no arrays of records, and is never asked to
  add, subtract, rank, or compare.
- The prompt instructs the model to reuse the provided strings verbatim and
  to omit anything it was not given.

## 5. Architecture

```
Browser (session already RLS-scoped to the signed-in user)
  │
  ├─ existing selectors compute the numbers
  │    Shared:    monthlyRevenueTrend, ytdRevenue, ytdTargetValue,
  │               revenueByTax, topCustomersInRange, getRiskAlertCounts,
  │               getPipelineMetrics (funnel + forecast)
  │    Manager
  │    only:      salesPerformanceInRange, targetPerSales,
  │               filterManagerTeamExceptions, taskCounts
  │
  ├─ summary-facts.ts formats them into a small role-specific facts object
  │
  └─ POST facts to the server function
        │
Server (first server-side code in this app)
  ├─ verify caller has a valid Supabase session
  ├─ verify caller's email is on the allow list AND profile is active
  ├─ call Vercel AI Gateway with facts + role-specific instructions
  └─ return plain text
        │
Browser renders the paragraph, a provenance line, and a Copy button
```

No database schema change. No migration. No RLS change.

### Why the browser computes and the server only narrates

The browser already holds correct, RLS-filtered data. Recomputing it
server-side would duplicate every selector and create a second place for role
rules to drift. The server's job is limited to holding the credential and
enforcing the allow list.

A caller could send fabricated numbers, but only to their own screen — no
other user's data is reachable and nothing is persisted. The server-side
check exists to prevent cost abuse and unauthorized access, not to validate
arithmetic.

## 6. Role-specific content

Manager receives every topic. Executive receives everything except the two
categories that accepted Phase 12 rules withhold from that role.

| Topic | Manager (Adhitya) | Executive (Triyanto) |
| --- | --- | --- |
| Revenue vs target | Yes | Yes |
| Revenue trend, PPN / Non-PPN split | Yes | Yes |
| Top customers | Yes | Yes |
| Stuck / at-risk deals | Yes | Yes (`RiskAlertsCard`) |
| Quotation funnel, forecast vs achievement | Yes | Yes (`ExecutiveCards.tsx`) |
| Per-sales performance, by name | Yes | **No** — aggregate-only reporting |
| Escalated tasks | Yes, owned by sales (`filterManagerTeamExceptions`) | **No** — Reports sets `includeTaskDetail = false` |

Manager gets the quotation funnel and forecast even though those cards are
not on the Manager Dashboard; the data is already available to Manager via
RLS and the Pipeline page (see §3).

Executive summaries name clients but never individual sales people, and never
mention individual tasks.

## 7. Modules and tests

| File | Responsibility | Tested |
| --- | --- | --- |
| `src/lib/ai/access.ts` | Allow-listed emails; `canUseAiSummary(email, status)` | Yes |
| `src/lib/ai/summary-facts.ts` | Dashboard data → role-specific formatted facts | Yes |
| `src/lib/ai/summary-prompt.ts` | Facts → prompt text | Yes |
| `src/server/ai-summary.ts` | Auth + allow-list gate, Gateway call, error mapping | Gate logic tested |
| `src/components/dashboard/AiSummaryCard.tsx` | Card, button, states, Copy | Manual |

Required test cases:

1. `canUseAiSummary` returns true only for the two allow-listed emails, is
   case-insensitive, and returns false for an inactive profile.
2. Executive facts never contain any sales person's name or id — asserted
   against a fixture where sales names are present in the input.
3. Executive facts contain no task-level detail.
4. Manager facts include per-sales entries and escalated tasks owned by sales
   only (never tasks owned by managers).
5. Every numeric field in the facts object is a pre-formatted string, not a
   number — enforced by type and asserted at runtime.
6. Prompt builder includes the "reuse these strings verbatim, invent nothing"
   instruction.

## 8. Failure handling

The Dashboard must remain fully usable when the AI feature fails.

| Condition | Behaviour |
| --- | --- |
| HTTP 402 (budget exhausted) | "Kuota AI bulan ini sudah habis." |
| HTTP 429 (rate limited) | "Terlalu sering. Coba lagi sebentar." |
| HTTP 503 / timeout | "Layanan AI sedang bermasalah. Coba lagi nanti." |
| Not on allow list | Card is not rendered at all; server also rejects. |
| Any other error | Generic message; error captured via existing `error-capture.ts`. |

Errors render inside the card only. They never block or unmount other
Dashboard widgets.

## 9. Access control

Two accounts, held in `src/lib/ai/access.ts` as a single exported constant
used by both the UI (to decide whether to render the card) and the server (to
authorize the call). One source of truth.

- Adhitya — `adhitya@dutasolusimetalindo.com`, role `manager`. Confirmed from
  `QUOTATION_PDF_DEFAULTS` in `src/lib/export-quotation-pdf.ts`.
- Triyanto — `triyanto@dutasolusimetalindo.com`, role `executive`. Confirmed
  by the owner on 2026-08-31.

Both addresses are compared lower-cased. Neither was inferred from the
`namadepan@dutasolusimetalindo.com` pattern; a wrong entry here fails
silently and is hard to diagnose, so both were confirmed explicitly.

First implementation step: verify both addresses match a row in production
`public.profiles` with the expected role and `status = 'active'`. If either
does not match, stop and report rather than adjusting the list to fit.

Hiding the card in the browser is convenience, not security. The server-side
check is the boundary.

## 10. Provider and cost

Vercel AI Gateway via the `ai` package (v6), using plain `"provider/model"`
strings.

- Authentication uses Vercel OIDC (`VERCEL_OIDC_TOKEN`), provisioned by
  `vercel env pull`. No manual API key is stored.
- Every Vercel team receives 5 USD of Gateway credit per 30 days; tokens are
  billed at provider list price with no markup. Expected pilot usage — two
  accounts, on-demand only — is very likely to stay inside the free credit.
- Requests carry `user` (for per-user rate limiting) and
  `tags: ["feature:dashboard-summary"]` for cost attribution.
- A fallback model is configured so a single provider outage degrades to a
  different model rather than an error.

The model slug is not fixed in this document. It will be chosen at
implementation time from `gateway.getAvailableModels()`, because slugs change.

## 11. Data governance decision

Generating a summary sends DSM business figures — revenue values, top client
names, and (for the Manager variant) individual sales performance — to a
third-party model provider through Vercel AI Gateway.

The owner reviewed this on 2026-08-31 and decided to send sales and client
names as-is, rather than pseudonymising them. Recorded here so the decision is
traceable if management asks later.

AI Gateway does not log prompt or completion content by default. Content
logging must stay off.

## 12. Verification

`bun run verify:app` (lint, typecheck, tests, build) must pass. No
`verify:db` run is needed because there is no schema change.

Manual check before release: sign in as each allow-listed account, generate a
summary, and confirm the Executive output names no sales person.
