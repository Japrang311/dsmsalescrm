# CRM Reliability and Growth — Gate A verification

Tanggal: 16 Oktober 2026
Status: **Verified local; siap review lokal, belum siap migration/deploy produksi**

## Perilaku yang berubah

1. Reports sekarang memakai satu RPC snapshot dengan scope tanggal/filter yang
   sama untuk total, pajak, sumber, jumlah order, top customer, owner, dan tren.
   Range inklusif lintas tahun dan denominator share tidak lagi bergantung pada
   loaded page atau RPC tahunan terpisah.
2. Target hanya dibandingkan untuk bulan kalender penuh dan filter yang memang
   sebanding. Periode parsial/subset menampilkan alasan, bukan prorata implisit.
   XLSX membawa basis, range, filter, timestamp, alasan target, dan nilai exact.
3. UI, export, dan prompt AI menggunakan definisi `Nilai SO`: order berbayar yang
   tercatat, bukan bukti kas diterima/lunas atau pendapatan akuntansi. Prototype
   FOC tetap nol; aturan angka existing tidak berubah karena perubahan label.
4. Koreksi header dan item SO memakai command database atomik dengan row lock,
   expected version, request replay, payload mismatch guard, reason wajib,
   actor dari sesi, owner terpisah, before/after, dan request ID pada audit.
5. Direct authenticated update header/item diblokir. Gagal audit membatalkan
   perubahan dan recompute total; conflict mempertahankan draft dan menawarkan
   reload; no-op tidak membuat audit palsu.
6. Lineage quotation–SO divalidasi pada create/link/edit: client sama, Quotation
   current Closed Won, tidak deleted/superseded, ownership benar, dan link unik.
   Client pada pasangan linked tidak dapat diubah diam-diam.
7. Riwayat koreksi header/item tampil pada detail SO dengan actor, owner, alasan,
   before/after, timestamp, dan pagination cursor.

## Acceptance Gate A

| Acceptance | Hasil lokal | Bukti utama |
| --- | --- | --- |
| AC01–03 | Lulus | unit scope/target, RPC role matrix, XLSX vs RPC browser reconciliation |
| AC04–05 | Lulus | UI/export/AI labels dan prompt; nilai/FOC regression tests |
| AC06–08 | Lulus | audit rollback, concurrency satu pemenang, replay, no-op, anon/Executive/other-owner/RLS negatif |
| AC09–11 | Lulus | create/link/edit lineage, deleted/superseded/cross-client, direct repeat, uniqueness concurrency, audit detail |
| AC21 / Task 18 | Sebagian lokal; produksi blocked | [local restore drill](2026-10-16-crm-local-restore-drill.md) |

## Perintah dan hasil

- Fresh migration: `bunx supabase@2.109.1 db reset --workdir <isolated-test-workdir>`
  — lulus dari migration awal sampai tiga migration Gate A.
- Targeted DB: lima file report/correction/lineage/manual-link/super-admin —
  **57 pass, 0 fail, 253 assertions**.
- Targeted unit report/export/AI — **26 pass, 0 fail, 94 assertions**.
- Full test: `LOCAL_SUPABASE_DB_CONTAINER=<isolated-test-container> bun run test`
  — **736 pass, 0 fail, 2805 assertions, 100 files**.
- `bun run lint` — lulus.
- `bun run typecheck` — lulus.
- `bun run build` — lulus.
- Full browser Chromium serial — **14 pass, 0 fail**. Flow Gate A memeriksa
  XLSX vs RPC dan conflict draft/reload/save/audit. Serial dipakai karena run
  dua-worker membuat expected HTTP 400 stale-version dari test conflict
  mengganggu pemeriksaan console flow lain.
- `supabase db advisors --local` — tidak menemukan issue.
- `supabase db lint --local` — tiga error existing pada analisis fungsi yang
  mereferensikan temporary table runtime (`tmp_ci_pool`,
  `tmp_imported_quotation_ids`, `tmp_business_calendar_import`). Tidak ada
  temuan pada migration Gate A; hasil lint aggregate tetap tidak hijau dan tidak
  disamarkan sebagai lulus.

Semua endpoint test diarahkan tepat ke `http://127.0.0.1:54321`. Instance dan
volume kerja lama tidak di-reset. Commit, push, CI remote, migration remote,
deployment, dan production browser smoke tidak dilakukan.

## Legacy review

Pada database test setelah browser suite final: 92 SO, 6 linked, 0 invalid link,
dan 0 orphan link. Dua puluh event memakai kind header/item correction; enam event
manual-link existing tidak memiliki `event_data` terstruktur karena RPC lama
memakai kind `sales_order_header_change`. UI tetap menampilkan detail legacy
melalui fallback teks. Tidak ada autocorrect/backfill.

Angka tersebut hanya fixture/hasil E2E lokal. Inventaris mismatch dan ID produksi
tetap **unverified**; keputusan remediation produksi harus dibuat setelah query
read-only yang diotorisasi.

## Restore dan gate produksi

Drill lokal memulihkan schema `public/private/auth/storage`, seluruh row count,
satu Auth user sintetis, satu bucket/object metadata, dan payload Storage dengan
SHA-256 sama. Restore exit `0`; fixture kecil pulih sekitar satu detik.

Task 18 belum selesai untuk produksi. Blocker: sesi ini tidak mengizinkan membaca
plan/inventaris backup live, membuat backup remote, atau memilih target restore
remote terisolasi. Karena itu RPO/RTO produksi, retention, dan recoverability
belum terbukti. Gate A siap review **lokal**, tetapi migration/deploy produksi
tetap ditahan.

## File scope

- Migration/RPC/trigger: tiga migration `20261016*`.
- Database tests: report scope, correction, lineage, serta penyesuaian regression
  matrix existing.
- App: Reports scope/target/export, definisi Nilai SO, adapter command SO,
  detail SO, dan komponen riwayat audit.
- Browser: spec Gate A dan sinkronisasi accessible label pada flow manual link.
- Operasional: runbook produksi, baseline, restore drill, laporan ini, dan
  evidence ledger.

File untracked pengguna di luar scope—termasuk dua laporan 9 Agustus—tidak
diubah. `tasks/plan.md` dan `tasks/todo.md` historis tidak diubah.
