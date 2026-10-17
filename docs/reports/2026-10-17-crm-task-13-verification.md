# Verifikasi Task 13 — Follow-up dari exception

Tanggal: 17 Oktober 2026

Status: **Verified local + browser; Task 14 belum dimulai**

Scope: Task 13 dan subtask kontrak command database yang diwajibkan plan ketika
flow existing perlu dijalankan sebagai satu transaksi idempotent. Slice ini tidak
menambah snooze, feedback, perubahan status bisnis, pesan eksternal, atau fitur
repeat-order.

## Hasil

[Pasti] Setiap quotation pada antrean tindakan kini menyediakan aksi `Catat
follow-up` yang membuka dialog follow-up komersial existing dengan quotation dan
client yang benar. Outcome, catatan, next action, tanggal, dan Task terkait tetap
memakai flow yang sama; mode exception hanya menambahkan command atomik dan
idempotency key.

[Pasti] Command menggunakan tepat satu Task aktif yang sudah terkait bila tersedia.
Jika tidak ada, command membuat satu Task fallback dalam transaksi yang sama. Bila
ada lebih dari satu kandidat, pengguna harus memilih; preferred Task yang tidak
valid ditolak dan tidak diam-diam diganti.

[Pasti] Lock quotation, advisory lock per actor/request, dan replay record mencegah
retry atau dua request bersamaan membuat Task ganda. Kegagalan audit aktivitas
me-rollback Task, follow-up, dan replay record sebagai satu transaksi.

[Pasti] Role Executive dan anonymous tidak dapat mengeksekusi command. Sales hanya
dapat menulis quotation miliknya; actor/owner nonaktif dan cross-owner ditolak.
Tidak ada pesan eksternal yang dikirim.

## Acceptance yang diverifikasi

| Acceptance Task 13 / AC16       | Bukti lokal/browser                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Context yang benar               | Browser membuka dialog dari signal dan menampilkan quotation/client sumber          |
| Outcome + next action atomik     | Command memanggil kontrak progress canonical dalam transaksi yang sama              |
| Reuse Task aktif                 | Exact-one candidate digunakan ulang; preferred candidate tervalidasi                |
| Tidak ada Task ganda             | Dua request ID concurrent menghasilkan satu Task; request replay identik             |
| Retry deterministik              | Payload sama mengembalikan hasil replay; payload berbeda pada request ID sama ditolak |
| Resolve/refresh tidak duplikasi  | Setelah save dan reload hanya satu Task aktif dan satu follow-up terkait              |
| Batas role/ownership             | Executive, anonymous, Sales cross-owner, dan preferred Task invalid ditolak          |
| Rollback                         | Forced audit failure meninggalkan nol Task, follow-up, dan replay baru               |

AC16 selesai untuk Task 13. AC17 belum selesai penuh karena persistence snooze dan
feedback operasional tetap scope Task 14.

## Bukti pengujian

1. TDD command database:
   - RED: dua test awal gagal `PGRST202` karena RPC belum tersedia.
   - Final:
     `SUPABASE_URL=http://127.0.0.1:54321 bun test supabase/tests/follow-up-rpcs.test.ts`
     — **9 pass, 0 fail, 34 assertions**.
   - Mencakup concurrency dengan request ID berbeda, replay, payload mismatch,
     ownership, role, privilege anonymous, invalid/multiple Task, dan rollback.
2. Adapter dan relation selector:
   - `bun test src/lib/data/follow-ups.test.ts` — **5 pass, 0 fail, 16 assertions**.
   - `bun test src/lib/data/task-relations.test.ts` — **4 pass, 0 fail, 6 assertions**.
3. UI targeted:
   - `bun test tests/precision-ui.test.tsx src/lib/data/task-relations.test.ts`
     — **13 pass, 0 fail, 45 assertions**.
4. Full unit/database suite:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **783 pass, 0 fail, 3.050 assertions, 106 files**.
5. Static/build:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
6. Browser:
   - Targeted Chromium open → record → reload — **1 pass**; hasil UI direkonsiliasi
     ke database: satu Task aktif dan satu follow-up yang menunjuk Task tersebut.
   - Run full awal `bun run test:e2e` — exit 0; **17 pass langsung dan 1 flaky
     yang lulus saat retry**. Flaky ada pada test login/dashboard lama karena satu
     resource auth mengembalikan HTTP 400 di percobaan pertama, bukan pada flow
     Task 13.
   - Isolasi test flaky dengan `--repeat-each=3` — **3 pass, 0 fail**.
   - Run full pre-commit final — **18 pass, 0 fail, tanpa retry** dalam 2,6 menit.
7. Database checks:
   - Supabase security advisor pada database lokal — **No issues found**.
   - DB lint hanya melaporkan tiga false-positive temp-table historis yang sudah
     didokumentasikan; tidak ada temuan baru Task 13.

## Database lokal

Semua test yang menulis data memakai API loopback `http://127.0.0.1:54321` dari
project disposable `DSM_GATE_A_20261016` dan container database
`supabase_db_DSM_GATE_A_20261016`. Migration `20261017080000` diterapkan secara
transaksional setelah migration Task 12 pada database lokal tersebut. Database
tidak di-reset pada slice ini untuk mempertahankan data uji yang ada; production
tidak dibaca atau diubah.

## Batas verifikasi

- **Source-inspected:** command locks, replay contract, authorization, exact-one
  Task reuse, dialog integration, invalidation, dan action visibility.
- **Tested-local:** RLS/direct API boundary, role/ownership, concurrency, replay,
  rollback, full 783-test suite, lint, typecheck, build, dan advisor/lint database.
- **Browser-verified:** open signal → context dialog → record → reload → database
  reconciliation, ditambah seluruh 18 regression flow tanpa retry pada run final.
- **Blocked:** migration parity produksi, deployment, remote smoke, serta Task 18
  live backup/restore tetap di luar otorisasi.
- **Unverified:** fresh reset seluruh migration pada slice ini, kondisi produksi,
  snooze/feedback Task 14, dan repeat-order Task 15–17.

## File Task 13

Subtask command database dipisahkan secara konseptual dari consumer UI sesuai
plan; karena itu total file melampaui batas lima file untuk slice UI saja.

- `supabase/migrations/20261017080000_add_crm_exception_follow_up.sql`
- `supabase/tests/follow-up-rpcs.test.ts`
- `src/lib/data/follow-ups.ts`
- `src/lib/data/follow-ups.test.ts`
- `src/lib/data/task-relations.ts`
- `src/lib/data/task-relations.test.ts`
- `src/components/commercial/LogCommercialFollowUpDialog.tsx`
- `src/components/tasks/ActionSignalList.tsx`
- `tests/precision-ui.test.tsx`
- `e2e/browser-flows.spec.ts`
- `tasks/crm-reliability-and-growth-todo.md`

Tidak ada commit, push, deployment, migration remote, atau pesan eksternal pada
slice ini.
