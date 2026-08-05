# Production Runbook

What to do when the live app breaks. Written for a solo operator, no on-call rotation.

## The production stack

| Layer           | What it is                                                                           | Where to look                                               |
| --------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Frontend + SSR  | Vercel project `dsmsalescrm` (Hobby plan), team `hiulaukgalak`                       | https://vercel.com/hiulaukgalak/dsmsalescrm                 |
| Live URL        | https://dsmsalescrm.vercel.app                                                       | —                                                           |
| Database + Auth | Supabase project `qhtfixgbcpcitokeryxb`, region `ap-northeast-1` (Tokyo)             | https://supabase.com/dashboard/project/qhtfixgbcpcitokeryxb |
| Error reporting | Sentry (browser + server), enabled only when `VITE_SENTRY_DSN` / `SENTRY_DSN` is set | Sentry issues feed                                          |
| Source of truth | GitHub `Japrang311/dsmsalescrm`, branch `main`                                       | every push to `main` auto-deploys to production             |

The SSR function runs in `hnd1` (Tokyo), the same region as the database. That is set in
`vite.config.ts` (`nitro({ vercel: { functions: { regions: ["hnd1"] } } })`), not in the dashboard.

## Severity levels

- **SEV1 — app is down or data is wrong for everyone.** Blank page, 500 on every route, login broken,
  revenue numbers visibly incorrect. Act now, roll back first, diagnose after.
- **SEV2 — one feature is broken, the rest works.** Export fails, one form rejects valid input.
  Fix forward on a branch; no emergency rollback.
- **SEV3 — cosmetic or slow.** Layout glitch, a slow page. Normal backlog item.

## SEV1: roll back first

Rolling back is the fastest way to restore service, and it is safe — it re-points the live URL at a
build that already worked. It changes **nothing** in the database.

1. Open https://vercel.com/hiulaukgalak/dsmsalescrm/deployments
2. Find the most recent deployment marked **Ready** that was working (check the commit message and time).
3. Open it, then use the deployment menu → **Instant Rollback** (or **Promote to Production**).
4. Reload https://dsmsalescrm.vercel.app in a private window and confirm the app loads and login works.
5. Only then start diagnosing.

Rollback does **not** undo database migrations. If the bad deploy also applied a migration, see
"Database incidents" below before rolling back — an old app build against a new schema can fail in
different ways.

## SEV1: if rollback does not fix it

If the previous deployment is broken too, the cause is outside the frontend build. Check in this order:

1. **Supabase status** — https://status.supabase.com and the project dashboard. A paused or
   over-quota Free-plan project takes the whole app down.
2. **Supabase logs** — dashboard → Logs → API / Postgres. Look for `permission denied`, connection
   limits, or a flood of errors starting at a specific time.
3. **Vercel runtime logs** — project → Logs. Filter to 500s.
4. **Sentry** — grouped stack traces with the actual failing line.
5. **Vercel status** — https://www.vercel-status.com

## Database incidents

Database changes are the only truly dangerous class of change, because rollback cannot undo them.

- Never run `supabase db push`, `apply_migration`, or raw SQL against `qhtfixgbcpcitokeryxb` while
  an incident is open. Stabilise first.
- Recovery from a bad migration on the Free plan means restoring from a backup — that is a data-loss
  event measured in hours. Treat every migration to production as one-way.
- Before any future migration: apply it locally (`bunx supabase db reset`), run `bun run test`, and
  only then push. Migrations should ship on their own commit, never mixed with UI changes.

## Communication

Solo operation, so "communication" means telling the people who use the app:

1. Tell the sales team in the usual WhatsApp/Telegram group as soon as SEV1 is confirmed. One line is
   enough: what is broken, that it is being worked on, and whether they should stop entering data.
2. **Tell them explicitly whether to keep working.** If quotations or sales orders may be saving
   incorrectly, tell them to stop and write on paper — a wrong number in the database costs more than
   an hour of downtime.
3. Tell them again when it is fixed, and say whether anything they entered during the incident needs
   to be re-checked.

## After the incident

Write a short note in this file's changelog section below: what broke, what the cause was, what
prevented it from being caught. Then close the loop — if CI could have caught it, add the check to
`.github/workflows/ci.yml`.

## Preventing the next one

- Every change goes through a pull request, so Vercel builds a preview and CI runs lint + build.
  Preview deployments are protected by Vercel Authentication, so only you can open them.
- Check the preview URL before merging. Merging to `main` is the deploy.
- `bun run test` needs a local Supabase stack, so CI cannot run it. Run it locally before pushing
  anything that touches `supabase/` or `src/lib/data/`.

## Incident log

| Date | Severity | What happened               | Cause | Follow-up |
| ---- | -------- | --------------------------- | ----- | --------- |
| —    | —        | (no incidents recorded yet) | —     | —         |
