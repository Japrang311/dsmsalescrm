# Stage 4 — Product Intelligence: Laporan Verifikasi

**Tanggal:** 2026-08-07
**Status:** Implementasi selesai, lokal-only. Menunggu review owner.
**Cakupan:** semua yang ada di "Stage 4 — Product intelligence" di `tasks/four-stage-stabilization-and-growth-todo.md`.

## Tujuan Stage 4

Kasih metrik funnel dan timing yang bisa dipakai buat keputusan (win/loss, cycle-time, dwell), tanpa mengarang lineage historis yang gak beneran ada. Spec (`docs/superpowers/specs/2026-08-05-four-stage-stabilization-and-growth-design.md` §7) eksplisit: kalau data linkage-nya gak ada, metrik itu harus absen atau dikecualikan dengan alasan jelas — bukan diisi nol atau ditebak.

## Apa yang berubah, per area

### 1. Metric dictionary disetujui dulu sebelum kode

`docs/decisions/2026-08-07-stage-4-metric-dictionary-proposal.md` — 9 metrik didefinisikan (owner, formula, grain, filter, source field, effective date, exclusion) sebelum satu baris kode pun ditulis. Owner approve semua 9 termasuk cycle-time, plus field baru `customer_po_date` (nama dan cara isi).

### 2. Lineage dan Customer PO milestone date

- `sales_orders.source_commercial_document_id` — ternyata udah ada dari fitur Pipeline "Closed Won → Create Sales Order" yang landing sehari sebelum Stage 4 mulai (migration `20260807010000`), bukan kerjaan baru.
- `sales_orders.customer_po_date date null` — field baru, additive, no backfill (migration `20260807040000`). Diisi manual di form Create/Edit Sales Order, terpisah dari `customer_po_number` (teks bebas) dan `sales_orders.date` (tanggal dokumen SO sendiri).

### 3. Audit structured stage-event coverage — dua bypass nyata ketemu dan dibenerin

Ditemukan dua jalur aplikasi yang ubah `commercial_documents.stage` langsung tanpa lewat RPC `transition_commercial_stage`, jadi nulis `activity_log` tanpa `event_data` terstruktur — diam-diam merusak akurasi funnel/dwell buat dokumen yang lewat jalur itu:

1. **Tasks Inbox "Move to Commit"** (`_app.tasks.tsx`) — direroute lewat `transitionCommercialStage()`, sekarang pakai dialog next-action yang sama kayak Pipeline drag-and-drop (`PipelineStageMoveDialog`, di-reuse).
2. **Form koreksi Detail Quotation/SO** (`CommercialDetailPage.tsx`) — stage change lewat form ini sekarang juga lewat RPC dengan panel next-action sendiri; field lain (nomor, tanggal, note) tetap lewat jalur koreksi langsung seperti sebelumnya.

Grant UPDATE langsung di kolom `stage` di database **sengaja dibiarkan** — dipakai Super Admin buat koreksi data (dibuktikan test `supabase/tests/super-admin-rls.test.ts` yang udah ada), pola yang sama kayak `so_number`/`owner_id`/`customer_po_number` di seluruh codebase ini: RLS adalah boundary sebenarnya, bukan grant kolom. Cuma dua bypass aplikasi di atas yang diperbaiki.

Diverifikasi live browser (Manager login, fixture sekali-pakai): Tasks quick action Negotiation→Commit dan Detail-page correction Commit→Hot Prospect keduanya sekarang nulis `event_data` terstruktur lengkap (`schema_version`/`from_stage`/`to_stage`/`effective_at`), dicek langsung lewat query database.

### 4. Enam RPC analitik, RLS-scoped

Semua `security definer`, semua self-scoping (`current_user_role()`; caller `sales` selalu dipaksa ke `owner_id` sendiri, role null/nonaktif ditolak fail-closed) — pola sama persis kayak `sales_orders_metrics`/`pipeline_metrics` Stage 3:

| RPC | Metrik |
| --- | --- |
| `commercial_win_loss_metrics` | Win/loss count, value, rate — Quotation terminal (Closed Won/Lost) |
| `commercial_lost_reason_metrics` | Breakdown Closed Lost per `lost_reason`, pakai kontrak yang udah ada |
| `commercial_cycle_time_metrics` | Median/P75/P90 hari — Quote→PO, PO→SO, Quote→SO end-to-end |
| `commercial_stage_funnel_metrics` | Distinct-document count masuk tiap stage, dari event terstruktur |
| `commercial_stage_dwell_metrics` | Dwell time per stage, completed (interval tertutup) vs open (masih jalan) dipisah |
| `commercial_analytics_coverage` | `analytics_effective_from`, included/excluded count, alasan exclusion per metrik |

`supabase/tests/stage4-analytics-metrics.test.ts` (10 test) buktiin role scoping, period filter, empty data, legacy data (Quotation tanpa event terstruktur — absen dari funnel/dwell, ke-hitung sebagai excluded di coverage), dan invalid lineage (SO tanpa `source_commercial_document_id`/`customer_po_date` — dikecualikan per-leg, gak dianggap nol).

### 5. UI Reports — Product Intelligence + data-quality panel

Tiga komponen chart baru (`Stage4WinLossSection`, `Stage4CycleTimeSection`, `Stage4FunnelDwellSection`) plus data layer `stage4-analytics.ts`, wired ke `_app.reports.tsx` pakai filter owner/range/client yang sama kayak section lain. `CoverageNote` (di `Stage4Primitives.tsx`) nempel di tiap card, nunjukin cakupan, `effective_from`, dan alasan exclusion — bukan disembunyikan di halaman terpisah.

Diverifikasi live browser pakai data seed produksi asli (bukan sintetis): Win/Loss dan Lost-Reason render populated (9 Quotation terminal, 100% coverage — gak butuh lineage). Cycle-Time dan Funnel/Dwell render empty-state jujur dengan 0% coverage (0/72 dikecualikan "missing source_quotation_id or customer_po_date", 0/120 dikecualikan "no structured stage event recorded (pre-2026-08-05 history)") — karena data seed emang predate kedua field itu. Ini bukti nyata behavior "jangan mengarang lineage", bukan cuma teori.

### 6. Export XLSX/PDF diperluas, sheet baru

`DashboardExportContext` dapat field opsional `stage4` — `undefined` buat export Dashboard (yang gak pernah fetch RPC ini), jadi export Dashboard gak berubah sama sekali. Kalau ada (cuma di Reports), `exportExecutiveReportXlsx` nambah 6 sheet baru (Win-Loss, Lost Reasons, Cycle Time, Stage Funnel, Stage Dwell, Data Quality) dan `exportExecutiveReportPdf` nambah section yang sepadan — murni nambah, gak ada kolom/urutan lama yang diubah. Data export = data yang sama persis yang udah di-fetch buat layar (bukan fetch ulang), jadi angka layar dan export gak mungkin beda by construction.

## Hasil bersihnya

- 9 metrik dari metric dictionary yang disetujui semua kejalan, termasuk cycle-time (yang butuh persetujuan eksplisit lineage field).
- Dua bug nyata (structured-event bypass) ketemu dan dibenerin sebagai bagian dari audit Task 4.3 — sebelumnya gak ada yang notice karena efeknya diam-diam (data hilang dari agregat, bukan error).
- Setiap chart Stage 4 nunjukin cakupannya sendiri secara eksplisit — kalau datanya belum lengkap, itu kelihatan di layar, bukan disembunyikan di balik angka yang salah.
- Typecheck dan lint bersih di setiap langkah. Test suite lokal 585/586 (kadang 583–585 tergantung run) — satu-satunya kegagalan konsisten adalah flake infra GoTrue lokal (500 di admin `deleteUser` pas cleanup test, gara-gara container lokal kebanyakan di-restart dalam sesi panjang ini) yang udah direproduksi dan didiagnosis berulang kali, sama sekali gak berhubungan sama perubahan Stage 4 manapun — dikonfirmasi dengan menjalankan ulang test yang gagal secara terisolasi (selalu hijau) dan dengan membuktikan root cause-nya (row fixture nyangkut dari cleanup yang gagal, bukan logic RPC/UI).
- Kedua migration (`add_sales_order_customer_po_date`, `add_stage4_analytics_rpcs`) diterapkan ke production Supabase (`qhtfixgbcpcitokeryxb`) 2026-08-07 dengan approval eksplisit owner. Diverifikasi lewat MCP: `list_migrations` nunjukin keduanya terdaftar, kolom `sales_orders.customer_po_date` (date, nullable) ada, keenam RPC ada dengan jumlah argumen yang sesuai. `get_advisors` (security + performance) dicek — cuma warning "signed-in dapat eksekusi SECURITY DEFINER" yang sama kayak semua RPC metrics Stage 3 lainnya (accepted class, bukan risiko baru), performance advisories semuanya pre-existing di tabel/kolom lama, gak nyentuh apapun yang baru ditambahkan.
- **Kode aplikasi (frontend) belum di-push ke `main`.** Push ditahan sengaja sampai owner konfirmasi — begitu di-push, Vercel auto-deploy ke production. Urutan migration-dulu-baru-push ini sengaja dipilih supaya `create_sales_order` (yang signature-nya berubah) gak pernah dipanggil dari kode lama yang gak cocok sama database baru, atau sebaliknya.

## Yang belum dicakup / catatan

- Realtime tetap ditunda sampai Stage 4 diterima resmi (sesuai keputusan spec).
- Coverage RPC (`commercial_analytics_coverage`) belum ada test rekonsiliasi otomatis yang bandingin angka RPC vs hitungan manual di fixture terpisah — tercakup secara implisit lewat `stage4-analytics-metrics.test.ts` (fixture yang sama dipakai buat semua 6 RPC, termasuk assert coverage cocok sama fixture yang di-construct manual), tapi gak ada test 1:1 murni "reconciliation" kayak yang Stage 3 punya buat `dashboard-metrics-reconciliation.test.ts`.
- "Test Sales" duplicate-key React warning yang muncul konsisten di console selama browser verification (di dropdown owner/Sales Performance table) — pre-existing, bukan dari Stage 4, kemungkinan data seed yang ada baris "Test Sales" terduplikasi. Belum di-investigate lebih lanjut, di luar scope Stage 4.

## Yang butuh review kamu

- [ ] Konfirmasi ringkasan ini cocok sama pemahaman kamu soal apa yang udah jalan.
- [x] Approve migrasi Stage 4 (`20260807040000`/`add_sales_order_customer_po_date`, `20260807060000`/`add_stage4_analytics_rpcs`) buat diterapkan ke production `qhtfixgbcpcitokeryxb`. **Diterapkan 2026-08-07** — lihat "Hasil bersihnya" di atas.
- [ ] Approve push commit `5960c14` ke `main` (auto-deploy Vercel production) — migration remote udah siap duluan, jadi aman kapan pun mau push.
- [ ] Konfirmasi Stage 4 dianggap selesai secara lokal (semua item checklist tercentang) sebelum lanjut ke Program completion checklist.
