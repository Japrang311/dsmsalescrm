# Verifikasi Task 15 — Cadence repeat-order

Tanggal: 17 Oktober 2026

Status: **Verified local; UI/browser Task 16 belum dimulai**

Scope: Task 15, D05, serta bagian fondasi AC18–19. Slice ini menambahkan pure
rule, aggregate RPC, adapter tervalidasi, dan index kandidat repeat-order. Slice
tidak menambah UI, mengecualikan client secara persisten, membuat Task, mengubah
status client, mengirim pesan, atau menjalankan migration remote.

## Hasil

[Pasti] Rule `d05-v1` menghitung cadence dari minimal empat tanggal order berbeda
dalam 365 tanggal kalender inklusif (`asOfDate - 364` sampai `asOfDate`). Beberapa
SO pada tanggal yang sama menjadi satu event. Median menggunakan selisih hari
kalender dan status `overdue` hanya muncul bila hari sejak order terakhir **lebih
besar** dari `max(1,5 × median, median + 7)`.

[Pasti] Aggregate hanya memakai SO aktif, non-FOC, dan `total_value > 0`. SO
soft-deleted, FOC, nilai nol, serta tanggal sesudah `asOfDate` dikeluarkan. Source
flow tidak membatasi kandidat. Fixture database dan pure helper menghasilkan
angka, state, threshold, serta alasan yang sama persis.

[Pasti] Kurang dari empat tanggal dalam window tidak pernah memperoleh label
risiko. Client dengan histori sah yang seluruhnya lebih tua dari window tetap
memiliki tanggal order terakhir faktual, tetapi state-nya `data_insufficient`
dengan alasan `Data belum cukup`.

[Pasti] `historyCoverage` diberi label `full_window` bila bukti client/order paling
awal mencapai awal window; selain itu `partial_window`. Hasil juga membawa
`historyObservedFrom`, awal/akhir window, sample count, interval count, median,
hari sejak order, threshold, overdue days, reason, dan rule version.

[Pasti] Visibility mengikuti owner client **saat ini**. SO historis tetap menyimpan
owner asalnya dan seluruh tanggal sah untuk client yang sudah ditransfer tetap
masuk perhitungan. Sales tidak dapat memaksa `p_owner_id` owner lain; Manager/Super
Admin dapat memfilter owner; Executive hanya menerima aggregate tanpa row detail.
Nomor SO tidak pernah masuk payload.

[Pasti] Lost dan Dormant dikeluarkan dari scope default, tetapi dapat ditinjau
melalui filter status eksplisit. RPC read-only tidak membuat Task atau mengubah
status client.

## Acceptance yang diverifikasi

| Acceptance Task 15 | Bukti lokal |
| --- | --- |
| Distinct business dates | Duplicate SO pada hari sama menghasilkan satu event |
| Window D05 | 365 tanggal inklusif; boundary lama dan future date diuji |
| Median/threshold | Outlier, quarterly seasonal, threshold bulat dan pecahan diuji |
| Minimum sample | 0 dan 3 sample tetap `data_insufficient`, tanpa risk label |
| Eligibility SO | Active, non-FOC, positive value masuk; FOC/zero/deleted/future keluar |
| Source flow | RFQ/New Product dan Existing/Repeat Order sama-sama dihitung |
| Ownership transfer | Current client owner menentukan akses; owner SO historis tidak berubah |
| History coverage | Full/partial window dan observed-from dikembalikan eksplisit |
| Role/data isolation | Sales manipulated owner filter, anonymous, null-role, Manager, Executive diuji |
| Reconciliation | Pure helper dan RPC sama untuk sample, median, age, threshold, state, reason |
| No mass backfill | Tidak ada insert/update Task, status client, atau data historis |

AC18 selesai untuk Task 15. Fondasi AC19 terkait minimum sample, alasan yang dapat
dihitung ulang, dan non-leakage selesai; AC19 keseluruhan tetap terbuka sampai
consumer UI Task 16 diverifikasi.

## Bukti pengujian

1. TDD:
   - RED pure helper: import gagal karena module belum ada.
   - RED database: **0 pass, 6 fail**, seluruhnya `PGRST202` karena RPC belum ada.
   - Targeted final setelah fresh reset:
     `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test src/lib/repeat-order-cadence.test.ts supabase/tests/crm-repeat-order-cadence.test.ts`
     — **15 pass, 0 fail, 40 assertions**.
2. Full regression final:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **808 pass, 0 fail, 3.146 assertions, 109 files**.
   - Satu percobaan sebelumnya menghasilkan 806 pass + 1 harness failure karena
     env container tidak diset dan test lama memilih container stop; pengulangan
     dengan container Gate A eksplisit lulus 807/807, lalu run final lulus 808/808.
3. Static/build:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
4. Database:
   - Fresh reset seluruh migration melalui workdir test terisolasi
     `/tmp/dsm-gate-a.heGRvH` — migration `20261017143628` dan seed lulus.
   - Supabase security/performance advisor lokal — **No issues found**.
   - DB lint hanya melaporkan tiga false-positive temp-table historis pada fungsi
     import/migration lama; tidak ada finding pada RPC/index Task 15.

## Database lokal

Semua write fixture memakai API loopback `http://127.0.0.1:54321`, Postgres
loopback port `54322`, dan container `supabase_db_DSM_GATE_A_20261016`. Dua
percobaan reset dari workdir repository default ditolak sebelum reset karena CLI
mencoba project-id lama pada port yang sudah dipakai. Reset yang menjadi bukti
dijalankan dari workdir instance Gate A yang benar. Tidak ada koneksi atau
perubahan database produksi.

## Batas verifikasi

- **Source-inspected:** rule D05, eligibility SO, exact aggregate sebelum
  pagination, current-client ownership, empty `search_path`, grant/revoke,
  aggregate-only Executive, adapter invariant, dan tidak adanya mutation/backfill.
- **Tested-local:** pure rule, DB reconciliation, same-day/FOC/zero/deleted/future,
  outlier/seasonal, history terbatas, ownership transfer, role/data isolation,
  pagination, fresh migration chain, full regression, lint, typecheck, build,
  advisor, serta DB lint.
- **Browser-verified:** tidak relevan untuk Task 15 karena belum ada perubahan UI.
- **Mutation rollback/concurrency/retry:** tidak relevan; RPC `stable` dan read-only,
  tanpa command write atau idempotency ledger.
- **Blocked:** migration parity produksi, migration remote, deployment, remote
  smoke, dan Task 18 live backup/restore tetap di luar otorisasi.
- **Unverified:** kondisi/performa produksi, consumer Tasks/Client UI, browser,
  export rule version, follow-up reuse, feedback/exclusion musiman-proyek, dan
  keputusan pilot Task 16–17.

## File Task 15

- `src/lib/repeat-order-cadence.ts`
- `src/lib/repeat-order-cadence.test.ts`
- `src/lib/data/repeat-order-cadence.ts`
- `supabase/migrations/20261017143628_add_crm_repeat_order_cadence.sql`
- `supabase/tests/crm-repeat-order-cadence.test.ts`
- `tasks/crm-reliability-and-growth-todo.md`
- `docs/reports/2026-10-17-crm-task-15-verification.md`

Status commit/push diverifikasi terpisah dari laporan pengujian ini. Tidak ada
deployment, migration remote, perubahan database produksi, atau pesan eksternal.
