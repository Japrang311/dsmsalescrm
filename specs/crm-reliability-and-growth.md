# Spec — CRM Reliability and Growth

Tanggal: 16 Oktober 2026 · Versi: 1.0 · Status: **Approved**.

Disetujui oleh pemilik produk melalui pesan "dokumen approved" pada 16 Oktober 2026.
Approval mencakup paket dokumen dan default D01–D08 sebagai baseline pengembangan.
Implementasi belum dimulai; approval ini tidak membuktikan acceptance criteria
lulus atau memberi izin otomatis untuk migration produksi, push, atau deployment.

[Ringkasan](../docs/crm-development-2026-10.md) ·
[Plan](../tasks/crm-reliability-and-growth-plan.md) ·
[Checklist](../tasks/crm-reliability-and-growth-todo.md)

## 1. Objective dan scope

Sales membutuhkan prioritas yang bisa ditindaklanjuti; Manager membutuhkan
exception yang dapat dipercaya; Executive membutuhkan metrik yang jelas scope-nya.
Perbaiki kebenaran angka dan transaksi lebih dahulu, lalu forecast dan repeat order.

In scope: konsistensi Reports/export, definisi nilai SO, koreksi SO atomik,
validasi lineage, forecast bertanggal, antrean exception, dan pilot repeat-order.
Reliability operasional serta evaluasi AI menjadi workstream pendukung.

Out of scope: pengakuan pendapatan akuntansi, piutang, payment collection,
persediaan/produksi, messaging otomatis, multi-team baru, perubahan role, rewrite,
atau penghapusan data historis. Invoice/payment hanya discovery lanjutan.

## 2. Baseline yang dipertahankan

- TanStack Start, React, TypeScript, Bun, TanStack Query, Supabase PostgreSQL.
  Versi aktual mengikuti `package.json`/`bun.lock`; tidak perlu dependency baru.
- Client merupakan pusat hubungan bisnis. Direct/repeat SO tanpa quotation tetap sah.
- Relasi quotation–SO saat ini maksimal 1:1; jangan diubah menjadi split-order.
- Prototype FOC tidak menambah nilai pencapaian. Pajak terpisah dari source flow.
- RLS dan validasi database menjadi batas akses, bukan sekadar kontrol form.
- Executive tetap read-only dan mengikuti batas agregat task yang sudah berlaku.
- Task, follow-up, audit, dan penanda pending SO yang ada harus digunakan ulang.
- Data produksi tidak diubah oleh penyusunan spec ini.

## 3. Requirements dan acceptance criteria

### R01 — Kontrak periode Reports

Semua KPI dan Top Customers di bagian berfilter menggunakan inclusive `from`/`to`
berbentuk calendar date, serta owner/client/tax/type/source yang sama. Pembilang
share pelanggan dan denominator total wajib berasal dari populasi yang sama.
Share top five tidak dinormalisasi menjadi 100%; denominator adalah seluruh
pelanggan yang lolos filter. FOC dan soft-delete mengikuti kontrak existing.

Chart yang sengaja menampilkan full-year harus memakai label tahun eksplisit,
penjelasan bahwa date range tidak berlaku, dan tidak menjadi denominator KPI
rentang. Default disetujui: gunakan range untuk seluruh bagian utama; trend tahunan
boleh tetap sebagai bagian terpisah. Funnel snapshot dan task compliance tidak
boleh tampak sebagai historis jika query hanya menghitung kondisi terkini.

Target D02: periode bulan kalender penuh memakai jumlah target bulan yang
sama, termasuk lintas tahun. Rentang parsial tidak memprorata target diam-diam;
tampilkan nilai SO saja dan persentase target `—`, dengan alasan. Filter client,
tax, type, atau source tidak punya target teralokasi: jangan membandingkan subset
tersebut dengan target tim tanpa label pembanding yang eksplisit; default sembunyikan
persentase. Target owner tetap mengikuti pemilik target yang sah.

Acceptance:

- **AC01:** Fixture pelanggan A Rp500 juta setahun, Rp20 juta bulan terpilih,
  total bulan Rp100 juta menghasilkan share 20%, bukan 500%.
- **AC02:** Range lintas tahun memakai transaksi dan target tahun terkait;
  range parsial menampilkan keterbatasan target. Label YTD hanya untuk YTD sebenarnya.
- **AC03:** Total nol menghasilkan share `—`, bukan NaN/Infinity. Error query
  tampil sebagai gagal memuat, bukan nol transaksi. Export memakai snapshot dan
  metadata filter yang sama; export diblokir bila bagian wajib belum siap.

### R02 — Definisi nilai SO

Label D01: `Nilai SO` atau `Pencapaian berdasarkan SO`, dengan tooltip:
nilai order berbayar yang tercatat, bukan konfirmasi pembayaran diterima.
Angka, tanggal, dan inclusion rule tidak berubah hanya karena label berubah.
Prototype `Paid` dijelaskan sebagai berbayar bila bukan status pelunasan.

- **AC04:** Dashboard, Reports, export, dan fakta/prompt AI tidak menyebut uang
  sudah diterima bila hanya memiliki nilai SO. Total sebelum/sesudah identik.
- **AC05:** Regular SO dan Prototype Paid mengikuti aturan nilai existing;
  Prototype FOC tetap nol kontribusi. Tidak menambah payment status palsu.

### R03 — Koreksi SO atomik dan dapat diaudit

Sediakan command database untuk edit header dan, pada slice berikutnya, perubahan
item SO. Setiap command menyimpan data dan audit dalam transaksi yang sama.
Actor berasal dari sesi; owner bukan actor. Validasi role/account-active,
ownership, nomor, date, tax/FOC, dan lineage dijalankan server-side.

Kontrak yang disetujui: `id`, `expectedUpdatedAt`, `requestId`, patch yang di-whitelist,
dan `reason` untuk koreksi material (client, owner, tanggal, nomor, nilai).
Kembalian berisi record terbaru dan identitas audit; nama RPC final diputuskan
setelah inspeksi schema. Bentuk input audit mentah tidak diterima dari browser.

Lock row sebelum validasi perubahan. Stale version ditolak dengan pesan reload;
jangan menimpa edit pengguna lain. Untuk item, lock parent dan pastikan setiap
perubahan item ikut memperbarui versi parent. Replay request ID yang identik
mengembalikan hasil tersimpan; payload berbeda dengan ID sama ditolak. Penyimpanan
deduplication berada di schema private, terbatas actor+command+request ID; tidak
dapat dibaca caller lain. Retensi minimal 30 hari sesuai D07; mekanismenya diverifikasi sebelum rollout.

Audit memuat actor, owner, entity ID, before/after terstruktur, reason, timestamp,
dan correlation/request ID. Data sensitif tidak masuk log browser.
Direct table writes tidak boleh melewati aturan yang sama: inventarisasi grants,
RLS, trigger, dan importer sebelum memilih pembatasan RPC atau trigger pengaman.
Audit yang tersimpan harus dapat ditemukan pada detail SO, walau feed global
existing sengaja memfilter jenis event tertentu.

- **AC06:** Kegagalan insert audit membatalkan perubahan SO dan total item.
- **AC07:** Dua update bersamaan: satu berhasil, yang stale ditolak; retry setelah
  respons hilang tidak menggandakan audit/perubahan. No-op tidak membuat audit palsu.
- **AC08:** Sales tidak mengubah data pengguna lain, Executive tidak menulis,
  inactive/null-role/anon ditolak. Manager/Super Admin mengikuti izin existing.
  Bypass direct API diuji; UI menampilkan hasil sebenarnya dan memuat ulang cache.

### R04 — Lineage Quotation–SO konsisten

Terapkan invariant pada create, manual link, dan correction. Sumber quotation
harus current, aktif, bertipe Quotation, Closed Won, client sama, serta dapat
diakses/ditautkan oleh actor. Satu quotation maksimal satu SO sesuai aturan existing.
Tidak menyamakan owner actor dengan owner bisnis. Reassignment tetap command tersendiri.

Keputusan D03: setelah linked, perubahan client pada salah satu sisi ditolak;
koreksi lintas client membutuhkan workflow terpisah, bukan unlink otomatis.
Revisi quotation yang sudah punya SO tetap mengikuti larangan existing.
Kebijakan soft-delete/restore existing harus diuji; jangan otomatis memakai ulang
link ke SO terhapus atau menandainya sebagai peluang baru.

- **AC09:** Create/link/edit menolak quotation client lain, superseded, deleted,
  belum Won, atau akses tidak sah; request UI yang dimanipulasi juga ditolak.
- **AC10:** Concurrent link/create tidak menghasilkan dua SO; perubahan client
  tidak meninggalkan pasangan lintas client. Direct repeat order tanpa link tetap bisa.
- **AC11:** Data historis yang melanggar invariant masuk laporan review dengan ID;
  tidak dihapus, dipindahkan, atau dikoreksi otomatis oleh migration.

### R05 — Forecast berdasarkan periode

Tambahkan `expected_close_date` nullable pada quotation: tanggal ekspektasi
PO/closing, bukan tanggal invoice/pembayaran. Field terpisah dari expired date dan
next follow-up. Keputusan D04: opsional pada tahap awal, wajib ketika masuk Commit
untuk transaksi baru; legacy tanpa tanggal diberi badge `Belum dijadwalkan`.
Perubahan tanggal memakai command tervalidasi dan audit old/new agar pergeseran
bisa dihitung. Salinan revisi membawa tanggal sebagai draft yang bisa dikonfirmasi.

Untuk satu periode: `forecast nilai SO = nilai SO tercatat dalam periode + nilai
pipeline open terbobot yang expected_close_date-nya dalam periode`.
Bobot awal tetap existing; jangan mengklaimnya probabilitas empiris.
Periode historis tidak boleh menampilkan current pipeline sebagai forecast masa
lalu. Label eksplisit `snapshot saat ini`, dengan fetchedAt, untuk forecast aktif.

Won tanpa SO ditampilkan sebagai **backlog terpisah**, tidak otomatis ditambahkan
ke angka forecast utama. Ini menghindari asumsi nilai/tanggal SO sama dengan quotation.
Tidak ada auto-create SO, rollback Closed Won, atau penghitungan ulang Won sebagai
open pipeline. Dokumen tanpa tanggal dan overdue closing mempunyai bucket sendiri.

- **AC12:** Deal di luar periode, Closed Lost, Closed Won, superseded/deleted,
  dan tanpa tanggal tidak menambah open forecast periode tersebut.
- **AC13:** Mengubah expected date memindahkan bucket dan merekam pergeseran;
  total bisa ditelusuri ke daftar quotation dan bobotnya, di bawah RLS.
- **AC14:** Backlog Won tanpa SO reuse indikator Pipeline; unknown/loading link
  tidak dianggap pasti unlinked. Membuat/menautkan SO menghapus exception setelah refresh.

### R06 — Antrean tindakan berbasis exception

Perluas Tasks/Dashboard, tidak membuat sistem task kedua. Kandidat: Won tanpa SO,
closing lewat, quotation hampir expired, deal stagnan, dan repeat terlambat.
Rule ID dan alasan selalu terlihat; score tersembunyi/AI ranking bukan MVP.

Urutan D06: overdue commitment/Won pending, closing/expiry dekat, repeat
terlambat, lalu stagnan; tie-break due date, nilai diketahui, entity ID stabil.
Threshold awal yang disetujui: expiry <=7 hari kalender; stagnan >=14 hari tanpa progress
bermakna. Tanggal source yang hilang menghasilkan `Data belum cukup`.
Progress bermakna adalah stage transition atau follow-up dengan hasil; edit metadata
dan sekadar membuat task tidak otomatis mereset aging. Waktu Won memakai event
stage yang valid, bukan `updated_at` generik; data legacy tanpa event tidak diberi usia palsu.

Setiap row: client, owner, jenis sinyal, alasan, tanggal dasar, nilai bila ada,
source link, dan aksi membuka/mencatat follow-up. Dedupe entity+rule; gabungkan
sinyal pada tampilan entity. Membuat follow-up memeriksa task aktif terkait agar
retry tidak menduplikasi. Tidak mengirim pesan eksternal otomatis.
Snooze eksplisit sampai tanggal tertentu dengan reason tidak mengubah status bisnis;
event baru yang material dapat memunculkan kembali sinyal sesuai aturan terdokumentasi.

- **AC15:** Source dapat dibuka oleh role yang sama; sales tidak melihat owner lain,
  Executive hanya agregat yang diizinkan. Semua count server-side, bukan hanya page dimuat.
- **AC16:** Aksi menggunakan flow existing; record outcome+next action tetap atomik
  sesuai kontrak follow-up. Resolve/retry/refresh tidak menggandakan task atau sinyal.
- **AC17:** Empty, loading, query-error, data-insufficient, dan snoozed berbeda;
  pagination stabil dan tidak mengambil seluruh histori untuk menghitung count.

### R07 — Pilot kesehatan repeat order

MVP menggunakan transaksi SO aktif non-FOC bernilai positif, berdasarkan business
date dan client. Agregasi semua SO client pada tanggal sama menjadi satu kejadian
order agar split administrasi tidak menghasilkan interval nol. Data sesudah
asOfDate dikeluarkan; source flow tidak membatasi karena tujuan mengukur hubungan
pelanggan. Owner signal mengikuti owner client saat ini, tanpa mengubah atribusi
SO historis. Role hanya memakai data yang sah dilihat; histori parsial diberi label.

Default pilot D05: perlu >=4 tanggal order berbeda dalam 365 hari sebelum/asOfDate,
sehingga tersedia >=3 interval. Cadence = median selisih hari kalender antarorder.
Terlambat jika hari sejak order terakhir > max(1,5 × median, median + 7).
Ini heuristik pilot, bukan prediksi churn. Pelanggan Lost/Dormant dikeluarkan
dari antrean default dan tetap dapat ditinjau melalui filter; tidak diubah statusnya.
Perubahan ambang adalah versi aturan baru; tampilkan versi pada hasil dan export.

Tampilkan tanggal order terakhir, jumlah sampel, median interval, hari sejak order,
ambang, dan alasan. Kurang sampel → `Data belum cukup`. Pelanggan musiman/proyek
bisa dikecualikan dengan reason oleh role mutating berwenang, bukan dianggap gagal.
Jangan auto-create task sebelum sales memilih tindak lanjut.

- **AC18:** Dataset kecil, same-day multiple SO, FOC, deleted, future dates,
  ownership transfer, dan histori terbatas memiliki hasil deterministik.
- **AC19:** Tidak ada label berisiko tanpa sample minimum; alasan bisa dihitung
  ulang dari transaksi yang sah. Tidak ada nomor/nama client lain bocor.
- **AC20:** Sales dapat membuka client dan follow-up; feedback relevan/tidak relevan
  disimpan untuk pilot dengan actor/rule version. Tidak menimpa status client.

Penurunan pembelian, konsentrasi top customer, dan riwayat produk/harga masuk
backlog C berikutnya: perlu definisi periode sebanding, identitas produk, serta
sumber harga sebelum dijadikan fitur. Tidak termasuk acceptance MVP AC18–20.

### R08 — Reliability dan AI

- **AC21:** Sebelum migrasi produksi ada backup sesuai mekanisme proyek aktual dan
  uji restore ke lingkungan terisolasi. Catat waktu backup, waktu pemulihan,
  kehilangan data terukur, schema/data reconciliation, serta berkas Storage bila dipakai.
  Target RPO/RTO mengikuti D07 dan masih harus dibuktikan; jangan menyatakan backup tersedia dari dokumen lama.
- **AC22:** CI mencakup regression bisnis yang relevan; deployment tidak dinyatakan
  lulus hanya karena typecheck hijau. Rilis lama tetap dapat berjalan pada migration
  additive sampai consumer baru diverifikasi; rollback app tidak dianggap rollback data.
- **AC23:** Sebelum perluasan pilot AI, evaluasi keluaran model pada dataset tersanitasi:
  angka exact, periode benar, tidak menyimpulkan pembayaran dari SO, tidak membocorkan
  detail role, menangani missing data dan prompt injection. Target yang disetujui: nol
  kesalahan angka/akses pada set release; kegagalan menahan ekspansi. Unit prompt
  test saja tidak memenuhi AC ini. AI tetap tidak menulis data bisnis.

## 4. Kontrak arsitektur dan migrasi

Shared types yang direncanakan (contoh gaya TypeScript; bukan kode yang sudah diterapkan):

```ts
type MetricScope = {
  from: string;
  to: string;
  ownerId?: string;
  clientId?: string;
  taxType?: string;
  soType?: string;
  source?: string;
};

type MetricContext = {
  scope: MetricScope;
  basis: "sales-order-value";
  fetchedAt: string;
  targetComparable: boolean;
};
```

Validasi dates/enum memakai Zod pada boundary dan pemeriksaan database. Jangan
menerima nilai total/actor dari browser sebagai kebenaran. Gunakan numeric database
untuk uang; pembulatan mengikuti kontrak existing. UI dan export memakai hasil yang
sama, query key menyertakan seluruh filter. Error tidak ditukar menjadi angka nol.

Adapter di `src/lib/data/`; pure rules di `src/lib/`; UI pada components domain;
route sebagai orchestration. Jalur baru menggunakan pagination dan aggregate RPC
dengan izin setara endpoint existing. Jangan memakai SECURITY DEFINER untuk
melewati masalah akses; bila diperlukan, pin search_path dan revoke PUBLIC/anon
execute, dengan actor/role checks eksplisit serta negative tests.

Rencana data: additive expected-close field; command audit/version/deduplication;
penyimpanan feedback/snooze sesuai scope yang disetujui. Inventarisasi schema terlebih
dahulu; nama/timestamp migration final dibuat saat implementasi. Backfill tidak
menebak tanggal closing, pembayaran, atau timestamp Won. Legacy exception tetap
terlihat dengan coverage count dan daftar review berizin.

## 5. Struktur, commands, dan pengujian

| Lokasi                                                       | Tanggung jawab                                       |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `src/routes/`                                                | Integrasi halaman existing                           |
| `src/components/reports/`, `tasks/`, `pipeline/`, `clients/` | Presentasi domain                                    |
| `src/lib/data/`, `src/lib/ai/`                               | Adapter, rules, summary facts                        |
| `supabase/migrations/`, `supabase/tests/`                    | Schema/command/RLS dan bukti database                |
| `e2e/browser-flows.spec.ts`                                  | Alur browser existing; tambah spec domain bila perlu |
| `docs/`, `specs/`, `tasks/`                                  | Evidence, requirement, tracking                      |

Commands implementasi dari root repo:

```sh
bun run dev
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run smoke:runtime
bun run stage3:check-budgets
```

`bun run test` memakai `.env.local`: pastikan seluruh endpoint test menuju LOCAL
Supabase sebelum menjalankan integration tests yang menulis fixture. Jangan
menggunakan kredensial produksi untuk tes. `bun run verify:db` me-reset database
lokal dan hanya dijalankan pada instance test disposable; tidak dijalankan selama
penyusunan dokumen. `bun run test:e2e` juga membutuhkan local fixtures/browser.

Gaya: TypeScript strict sesuai repo, pure selector untuk aritmetika, bahasa UI
Indonesia, formatter repository, modul sesuai domain. Jangan mengedit route tree
generated. Pisahkan refactor dari perubahan aturan; jangan menambah framework.

| Lapisan              | Bukti wajib                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| Pure unit            | AC01–05, AC12–13, AC18–19 dan edge cases tanggal/FOC                          |
| Database integration | AC06–11, invariant, locking, rollback, direct API bypass, RLS                 |
| Adapter/UI           | Query key, scope, error/loading, cache invalidation, replay semantics         |
| Browser              | Custom range+export, edit konflik, pending SO resolved, follow-up dari signal |
| Operasional          | AC21–22: restore terisolasi, CI, deployment dan production smoke terpisah     |
| AI eval              | AC23 pada output model; fixture sintetis tanpa data produksi pribadi          |

## 6. Boundaries

Always: verifikasi source terkini, pertahankan pekerjaan pengguna, gunakan local
fixtures, jaga RLS, audit mutation material, dan lampirkan bukti per acceptance.

D01–D08 sudah diterima. Keputusan tambahan diperlukan untuk perubahan dari
baseline tersebut, dependency/CI baru di luar scope, dan akses remote yang belum diizinkan.
Persetujuan implementasi lokal bukan izin otomatis migration produksi. Remote
Supabase memerlukan otorisasi target proyek sesuai aturan repository; push/deploy
juga harus berada dalam scope yang diminta pengguna.

Never: mengubah revenue menjadi cash tanpa model Finance, menebak histori, membuka
izin Executive untuk memudahkan UI, menyimpan secrets di dokumen, mengirim pesan
ke pelanggan otomatis, menimpa `tasks/plan.md`/`tasks/todo.md` historis, atau menganggap
approval dokumen sebagai bukti implementasi atau deployment selesai.

## 7. Decision register

Seluruh default D01–D08 **Accepted**, disetujui pemilik produk pada 16 Oktober 2026
melalui pesan "dokumen approved". Alasan keputusan mengikuti requirement terkait
dan ADR-005. Target D07 adalah persyaratan yang harus dibuktikan, bukan hasil
pengukuran recovery saat ini.

| ID  | Pilihan diterima                                                            | Dampak jika berubah                   | Gate                  |
| --- | --------------------------------------------------------------------------- | ------------------------------------- | --------------------- |
| D01 | Label Nilai SO; rumus lama tetap                                            | Copy, export, AI facts                | R02                   |
| D02 | Range utama konsisten; target hanya bulan penuh dan scope sebanding         | Perhitungan target dan UX             | R01                   |
| D03 | Client pada dokumen linked terkunci; koreksi khusus terpisah                | Command correction/legacy remediation | R03–04                |
| D04 | Expected close wajib saat Commit baru; Won backlog terpisah                 | Schema/validasi/forecast              | R05                   |
| D05 | >=4 tanggal order/365 hari; median dan ambang yang dijabarkan di R07        | Hasil pilot repeat-order              | R07                   |
| D06 | Prioritas rule deterministik; expiry 7 hari, stagnan 14 hari                | Antrean/feedback/snooze               | R06                   |
| D07 | RPO <=24 jam, RTO <=4 jam, harus dibuktikan; retensi replay minimal 30 hari | Biaya/infrastruktur/operasi           | Migrasi produksi R03+ |
| D08 | AI tetap pilot sampai output eval lulus; Finance hanya discovery            | Scope tahap D                         | R08/lanjutan          |

Perubahan keputusan berikutnya wajib mencatat ID, pilihan baru, alasan, pemberi
keputusan, tanggal, serta requirement/test yang terdampak. Jangan meminta approval
ulang atas default yang sama; temuan yang mengubah scope dicatat untuk review.

## 8. Source evidence

- [Periode Reports](../src/routes/_app.reports.tsx) dan
  [share](../src/components/reports/ReportsPerformanceSection.tsx).
- [Nilai SO](../src/lib/data/dashboard-selectors.ts) dan [PRD](../PRD.md).
- [Edit SO](../src/routes/_app.sales-orders.$soId.tsx) dan
  [adapter](../src/lib/data/sales-orders.ts).
- [Manual link RPC](../supabase/migrations/20260930092216_add_manual_sales_order_quotation_link.sql).
- [Forecast weights](../src/lib/data/commercial-stages.ts).
- [Pending SO existing](../src/components/pipeline/PipelineBoard.tsx).
- [Target per tahun](../src/lib/data/targets.ts).
- [Production runbook](../docs/production-runbook.md).

Inspeksi source bukan bukti schema produksi sama dengan lokal. Keberadaan migration
tidak membuktikan sudah diterapkan remote.
