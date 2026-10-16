# Verifikasi Task 11 dan Gate B — Backlog Won tanpa SO

Tanggal: 17 Oktober 2026

Status: **Verified local + browser; Gate B siap review lokal**

Scope: Task 11 dan Gate B (AC12–14). Task 12 belum dimulai.

## Hasil

[Pasti] Pipeline dan Dashboard sekarang membaca snapshot server exact untuk
Closed Won Quotation yang belum memiliki Sales Order aktif. Total count dan value
tidak bergantung pada jumlah kartu yang sudah dimuat di browser.

[Pasti] Lineage memakai kontrak kanonik
`sales_orders.source_commercial_document_id`. Status dibedakan menjadi `missing`,
`linked`, dan `deleted_link`. Link ke SO yang soft-deleted menjadi exception review
terpisah dan tidak mengizinkan pembuatan SO kedua otomatis.

[Pasti] Loading, error, dan status link yang tidak ditemukan tidak dianggap pasti
unlinked. Tombol create hanya aktif untuk status server `missing`, sedangkan error
menampilkan status tidak tersedia.

[Pasti] Backlog tidak masuk ke forecast. Browser test merekonsiliasi pengurangan
backlog setelah create/link SO dan memastikan nilai forecast tidak berubah akibat
link tersebut.

## Acceptance yang diverifikasi

| Acceptance | Bukti lokal |
| --- | --- |
| AC12 | Aggregate forecast Task 10 tetap mengecualikan Closed Won, Closed Lost, superseded/deleted, outside-period, dan undated; regression suite lulus |
| AC13 | Forecast aggregate, drilldown, expected-date transition/audit, role scope, dan export reconciliation Task 09–10 tetap lulus dalam full suite dan browser suite |
| AC14 | Backlog exact server-side; unknown/loading/error tidak diklaim unlinked; create/link menghapus exception setelah refresh; deleted link dipisahkan |
| Pagination | `totals` dan `page.totalCount` exact untuk seluruh scope walau page dibatasi; DB test membuktikan total tidak berubah antar-page |
| RLS/direct API | Sales dipaksa ke owner sendiri, Manager dapat memilih owner, dan anonymous RPC ditolak |
| Link lifecycle | missing → linked, linked → deleted_link saat soft-delete, lalu kembali linked setelah restore |

## Bukti pengujian

1. TDD RED:
   - DB contract test awal menghasilkan lima kegagalan `PGRST202` karena
     `crm_won_without_so_backlog` belum ada; anonymous direct-call denial sudah
     lulus.
   - Adapter test awal gagal `Cannot find module ../../src/lib/data/won-backlog`.
2. Targeted setelah implementasi:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test supabase/tests/crm-won-without-so-backlog.test.ts tests/precision-ui.test.tsx`
   - **13 pass, 0 fail, 57 assertions**.
3. Full unit/database suite:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **762 pass, 0 fail, 2.941 assertions, 104 files**.
   - Run pertama tanpa override container menghasilkan satu environment failure
     karena test menunjuk container default yang berhenti; source yang sama lulus
     penuh setelah diarahkan eksplisit ke database disposable Gate A/B.
4. Browser targeted Chromium:
   - `bunx playwright test e2e/browser-flows.spec.ts --grep 'manually link|creating an SO'`
   - **2 pass**.
5. Browser suite penuh Chromium:
   - `bunx playwright test`
   - **16 pass (2,6 menit)**; console/page issue collector bersih pada flow Task 11.
6. Static/build:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
   - `git diff --check` — lulus.
7. Database quality:
   - `bunx supabase@2.109.1 db reset --local` pada project disposable — lulus
     sampai migration `20261017060000`.
   - `bunx supabase@2.109.1 db advisors --local` — tidak menemukan issue.
   - `bunx supabase@2.109.1 db lint --local` — RPC Task 11 bersih; tiga error
     static-analysis pada temp table fungsi lama tetap ada dan tidak diperkenalkan
     slice ini.
   - `bun scripts/check-migration-parity.ts` — **blocked** karena
     `SUPABASE_DB_URL` tidak tersedia; parity remote tidak diklaim.

## Fresh database proof

Seluruh migration direplay pada project disposable `DSM_GATE_A_20261016` dengan
API `http://127.0.0.1:54321` dan container
`supabase_db_DSM_GATE_A_20261016`. Targeted DB, full suite, dan browser test
memakai endpoint lokal tersebut. Tidak ada database remote/produksi yang diubah.

## Batas verifikasi

- **Source-inspected:** kontrak RPC, adapter validation/reconciliation, query-key
  invalidation, Pipeline consumer, Dashboard consumer, serta pemisahan forecast.
- **Tested-local:** fresh migration replay, exact aggregate/pagination, RLS role
  scope, direct API denial, soft-delete/restore, create/link reconciliation,
  targeted/full suite, lint, typecheck, build, advisors, dan migration list.
- **Browser-verified:** create SO, manual link dari dua entry point, reload,
  backlog decrement, Dashboard reconciliation, forecast unchanged, dan suite
  Chromium penuh.
- **Blocked:** production migration parity membutuhkan `SUPABASE_DB_URL`; inventory
  backup/restore live Task 18 dan tindakan remote belum diizinkan.
- **Unverified:** database produksi, deployment, authenticated production smoke,
  backup produksi, browser selain Chromium, dan layout mobile khusus Task 11.

## File Task 11

- `supabase/migrations/20261017060000_add_crm_won_without_so_backlog.sql`
- `supabase/tests/crm-won-without-so-backlog.test.ts`
- `src/lib/data/won-backlog.ts`
- `src/routes/_app.pipeline.tsx`
- `src/routes/_app.dashboard.tsx`
- `e2e/browser-flows.spec.ts` (bukti browser)

Tidak ada commit, push, deployment, atau migration remote pada slice ini.
