# Verifikasi Task 14 — Snooze dan feedback operasional

Tanggal: 17 Oktober 2026

Status: **Verified local + browser; Task 15 belum dimulai**

Scope: Task 14 dan AC17 sesuai D06. Slice ini menambahkan persistence snooze
serta feedback relevan/tidak relevan pada sinyal yang sedang aktif. Slice tidak
mengubah threshold D06, stage quotation, status client, atau membuat fitur
repeat-order.

## Hasil

[Pasti] Sales dapat menunda rule pada quotation miliknya sampai tanggal inklusif
dan wajib memberi alasan. Sinyal muncul lagi sehari setelah batas atau lebih awal
ketika stage transition valid atau follow-up ber-result menjadi progress material
baru.

[Pasti] Feedback `relevant`/`not_relevant`, actor, owner snapshot, alasan, dan rule
version `d06-v1` tersimpan append-only. Feedback tidak menyembunyikan sinyal dan
ditampilkan kembali pada row sinyal.

[Pasti] Snooze ditampilkan sebagai state terpisah melalui `snoozedCount`; count
sinyal aktif dan pagination hanya memuat signal yang tidak sedang snoozed.
Transfer ownership membuat snooze owner lama tidak berlaku bagi owner baru.

[Pasti] Command tidak mengubah stage quotation atau status client. Direct table
write, anonymous, Executive, Sales cross-owner, account inactive, dan forged
action untuk rule yang belum aktif ditolak. Manager/Super Admin tetap mengikuti
izin domain company-wide existing.

## Acceptance yang diverifikasi

| Acceptance Task 14 / AC17 | Bukti lokal/browser |
| --- | --- |
| Actor/reason/until tersimpan | Receipt RPC dan row append-only direkonsiliasi |
| Tidak mengubah status bisnis | Stage quotation dan status client sama sebelum/sesudah command |
| Boundary inklusif | Hilang pada `snoozed_until`, muncul pada hari berikutnya |
| Event material baru | Follow-up valid setelah snooze memunculkan signal sebelum expiry |
| Feedback tidak menyembunyikan | Latest feedback tampil, signal tetap aktif |
| Owner scoped | RLS read, Sales cross-owner, transfer owner, dan Manager diuji |
| Role/account boundary | Anonymous, Executive, dan Sales inactive ditolak |
| Retry/concurrency | Request replay identik; dua request sama concurrent menghasilkan satu row |
| Rollback | Forced insert failure meninggalkan nol action row |
| Direct/manipulated bypass | Direct insert dan command untuk rule yang tidak aktif ditolak |
| State browser berbeda | Active row hilang, snoozed count naik, reload stabil, lalu resurfacing tampil |

AC17 selesai untuk Task 14. AC18–20 tetap scope Task 15–17 dan belum dimulai.

## Bukti pengujian

1. TDD database:
   - RED awal: **0 pass, 6 fail** karena RPC/table belum ada (`PGRST202`).
   - RED hardening: forged `won_without_so` belum ditolak.
   - Final:
     `SUPABASE_URL=http://127.0.0.1:54321 bun test supabase/tests/crm-action-signal-actions.test.ts`
     — **9 pass, 0 fail, 49 assertions**.
   - Mencakup RLS/direct API, role/ownership, account inactive, fake-clock boundary,
     ownership transfer, retry, concurrency, rollback, forged rule, dan material event.
2. Adapter/UI targeted:
   - `bun test src/lib/data/action-signals.test.ts tests/precision-ui.test.tsx`
     — **16 pass, 0 fail, 55 assertions** sebelum final full suite.
   - Snapshot schema memvalidasi snoozed count dan feedback metadata; receipt command
     divalidasi sebelum dikembalikan ke UI.
3. Full unit/database suite final:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **793 pass, 0 fail, 3.106 assertions, 107 files**.
4. Static/build final:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
   - `git diff --check` — lulus.
5. Browser:
   - Targeted Chromium setelah hardening: snooze → reload → material follow-up →
     resurface → feedback → reload → database reconciliation — **1 pass**.
   - Full Chromium run serial tanpa retry: **19 pass** dalam 3,3 menit. Run ini
     dilakukan sebelum hardening forged-rule terakhir; flow Task 14 diuji ulang
     sesudah hardening dan lulus.
   - Run CI paralel sebelumnya selesai dengan **18 pass + 1 flaky yang lulus saat
     retry** pada flow action-queue lama akibat satu HTTP 400 auth/resource. Isolasi
     serial flow lama kemudian **3/3 pass**; percobaan parallel repeat sengaja tidak
     dipakai sebagai bukti karena membuat kontensi auth lokal.
6. Database checks:
   - Supabase security advisor lokal — **No issues found**.
   - DB lint hanya melaporkan tiga false-positive temp-table historis pada fungsi
     import/migration lama; tidak ada temuan baru pada dua migration Task 14.

## Database lokal

Semua write test memakai API loopback `http://127.0.0.1:54321`, port Postgres
lokal `54322`, dan container `supabase_db_DSM_GATE_A_20261016`. Migration
`20261017094656` dan `20261017100256` hanya diterapkan ke database lokal melalui
`supabase db push --local`. Database tidak di-reset dan production tidak dibaca
atau diubah.

## Batas verifikasi

- **Source-inspected:** kontrak append-only, SECURITY DEFINER search path kosong,
  grant/revoke, RLS, idempotency lock, material-event comparison, pagination/count,
  rule-active trigger, adapter schema, invalidation, dan state UI.
- **Tested-local:** RLS/direct bypass, role/account/owner, forged rule, retry,
  concurrency, rollback, boundary tanggal, ownership transfer, full 793-test suite,
  lint, typecheck, build, advisor dan DB lint.
- **Browser-verified:** snooze, persist/reload, count snoozed, material resurfacing,
  feedback persist/reload, dan reconciliation ke database.
- **Blocked:** migration parity produksi, deployment, remote smoke, serta Task 18
  live backup/restore tetap di luar otorisasi.
- **Unverified:** fresh reset seluruh migration pada slice ini, kondisi produksi,
  serta cadence/repeat-order Task 15–17.

## File Task 14

- `supabase/migrations/20261017094656_crm_signal_snooze_feedback.sql`
- `supabase/migrations/20261017100256_harden_crm_signal_action_validation.sql`
- `supabase/tests/crm-action-signal-actions.test.ts`
- `supabase/tests/crm-action-signals.test.ts`
- `src/lib/data/action-signals.ts`
- `src/lib/data/action-signals.test.ts`
- `src/components/tasks/ActionSignalActionDialog.tsx`
- `src/components/tasks/ActionSignalList.tsx`
- `tests/precision-ui.test.tsx`
- `e2e/browser-flows.spec.ts`
- `tasks/crm-reliability-and-growth-todo.md`

Task 13 sudah di-commit dan push sebagai `ac6f6c2`. Perubahan Task 14 di-commit
setelah verifikasi dalam commit Task 14; hash final dicatat pada handoff Git.
Tidak ada deployment, migration remote, perubahan database produksi, atau pesan
eksternal.
