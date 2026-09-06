# AI Dashboard Summary — Live Verification (spec §12)

Date started: 2026-09-01
Production: https://dsmsalescrm.vercel.app
Feature: "Ringkasan AI" card on `/dashboard`, button "Buat Ringkasan".
Allow list (`src/lib/ai/access.ts`): `adhitya@dutasolusimetalindo.com`
(manager) — **one account only** since 2026-09-01. Triyanto (executive) was
removed; he is now a good negative test.

## Prerequisites (state as of 2026-09-01)

- [x] `SUPABASE_URL` / `SUPABASE_ANON_KEY` set as Production secrets on Vercel
      `dsmsalescrm` (verified via `vercel env ls production`).
- [x] Credit card added to the Vercel team `HIULAUKGALAK` (owner, 2026-09-01)
      — unblocks the `customer_verification_required` 403 from the first
      attempt. A working generation confirms AI Gateway is live.

## How to run

1. Claude is tailing production logs live:
   `vercel logs https://dsmsalescrm.vercel.app --follow --json`
   (background task `b47sgh3ak`). Keep it running for the whole session.
2. Sign in to production in your own browser as each account below.
3. Open `/dashboard`, find the "Ringkasan AI" card, click "Buat Ringkasan".
4. Paste the rendered paragraph(s) back to Claude, or screenshot the card.
   Claude cross-checks against the log line for that request.

## Checks

### Check 1 — Manager account (`adhitya@dutasolusimetalindo.com`)

- [ ] The "Ringkasan AI" card is visible on the Dashboard.
- [ ] "Buat Ringkasan" produces an Indonesian paragraph.
- [ ] The paragraph **names individual sales people** (per-sales performance).
- Output captured:
- Log line (status / model / error):

### Check 2 — Non-allow-listed accounts (Triyanto + any sales account)

- [ ] Signed in as `triyanto@dutasolusimetalindo.com` (executive) — the
      "Ringkasan AI" card does **not** appear on the Dashboard at all.
- [ ] Signed in as any sales account — the card does **not** appear.
- [ ] (Optional, defence-in-depth) Replaying the POST to the server function
      with a non-allowed token returns `{"ok":false,"message":"Fitur ini
      tidak tersedia untuk akun Anda."}`.

### Check 3 — Forced failure path

Pick one:
- In browser DevTools, set the network to **Offline**, then click
  "Buat Ringkasan".
- Or exhaust/again-disable AI Gateway credit and click.

- [ ] An error message renders **inside the card** (red text).
- [ ] Every other Dashboard widget (KPI row, charts, tables) still works.
- Error text shown:

## 2026-09-01 first attempt — BLOCKED on Vercel billing

Four "Buat Ringkasan" clicks at ~05:02–05:04 UTC (domain `www.dsmsales.app`)
all failed the same way. Server logs:

```
AI summary failed GatewayInternalServerError: AI Gateway requires a valid
credit card on file to service requests. ... statusCode: 403,
type: 'customer_verification_required'
```

What this proves:

- The server function is reachable, `authorize()` passes for the caller, and
  OIDC auth to Vercel AI Gateway works — the request reached the Gateway.
- The Gateway refuses **all** requests (even the free credits) until the
  Vercel team **HIULAUKGALAK** has a credit card on file.
  Add one at: Vercel dashboard → team HIULAUKGALAK → AI → "Add credit card".
- The failure is contained to the card (rest of Dashboard unaffected), but
  the error message shown is the generic
  "Ringkasan gagal dibuat. Coba lagi nanti." — the `GatewayInternalServerError`
  (403, wrapping the APICallError as `.cause`) does not match
  `APICallError.isInstance`, so `mapGatewayError` never sees the status code.
  Minor follow-up: unwrap `error.cause` / handle 403 in
  `src/lib/ai/summary-server.ts`.

Card was added on 2026-09-01. Re-run pending.

## Outcome

| Check | Result | Notes |
|---|---|---|
| 1 Adhitya: card visible + paragraph names sales |  |  |
| 2 Triyanto / sales: card hidden |  |  |
| 3 Forced failure contained to card |  |  |

Management approval for sending revenue / client names / per-sales
performance to a third-party model provider (spec §11): _______ (still
outstanding as of 2026-09-01).
