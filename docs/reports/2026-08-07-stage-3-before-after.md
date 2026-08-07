# Stage 3 — Data and Performance: Laporan Before/After

**Tanggal:** 2026-08-07
**Status:** Draft, nunggu review owner (checklist item "Review dated Stage 3 before/after report").
**Cakupan:** semua yang ada di "Stage 3 — Data and performance" di `tasks/four-stage-stabilization-and-growth-todo.md`, 2026-08-05 sampai 2026-08-07.

## Masalah yang mau dibenerin Stage 3

Setiap route yang nampilin list (Clients, Pipeline, Sales Orders, Activity, Tasks, Dashboard, Reports) narik *seluruh* isi tabel di baliknya tiap kali halaman dibuka, lewat `useDashboardData()` atau `list*()` per-route tanpa `LIMIT`, baru difilter/di-agregat/dipaginasi di browser. Ini masih jalan pas volume data awal, tapi punya tiga risiko yang makin parah seiring data perusahaan beneran nambah:

1. **Performa** — ukuran payload dan compute di client sama-sama nambah linear sama total jumlah baris, terus-terusan.
2. **Salah diam-diam** — PostgREST otomatis batasin response unbounded ke maksimal 1.000 baris. Lewat itu, fetch unbounded gak error, cuma diam-diam buang baris. Ini udah diukur langsung pas scale benchmark Stage 3 (lihat bawah) — bukan cuma teori.
3. **Angka beda-beda** — Dashboard dan Reports masing-masing bikin ulang perhitungan revenue/task/client sendiri-sendiri di client, jadi dua halaman itu BISA (dan memang kejadian, lihat investigasi lineage Sales Order / Spending YTD Clients di sesi ini) nunjukin angka beda buat fakta yang seharusnya sama.

## Apa yang berubah, per area

### 1. Kontrak pagination (fondasi)

`src/lib/pagination-contracts.ts` definisiin satu bentuk yang dipakai bareng: page size terbatas, cursor keyset opaque, serialisasi filter yang stabil buat React Query key. Semua route paginated di bawah ini bangun di atas satu kontrak ini, bukan bikin sendiri-sendiri.

### 2. Lima route list pindah dari fetch unbounded

| Route | Sebelum | Sesudah |
| --- | --- | --- |
| Clients | Fetch seluruh tabel `clients`, filter search/status/source/owner/next-FU di client | `listClientRowsPage()` — filter server-side, cursor keyset di `created_at`+`id`, page size 10 |
| Tasks | Fetch seluruh tabel `tasks` (Today/Upcoming/Overdue/Completed/Archived semua di client) | Today/Upcoming/Overdue tetap pakai `listActiveTasks()` yang bounded (memang terbatas secara alami); Completed/Archived dapat pagination keyset beneran lewat `listTasksPage()`, page size 25 |
| Pipeline / Commercial Documents | Fetch penuh 436 dokumen/788 item | Pagination keyset per-stage, page size 50, plus aggregate RPC `pipeline_metrics` buat total board |
| Sales Orders | Fetch penuh 211 baris/418 item | `listSalesOrdersPage()`, page size 25, cursor di `so_number`+`id` (bukan `created_at` — baris hasil import bulk cuma punya 21 timestamp beda), plus aggregate RPC `sales_orders_metrics` buat KPI tile |
| Activity Log | Dua fetch unbounded (`activity_log` + `follow_up_logs`) digabung di client | View baru `activity_feed_events` (`security_invoker`, UNION dua tabel di server) + `listActivityFeedPage()` pagination keyset, page size 25 |

Kelimanya punya test integrasi page-1/page-2 no-overlap yang buktiin mekanisme cursor-nya gak duplikat atau buang baris antar halaman.

Export (Sales Orders, Activity) sengaja tetap narik seluruh hasil filter lengkap on-demand — export harus lengkap, bukan cuma halaman yang lagi ditampilin. Ini pengecualian yang disengaja dan didokumentasikan, bukan kelupaan.

### 3. Dashboard dan Reports pindah ke aggregate RPC yang sama

Sebelum: array penuh `orders`/`tasks`/`items`/`clients` dari `useDashboardData()`, di-reduce di client, sendiri-sendiri, di `dashboard-selectors.ts` DAN `report-selectors.ts` — dua implementasi buat perhitungan yang sama, tanpa jaminan hasilnya bakal sama.

Sesudah: sembilan aggregate RPC, semuanya `security definer`, semuanya self-scoping (`current_user_role()`; caller `sales` selalu dipaksa ke `owner_id` sendiri berapa pun yang diminta, cocok sama RLS):

- `sales_orders_metrics` — total PPN/Non-PPN/source/FOC/prototype-paid, filter lengkap (rentang tanggal, owner, klien, tipe pajak, tipe SO, source)
- `pipeline_metrics` — total per stage pipeline
- `sales_orders_monthly_trend` / `sales_orders_owner_ytd` / `sales_orders_top_customers` — diperluas 2026-08-07 dengan filter set yang sama kayak `sales_orders_metrics` (awalnya cuma year+owner) biar filter bar lengkap Reports juga jalan
- `sales_task_client_metrics` — hitungan task open/overdue/escalated/completed/cancelled + client aktif per owner
- `dashboard_risk_alert_counts` — tiga threshold check Risk Alerts
- `admin_team_summary` — roster Team Settings (lihat fix N+1 di bawah)

Tiap RPC punya test rekonsiliasi yang buktiin outputnya PERSIS sama dengan perhitungan client-side lama di fixture data yang sama — ini literally yang diminta "reconcile totals", bukan cuma "kelihatannya benar."

Baris KPI Dashboard, dua chart trend, tabel Sales Performance, dan keempat kartu Executive sekarang baca dari RPC ini. `ActivityComplianceCard` dan `TodaysFollowUpList` nyusul (2026-08-07): yang pertama baca `sales_task_client_metrics`, yang kedua pindah dari `listTasks()` unbounded ke `listActiveTasks()` yang bounded. Seluruh route Reports (KPI totals, dua chart trend, Top 5 Customers, Sales Performance) adalah bagian terakhir dan terbesar, juga selesai 2026-08-07 — `allOrders`/`allTasks` sekarang cuma dipakai buat export row-level dan bagian funnel/waiting-PO/risk-alert yang lebih kecil yang belum ada padanan aggregate-nya.

Dua bug nyata ketemu dan dibenerin pas nyambungin Reports ke RPC ini (gak ada di pemakaian RPC awal yang cuma buat Dashboard, karena Dashboard gak pernah kirim argumen spesifik ini):
- `ownerId: "all"` (default filter bar Reports) langsung diteruskan sebagai literal `p_owner_id` bukannya di-null-kan, jadi diam-diam nge-nol-in semua query trend/owner-YTD/top-customers kapan pun gak ada owner spesifik yang dipilih.
- `sales_orders_top_customers` nge-sum `total_value` tanpa coalesce NULL; klien yang SO-nya di scope itu cuma Prototype FOC (`total_value` NULL) jadi ke-sum NULL, dan Postgres defaultnya `NULLS FIRST` buat `DESC` — diam-diam naruh klien revenue-nol di ATAS klien top revenue beneran.

### 4. N+1 Team Settings dihilangkan

`listTeamMembers()` dulu jalanin `1 + 4*N` query (satu per member, empat sub-query masing-masing). Diganti `admin_team_summary()`, satu query pakai `LATERAL` join. Sekalian ketemu dan dibenerin bug overcounting nyata (revisi Quotation yang udah ke-superseded dan dokumen yang soft-delete ikut kehitung sebagai bisnis aktif) dan root cause asli dari bug production "Tim & Role gagal render" yang dulu misterius (bug shadowing argumen `queryFn` React Query, gak ada hubungannya sama tabel yang hilang, kena di dua tempat).

### 5. Empat file route/komponen besar dipecah

Reports (1167→470 baris), Client Detail (1227→350 baris), Commercial Detail (1206→581 baris), dan Pipeline (871→~430 baris) masing-masing dipecah jadi komponen section presentasional, logic state/query/mutation tetap di route. Ekstraksi murni — diverifikasi perilakunya sama persis di semua kasus, plus satu bug nyata ketemu dan dibenerin gak sengaja pas verifikasi Pipeline (filter status client yang 400 di setiap pilihan selain "all" gara-gara relasi embedded yang gak ke-select).

### 6. Fixture performa sintetis (anonymized)

Tooling baru khusus lokal (`scripts/seed-performance-fixture.ts`, `scripts/stage3-scale-benchmark.ts`) generate data sintetis skala ~10x production dan ukur kontrak lama (unbounded) vs kontrak baru (bounded) di skala itu. Konfirmasi risiko yang disebut di "Masalah" di atas BUKAN teori: di skala fixture ini, jumlah baris asli tiap kontrak unbounded udah lewat batas 1.000 baris PostgREST, jadi fetch unbounded di volume data segitu bakal diam-diam ngembaliin data gak lengkap, bukan cuma respons lambat. Lihat `2026-08-07-stage-3-scale-benchmark.md` buat angka lengkapnya.

## Hasil bersihnya

- Setiap route list sekarang nyaji halaman ter-paginasi cursor yang terbatas atau payload aggregate kecil, gak tergantung ukuran total tabel.
- Dashboard dan Reports baca dari RPC yang sama, jadi nunjukin angka yang sama buat fakta yang sama, by construction, bukan kebetulan.
- Fixture scale-benchmark ngasih cara yang bisa diulang, lokal, non-production buat nangkep regresi ke unbounded fetch di masa depan sebelum nyampe ke volume data production yang bakal bikin diam-diam salah.
- Sembilan migrasi diterapkan ke production (`qhtfixgbcpcitokeryxb`) sepanjang stage ini, masing-masing dengan approval eksplisit yang nyebutin target itu; tiap migrasi yang nambahin RPC punya test rekonsiliasi dan (kalau relevan) verifikasi browser langsung di production yang tercatat di entry todo bertanggal yang diringkas laporan ini.

## Yang belum dicakup Stage 3 (ditunda, dilacak terpisah)

- Enforcement performance budget formal — lihat `2026-08-07-stage-3-performance-budgets-proposal.md`, dokumen approval terpisah yang masih nunggu keputusan.
- Stage 4 (product intelligence: aggregate win/loss, metrik funnel/cycle-time) — belum dimulai.
- Bug batas bulan UTC `monthlyRevenueTrendInRange` di route Reports yang ke-flag sesi ini (`task_e57ef088`) — di luar scope Stage 3, dilacak sebagai background task sendiri.

## Yang butuh review kamu

- [ ] Konfirmasi ringkasan ini cocok sama pemahaman kamu soal apa yang udah jalan.
- [ ] Konfirmasi gak butuh verifikasi before/after lagi sebelum Stage 3 dianggap selesai (nunggu keputusan performance-budget di atas).
