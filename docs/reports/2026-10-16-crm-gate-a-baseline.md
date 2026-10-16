# Gate A — baseline lokal, 16 Oktober 2026

Status: Task 00 source-inspected dan tested-local; program belum siap Gate A.

## Otoritas dan ruang lingkup

Spec v1.0, plan dan ADR-005 Accepted dibaca. D01–D08 diterima oleh pemilik
produk pada 16 Oktober 2026. Tidak ada keputusan bisnis yang dibuka ulang.
Implementasi lokal diizinkan; commit, push, deployment dan mutation produksi
tidak dilakukan. `tasks/plan.md` dan `tasks/todo.md` historis dipertahankan.

Baseline Git: `fc58877813adc98dc758a6b6ba8c78bee12e9ffc`, sama dengan
local tracking ref `origin/main` (tidak melakukan fetch untuk mengklaim keadaan remote).
Pada awal sesi tracked tree bersih. Lima dokumen program dan dua laporan
2026-08-09 milik pengguna untracked; dua laporan tersebut tidak disentuh.

## Lingkungan pengujian

Docker tersedia. Instance lama `DSM_SALES_WEB_APP_V2` berhenti dan volumenya
dipertahankan. Instance baru `DSM_GATE_A_20261016` dibuat di
`/tmp/dsm-gate-a.heGRvH`; seluruh migration sampai
`20260930092216_add_manual_sales_order_quotation_link.sql` diterapkan.
Seed pelanggan tidak dijalankan. API pengujian `http://127.0.0.1:54321`,
Postgres loopback port 54322. `.env.local` menunjuk API lokal; helper DB
memakai `requireLocalSupabaseUrl` untuk menolak endpoint remote.
Tidak ada reset database kerja atau akses produksi.

## Inspeksi source dan schema aktual

- Reports KPI menerima from/to, tetapi Top Customers dan owner performance
  memakai RPC setahun dari tahun akhir range. Target memakai tahun bisnis
  sekarang dan cumulative current month. Share bisa berbeda populasi.
- SO header menggunakan update langsung lalu audit browser terpisah; item
  menggunakan update/insert langsung. Belum ada expected-version/replay.
- Grants authenticated mengizinkan koreksi header dan item; trigger item
  recompute total sudah ada. RLS membatasi owner/role, tetapi belum ada trigger
  yang menjaga kesamaan client quotation–SO pada correction.
- Manual link RPC sudah lock SO/quotation, memvalidasi role aktif, ownership,
  client, current Closed Won, soft-delete, uniqueness, dan audit atomik.
  Gunakan ulang fungsi tersebut; create path masih perlu regression negatif.
- Canonical FK unik `sales_orders.source_commercial_document_id` dipertahankan.
- `PipelineBoard.tsx` menerima `pendingSoItemIds` serta
  `linkedSalesOrderByItemId`, menyediakan Create SO, Link SO, dan buka SO linked.
  Ini perilaku existing yang digunakan ulang, bukan dibangun ulang.
- Activity feed global sengaja mengecualikan header/item correction; audit
  detail SO perlu query tersendiri pada Task 08.

## Fixture dan review legacy

`tests/fixtures/crm-reliability.ts` berisi client sintetis A/B, A Rp500 juta
setahun, Rp20 juta Februari dan total Februari Rp100 juta; serta transaksi dan
target lintas tahun. Tidak berisi data pelanggan produksi.

Query read-only pada database test untuk pasangan linked yang berbeda client,
non-Quotation, bukan Won, superseded, atau deleted menghasilkan **0** sebelum
fixture. Ini database kosong yang baru dibangun, bukan bukti legacy produksi
bersih. Inventaris ID legacy produksi **unverified** karena di luar akses sesi.
Tidak ada autocorrect/backfill.

## Bukti dan batas

- `git status --short --branch`, latest migration, policies, column grants,
  triggers dan callers diperiksa langsung.
- `bun test src/lib/report-metric-scope.test.ts src/lib/report-selectors.test.ts`:
  10 pass / 0 fail. Test baru terlebih dahulu merah (module belum ada), lalu hijau.
- Browser: belum dijalankan; tidak ada perubahan UI pada Task 00/01 awal.
- Remote migration, CI, deployment, backup produksi: tidak dilakukan.

Task berikutnya: sambungkan scope ke RPC/Reports (02), target/export (03),
label SO (04), reproduksi dan perbaikan koreksi/lineage (05–08). Task 18
memerlukan restore lokal serta inventaris backup produksi berizin sebelum
gate produksi dapat dinyatakan lulus.
