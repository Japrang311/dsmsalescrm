# Verifikasi Task 16 — Repeat signal pada antrean dan client

Tanggal: 17 Oktober 2026

Status: **Verified local + browser; Gate C belum siap karena Task 17 belum dijalankan**

Scope: Task 16 serta penutupan AC19–20. Slice ini mengonsumsi fondasi cadence
Task 15 pada Tasks dan Client Detail, menambahkan follow-up yang memakai ulang
Task aktif, serta menyimpan feedback pilot D05. Slice tidak mengubah threshold
D05, membuat Task otomatis saat halaman dibuka, mengubah status client, atau
menjalankan migration/deploy remote.

## Hasil

[Pasti] Tasks menampilkan ringkasan dan daftar kandidat repeat-order dari aggregate
server yang sama. Count pada UI direkonsiliasi terhadap `totals`, pagination tetap
berbasis offset terbatas, dan state loading, error, aggregate-only, overdue,
on-cadence, serta `data_insufficient` dibedakan.

[Pasti] Client Detail mengambil tepat satu `clientId`; Sales tidak dapat membuka
summary client milik owner lain. Ringkasan memperlihatkan tanggal order terakhir,
jumlah sample, median interval, usia sejak order, threshold, alasan, coverage
histori, dan rule version `d05-v1`. Client kurang dari empat tanggal order tidak
mendapat label risiko.

[Pasti] Tombol follow-up tidak membuat Task otomatis. Bila hanya ada satu Task
client yang masih aktif, dialog memilih Task tersebut untuk diprogress. Bila
pilihan aktif ambigu, pengguna tetap harus memilih; Task baru hanya dibuat lewat
pilihan eksplisit yang sudah ada.

[Pasti] Feedback `relevant`/`not_relevant`, actor, owner snapshot, alasan, tanggal
evaluasi, dan rule version tersimpan append-only melalui command idempotent.
Feedback hanya diterima untuk sinyal overdue yang masih sah, ditampilkan kembali
di antrean dan Client Detail, serta tidak mengubah status client.

[Pasti] Command feedback menolak anonymous, Executive, Sales lintas owner,
client non-overdue, payload retry yang berubah, dan direct Data API insert.
Concurrency/retry menghasilkan satu receipt yang sama; forced persistence failure
meninggalkan nol row.

## Acceptance yang diverifikasi

| Acceptance Task 16 / AC19–20 | Bukti lokal/browser                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Alasan dapat dihitung ulang  | Snapshot RPC dan pure D05 helper direkonsiliasi dari tanggal SO sah                              |
| Minimum sample               | Tiga tanggal order tampil `Data belum cukup`, tanpa label risiko                                 |
| Non-leakage                  | Exact `clientId` filter dan route Sales-other-owner menghasilkan nol detail/not found            |
| Count konsisten              | Attribute count UI sama dengan aggregate server; halaman tidak menghitung ulang total            |
| Client dapat dibuka          | Link antrean membuka Client Detail dan summary state yang sama                                   |
| Follow-up reuse              | Satu Task aktif dipilih dan diprogress; jumlah Task aktif tidak bertambah                        |
| Feedback pilot               | Relevant/not relevant, actor, reason, dan `d05-v1` tersimpan dan tampil kembali                  |
| Tidak ada status otomatis    | Status client tidak ditulis oleh read RPC maupun command feedback                                |
| Mutation safety              | RLS/direct bypass, role/owner, idempotency, concurrency, retry, payload mismatch, rollback diuji |
| Executive boundary           | Aggregate terlihat; detail client dan action write tidak tersedia                                |

AC19 dan AC20 selesai secara lokal. Gate C belum selesai karena Task 17 harus
mendokumentasikan cohort, hasil penilaian Sales, false positive musiman/proyek,
dan keputusan retain/tune/stop.

## Bukti pengujian

1. TDD/targeted:
   - RED awal: exact client RPC dan feedback command belum ada (`PGRST202`),
     normalizer feedback belum diekspor, serta selector reusable client Task belum ada.
   - Setelah fresh reset:
     `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test src/lib/repeat-order-cadence.test.ts src/lib/data/task-relations.test.ts supabase/tests/crm-repeat-order-cadence.test.ts`
     — **26 pass, 0 fail, 70 assertions**.
2. Full regression aplikasi/database:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run verify:ci:app`
     — lint, typecheck, full test, dan build lulus.
   - Run full test final terpisah: **815 pass, 0 fail, 3.170 assertions, 109 files**.
3. Browser:
   - Targeted Task 16 Chromium: antrean/count, overdue, follow-up reuse, feedback,
     Client Detail cukup/kurang data, dan other-owner denial — lulus.
   - Full Chromium serial setelah fresh reset: **20 pass, 0 fail** dalam 3,4 menit.
   - Run default paralel sebelumnya: **19 pass, 1 fail** karena satu HTTP 400
     intermiten pada pemeriksa console flow action-queue lama. Kedua flow yang
     beririsan kemudian lulus bersama dengan dua worker (**2/2**) dan full serial
     lulus (**20/20**); run gagal tidak dipakai sebagai bukti rilis hijau.
4. Database:
   - Fresh reset seluruh migration melalui workdir test terisolasi
     `/tmp/dsm-gate-a.heGRvH` lulus, termasuk migration `20261017145427`.
   - Supabase security/performance advisor lokal: **No issues found**.
   - DB lint tetap melaporkan tiga false-positive temporary-table historis pada
     fungsi import/migration lama; tidak ada finding pada kontrak Task 16.
5. Hygiene:
   - `git diff --check` — lulus.

## Database lokal

Semua write test memakai API loopback `http://127.0.0.1:54321`, Postgres
loopback port `54322`, dan container `supabase_db_DSM_GATE_A_20261016`.
Database di-reset hanya pada instance test terisolasi tersebut. Tidak ada koneksi,
write, migration, atau inspeksi data pelanggan produksi.

## Batas verifikasi

- **Source-inspected:** exact client scope, aggregate/page contract, role/owner
  boundary, empty `search_path`, grant/revoke, RLS append-only, idempotency lock,
  feedback annotation, query invalidation, Task reuse, dan no-status-mutation.
- **Tested-local:** AC19–20 contract, direct bypass, anonymous/role/owner,
  insufficient/non-overdue, concurrency, retry, payload mismatch, rollback,
  migration reset, full regression, lint, typecheck, build, advisor, dan DB lint.
- **Browser-verified:** count reconciliation, overdue/insufficient display,
  Client Detail, exact other-owner denial, follow-up Task reuse, feedback persist,
  reload/navigation, responsive flow existing, dan console check.
- **Blocked:** migration parity produksi, migration remote, deployment, remote
  smoke, dan Task 18 live backup/restore tetap di luar otorisasi.
- **Unverified:** kondisi/performa produksi dan hasil pilot manusia Task 17.

## File Task 16

- `supabase/migrations/20261017145427_add_crm_repeat_order_consumer_contracts.sql`
- `supabase/tests/crm-repeat-order-cadence.test.ts`
- `src/lib/data/repeat-order-cadence.ts`
- `src/lib/repeat-order-cadence.test.ts`
- `src/lib/data/task-relations.ts`
- `src/lib/data/task-relations.test.ts`
- `src/components/repeat-orders/RepeatOrderFeedbackDialog.tsx`
- `src/components/repeat-orders/RepeatOrderSignalList.tsx`
- `src/components/repeat-orders/RepeatOrderSummary.tsx`
- `src/components/clients/AddFollowUpDialog.tsx`
- `src/components/clients/ClientOverviewTab.tsx`
- `src/routes/_app.tasks.tsx`
- `src/routes/_app.clients.$clientId.tsx`
- `e2e/crm-gate-a.spec.ts`
- `tasks/crm-reliability-and-growth-todo.md`
- `docs/reports/2026-10-17-crm-task-16-verification.md`

Perubahan masih lokal dan belum di-commit. Tidak ada push, deployment, migration
remote, perubahan database produksi, atau pesan eksternal.
