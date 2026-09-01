# AI Dashboard Summary — Live Verification (spec §12)

Date started: 2026-09-01
Production: https://dsmsalescrm.vercel.app
Feature: "Ringkasan AI" card on `/dashboard`, button "Buat Ringkasan".
Allow list (`src/lib/ai/access.ts`): `adhitya@dutasolusimetalindo.com` (manager),
`triyanto@dutasolusimetalindo.com` (executive).

## Prerequisites (state as of 2026-09-01)

- [x] `SUPABASE_URL` / `SUPABASE_ANON_KEY` set as Production secrets on Vercel
      `dsmsalescrm` (verified via `vercel env ls production`).
- [ ] AI Gateway enabled for the project **and** has non-zero credit
      (Hobby plan). NOT yet confirmed — this check will confirm it: a working
      generation proves it; a `402` "Kuota AI bulan ini sudah habis." means
      credit is exhausted / not provisioned.

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

### Check 2 — Executive account (`triyanto@dutasolusimetalindo.com`) — PHASE 12 GUARD

- [ ] The card is visible.
- [ ] "Buat Ringkasan" produces a paragraph.
- [ ] The paragraph names **NO** individual sales person.
- [ ] The paragraph mentions **NO** individual task.
- Output captured:
- Reviewer sign-off (name / date):

> This is the check that protects an accepted Phase 12 rule. Record the exact
> output text and an explicit human sign-off that it contains no sales names.

### Check 3 — Non-allow-listed account (any sales account)

- [ ] The "Ringkasan AI" card does **not** appear on the Dashboard at all.
- [ ] (Optional, defence-in-depth) Replaying the POST to the server function
      with this account's token returns `{"ok":false,"message":"Fitur ini
      tidak tersedia untuk akun Anda."}`.

### Check 4 — Forced failure path

Pick one:
- In browser DevTools, set the network to **Offline**, then click
  "Buat Ringkasan".
- Or exhaust/again-disable AI Gateway credit and click.

- [ ] An error message renders **inside the card** (red text).
- [ ] Every other Dashboard widget (KPI row, charts, tables) still works.
- Error text shown:

## Outcome

| Check | Result | Notes |
|---|---|---|
| 1 Manager names present |  |  |
| 2 Executive names absent |  |  |
| 3 Card hidden for others |  |  |
| 4 Error contained to card |  |  |

Management approval for sending revenue / client names / (manager) per-sales
performance to a third-party model provider (spec §11): _______ (still
outstanding as of 2026-09-01).
