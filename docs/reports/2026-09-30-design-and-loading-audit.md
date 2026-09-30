# Audit Desain & Loading — DSM Sales CRM

Tanggal: 2026-09-30 · Basis: build produksi (`bun run build`) + inspeksi visual di `localhost:8080` dengan data seed lokal.

---

## Ringkasan

Desainnya **tidak bermasalah secara visual** — tema "DSM Precision" koheren, tipografi Manrope enak dibaca,
palet industrial konsisten, token warna rapi. Yang bikin aplikasi **terasa berat bukan desainnya, tapi
tiga hal teknis** yang semuanya bisa diperbaiki tanpa mengubah tampilan:

1. Setiap halaman mengunduh kode export PDF/Excel yang belum tentu dipakai.
2. Halaman baru muncul setelah **semua** query selesai — bukan bertahap.
3. Empat halaman terberat memakai teks "Loading…" polos, bukan kerangka (skeleton).

---

## 1. Berat loading — angka nyata

JS yang harus diunduh & dijalankan sebelum satu halaman bisa tampil (hasil build produksi):

| Halaman          | Chunk |       Mentah | Terkompresi (gzip) |
| ---------------- | ----: | -----------: | -----------------: |
| **Dashboard**    |    55 | **2.049 KB** |         **623 KB** |
| **Reports**      |    60 |     2.127 KB |             645 KB |
| **Sales Orders** |    48 |     1.648 KB |             520 KB |
| Pipeline         |    61 |       998 KB |             310 KB |
| Clients          |    52 |       969 KB |             301 KB |
| Login            |    17 |       620 KB |             187 KB |

Anggaran wajar untuk aplikasi internal: **±300–400 KB gzip**. Dashboard sekarang **1,5–2× di atas itu**.

### Penyebabnya: 4 pustaka besar ikut terunduh walau belum diklik

Ditelusuri dari isi chunk Dashboard:

| Pustaka                    |       Ukuran | Dipakai kapan                      |
| -------------------------- | -----------: | ---------------------------------- |
| `recharts` (ComposedChart) |       412 KB | saat grafik digambar               |
| `jspdf`                    |       390 KB | **hanya saat klik "Export PDF"**   |
| `xlsx` (SheetJS)           |       324 KB | **hanya saat klik "Export Excel"** |
| `jspdf-autotable`          |       104 KB | **hanya saat klik "Export PDF"**   |
| **Total**                  | **1.230 KB** | **60% dari bobot Dashboard**       |

Sebabnya di kode: modul export diimpor secara statis di file route, jadi ikut terbundel dari awal.

```
src/routes/_app.dashboard.tsx:13      import { exportDashboardPdf } from "@/lib/export-pdf"    -> jspdf
src/routes/_app.dashboard.tsx:26      import { ... } from "@/lib/export-xlsx"                   -> xlsx
src/routes/_app.reports.tsx:56-57     export-xlsx + export-pdf
src/routes/_app.sales-orders.index.tsx:76   export-sales-orders                                 -> xlsx + jspdf
src/routes/_app.activity.tsx:71       export-activity                                           -> jspdf
```

**Perbaikan:** ubah jadi dynamic import di dalam handler tombol (`await import("@/lib/export-pdf")`),
dan `lazy()` untuk komponen grafik. Perkiraan hasil: **Dashboard turun ±60%, dari 623 KB ke ±200 KB gzip.**
Tidak ada perubahan tampilan sama sekali.

### Catatan: font sudah benar

`@fontsource-variable/manrope` mendeklarasikan 6 subset, tapi tiap subset punya `unicode-range`,
jadi browser hanya mengunduh latin + latin-ext (±40 KB) dan sudah `font-display: swap`. **Tidak perlu diubah.**

---

## 2. Render "semua atau tidak sama sekali"

Dashboard dan Reports menahan seluruh halaman di balik rantai `isLoading`:

- `src/routes/_app.dashboard.tsx:247-253` — 4 query digabung
- `src/routes/_app.reports.tsx:499-514` — **11 query digabung**

Artinya: satu query paling lambat menahan _seluruh_ halaman. Angka KPI yang sudah siap dalam 200 ms
tetap tidak tampil karena menunggu grafik funnel yang butuh 3 detik.

**Perbaikan:** render per-bagian. KPI muncul begitu datanya siap; tiap kartu grafik punya skeleton sendiri.
Ini perubahan yang paling besar efeknya pada _rasa_ cepat, walaupun total waktu muat sama.

---

## 3. Loading state tidak konsisten

Sudah ada komponen `PageSkeleton` (`src/components/layout/PageSkeleton.tsx`) yang bagus, tapi baru dipakai
di 3 halaman. Empat halaman lain jatuh ke teks polos di tengah kotak putus-putus:

| Halaman                    | Sekarang                   |
| -------------------------- | -------------------------- |
| Dashboard, Tasks, Pipeline | ✅ `PageSkeleton`          |
| **Sales Orders** (`:276`)  | ❌ "Loading sales orders…" |
| **Reports** (`:514`)       | ❌ "Loading reports…"      |
| **Clients** (`:422`)       | ❌ "Loading clients…"      |
| **Client detail** (`:115`) | ❌ "Loading client…"       |

Terlihat langsung saat diuji: membuka Sales Orders menampilkan halaman kosong dengan satu baris teks
selama beberapa detik, lalu konten muncul mendadak — persis sensasi "berat" yang dirasakan.

---

## 4. Animasi — memang kurang

Inventaris motion saat ini:

- `precision-enter` (fade + geser 4px, 180 ms) sudah didefinisikan di `styles.css:294` tapi **dipakai satu kali saja**, di `FilterBar.tsx:56`.
- `animate-in` / `animate-out` semuanya bawaan shadcn (dialog, dropdown) — bukan pilihan desain.
- `transition-colors` 26×, dipakai wajar untuk hover.

Jadi konten halaman **muncul mendadak tanpa transisi**. Menambahkan reveal bertahap bukan sekadar hiasan —
ini menutupi jeda muat dan membuat aplikasi terasa jauh lebih ringan.

**Usulan (hemat, sesuai karakter "Precision", dan sudah ada fondasinya):**

- Pakai ulang `precision-enter` untuk kartu KPI dengan `animation-delay` bertingkat 40 ms — satu gelombang
  reveal singkat (total < 300 ms), bukan animasi di mana-mana.
- Transisi angka KPI (count-up singkat) pada metrik utama saja.
- Bar "Achievement" di tabel Sales Performance: isi bar dianimasikan dari 0 ke nilainya.
- `@media (prefers-reduced-motion)` sudah ditangani di `styles.css:334` — otomatis aman.

---

## 5. Temuan desain (kecil, opsional)

Dari inspeksi visual Dashboard:

- **Hierarki terbalik.** Enam kartu KPI sekunder (Pipeline Win Rate, Revenue Source YTD, dst.) punya bobot
  visual setara dengan kartu capaian utama, tapi letaknya di bawah lipatan layar.
- **Bar "Achievement" terlalu tipis** di tabel Sales Performance — nyaris tak terbaca sebagai grafik.
- **Kartu "Prioritas tindak lanjut" saat kosong** menyisakan kotak besar kosong; empty state-nya bisa lebih
  padat dan menawarkan aksi.
- **Banner peringatan kalender** menempati posisi teratas, di atas KPI utama — cocok dipindah ke bawah header
  atau dibuat bisa ditutup.

Ini semua selera/prioritas produk, bukan cacat. **Tiga dari empat dikerjakan menyusul —
lihat "Penyesuaian hierarki Dashboard" di bawah.**

---

## Prioritas yang saya sarankan

| #   | Perbaikan                         | Dampak                     | Risiko     | Tampilan berubah?        |
| --- | --------------------------------- | -------------------------- | ---------- | ------------------------ |
| 1   | Lazy-load export PDF/Excel        | −818 KB per halaman        | Rendah     | Tidak                    |
| 2   | Lazy-load grafik recharts         | −412 KB                    | Rendah     | Tidak (skeleton sekejap) |
| 3   | Skeleton di 4 halaman yang kurang | Rasa cepat                 | Rendah     | Ya, ke arah lebih baik   |
| 4   | Render bertahap Dashboard/Reports | Rasa cepat (paling terasa) | **Sedang** | Ya                       |
| 5   | Animasi reveal + count-up         | Polesan                    | Rendah     | Ya                       |
| 6   | Penyesuaian hierarki Dashboard    | Selera                     | Rendah     | Ya                       |

Nomor 1–3 adalah pekerjaan mekanis dengan hasil terukur. Nomor 4 menyentuh logika render halaman —
perlu pengujian lebih hati-hati.

---

## Hasil implementasi (2026-09-30)

Perbaikan 1–5 dikerjakan; penyesuaian desain (bagian 5) ditunda atas permintaan.

### Bobot JS per halaman — sebelum → sesudah

| Halaman                    |                    Mentah |                    Gzip |
| -------------------------- | ------------------------: | ----------------------: |
| **Dashboard**              | 2.049 → **892 KB** (−56%) | 623 → **279 KB** (−55%) |
| **Reports**                | 2.127 → **950 KB** (−55%) | 645 → **297 KB** (−54%) |
| **Sales Orders**           | 1.648 → **905 KB** (−45%) | 520 → **283 KB** (−46%) |
| Clients / Pipeline / Login |             tidak berubah |           tidak berubah |

Ketiga halaman terberat kini di bawah anggaran ±300 KB gzip.

### Yang diubah

**Lazy-load export** — `jspdf`, `jspdf-autotable`, dan `xlsx` dipindah ke dynamic import di dalam
handler tombol. `runExport` di Dashboard kini `async`; `handleExport` di Reports/Sales Orders/Activity
sudah async sejak awal. Loading toast yang sudah ada menutupi jeda pengunduhan modul, jadi tidak ada
UI tambahan. Diverifikasi di browser: `jspdf` dan `xlsx` **0 request** saat Dashboard dimuat, dan
kedelapan fungsi export tetap resolve lewat jalur dynamic import.

**Lazy-load grafik** — `AchievementTrendChart`, `ReportsTrendCharts`, dan `ReportsForecastSection`
dibungkus `React.lazy` + `Suspense`, dengan placeholder baru `ChartCardSkeleton` yang menahan tinggi
slot supaya layout tidak melompat.

**Skeleton konsisten** — `PageSkeleton` mendapat varian `"table"`, plus `TableRowsSkeleton` untuk
halaman yang header dan filternya sudah tampil (Clients) sehingga kontrol tetap bisa dipakai saat
baris dimuat. Empat halaman yang sebelumnya menampilkan teks polos kini memakai skeleton.

**Render bertahap**

- Dashboard: gerbang halaman tinggal `isLoading` data inti. Tiga query metrik kini menahan bagiannya
  sendiri, jadi daftar follow-up dan grafik tren langsung tampil.
- Reports: rantai 11 query dipecah jadi gerbang inti (`metricsQuery`) + tiga gerbang per-bagian
  (tren, performance, product intelligence). KPI dan filter bisa dipakai saat 6 RPC analitik masih jalan.

Bagian yang masih memuat sengaja menampilkan skeleton, bukan Rp0 — semua nilai turunan memakai
fallback `?? 0`, jadi merender lebih awal akan menampilkan angka yang salah sesaat.

**Animasi** — `precision-stagger` ditambahkan di `styles.css` (memakai ulang keyframe `precision-enter`
yang sudah ada): anak elemen muncul berurutan 40 ms, total di bawah 300 ms. Dipakai di tiga kelompok
kartu KPI. `KpiProgress` kini tumbuh dari 0 saat mount. Hook baru `useCountUp` menganimasikan dua angka
utama Dashboard saja, agar ada satu titik fokus. Semuanya otomatis mati saat `prefers-reduced-motion`
aktif — `useCountUp` mengembalikan nilai akhir langsung, dan aturan di `styles.css:334` menangani CSS.

### Verifikasi

| Cek                       | Hasil                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| `bun run typecheck`       | lolos                                                                   |
| `bun run lint`            | lolos                                                                   |
| `bun run test`            | 711 lolos, 0 gagal                                                      |
| `bun run test:e2e`        | 12 lolos (termasuk uji unduh export Dashboard)                          |
| `bun run build`           | lolos                                                                   |
| Browser (data seed lokal) | 6 halaman dirender; Reports menampilkan seluruh 18 bagian dan 10 grafik |

### Catatan sampingan (tidak disentuh)

`src/components/ui/chart.tsx` adalah komponen shadcn yang mengimpor recharts secara statis tetapi
**tidak dipakai di mana pun**. Karena tidak ada yang mengimpornya, ia tidak masuk bundle — jadi bukan
masalah performa, hanya file mati. Dibiarkan sesuai aturan repo soal dead code lama.

---

## Penyesuaian hierarki Dashboard (2026-09-30, menyusul)

Arah yang dipilih: **bobot visual + urutan aksi-dulu**, plus dua temuan kecil.

### Urutan halaman — sebelum → sesudah

| Sebelum                                    | Sesudah                                       |
| ------------------------------------------ | --------------------------------------------- |
| 1. Header                                  | 1. Header                                     |
| 2. **Banner kalender**                     | 2. **Capaian (hero)**                         |
| 3. Capaian (hero)                          | 3. Banner kalender                            |
| 4. Prioritas tindak lanjut \| Tren capaian | 4. **Ringkasan operasional** (Overdue duluan) |
| 5. Ringkasan operasional (5 kartu)         | 5. **Prioritas tindak lanjut** (lebar penuh)  |
| 6. Sales Performance                       | 6. Tren capaian (lebar penuh)                 |
|                                            | 7. Sales Performance                          |

Dasarnya: halaman ini dibuka untuk menjawab dua hal — "apakah saya on target?" (hero) dan
"apa yang harus saya kerjakan hari ini?" (overdue + daftar follow-up). Keduanya kini di atas lipatan
layar. Grafik tren adalah analisis, bukan aksi, jadi turun ke bawah.

### Yang berubah

**Banner kalender turun ke bawah hero.** Sebelumnya peringatan kelengkapan data menempati posisi
teratas, di atas angka yang menjadi alasan halaman ini ada. Sekarang ia berada tepat di bawah angka
yang dikualifikasinya — tetap terbaca, tapi tidak lagi mengalahkan hero. Komponennya sendiri tidak
disentuh (masih dipakai halaman Tasks).

**Lima kartu KPI jadi baris stat.** Komponen baru `OperationalStats` menggantikan lima `KpiCard`
berbingkai dengan sel bergaris-atas tanpa kartu. Lima kartu putih terbaca sebagai sederajat dengan
blok hero; garis + tipografi membuatnya jelas sekunder tanpa mengurangi keterbacaan. Urutannya kini
menurut seberapa mendesak: **Overdue Follow-Ups → Open Tasks → Win Rate → Revenue Source → Prototype**.

**`KpiCard` dihapus.** Ternyata komponen ini hanya dipakai di Dashboard, 5 kali, semuanya `compact` —
varian ukuran penuhnya sudah mati sejak lama. Karena perubahan inilah yang membuatnya tak terpakai,
ia dihapus sesuai aturan repo soal orphan. `KpiProgress` (masih dipakai `DashboardOverview`) pindah ke
`KpiProgress.tsx` supaya nama berkas sesuai isinya.

**Bar Achievement dipertebal.** Di `SalesPerformanceTable`: tinggi 6px → 8px, lebar 96px → 112px, dan
warna track dinaikkan dari `bg-border/60` ke `bg-border`. Sekarang terbaca sebagai grafik, bukan garis rambut.

**Empty state follow-up dipadatkan.** Override `py-10` dilepas (kembali ke `py-6` bawaan `EmptyState`),
dan ditambah tautan "Buka daftar task". `EmptyState` mendapat prop opsional `action` — lapisan yang
tepat untuk memuat langkah berikutnya, karena di situlah pengguna diberi tahu harus ke mana.

### Verifikasi

| Cek                    | Hasil                                              |
| ---------------------- | -------------------------------------------------- |
| `bun run typecheck`    | lolos                                              |
| `bun run lint`         | lolos                                              |
| `bun run test`         | 711 lolos, 0 gagal                                 |
| `bun run test:e2e`     | 12 lolos                                           |
| Browser desktop 1440px | urutan DOM sesuai rencana, 5 sel stat, bar 8×112px |
| Browser mobile 375px   | grid stat 2 kolom, hero tetap dominan              |

---

## Migrasi warna amber ke token semantik (2026-09-30, menyusul)

Pemicunya satu komponen (`CalendarIncompleteWarning`), tetapi penelusuran menemukan **24 pemakaian
`amber-*` di 13 berkas** dengan tiga makna berbeda. Mengganti semuanya secara membabi buta akan
merusak sebagian, jadi dipilah dulu.

### Yang dikonversi

**Callout dan badge peringatan** — maknanya memang _warning_:
`CalendarIncompleteWarning`, banner filter di Clients, banner deleted-mode di Sales Orders, ikon
Risk Alerts, penanda "jatuh tempo hari ini" di Commercial Views, dwell "masih berjalan", item menu
arsip di ClientsTable, dan badge `bg-amber-100` di tiga berkas Sales Order/Commercial.

Pemetaan: `bg-amber-50/100` → `bg-warning/10`, `border-amber-200/300` → `border-warning/30`,
`text-amber-700/800/900` → `text-warning`, `bg-amber-500` → `bg-warning`.

**Triad lampu-lalu-lintas** — sibling-nya ikut dikonversi, karena mengganti amber saja akan
membuat satu warna tampak beda bobot di dalam satu set:

- `RISK_STYLES` + `RiskDot`: emerald/amber/rose → `success`/`warning`/`destructive`, Unknown → `muted`
- Achievement di `ReportsPerformanceSection`: emerald/amber/red → `success`/`warning`/`destructive`
- Titik timeline `PipelineCardDrawer`: amber/emerald → `warning`/`success` (primary sudah token)
- `STATUS_STYLES`/`STATUS_DOT` klien: Active→`success`, Dormant→`warning`, Lost→`muted`

**API `tone` di `ReportPrimitives`** dinamai menurut warna (`"emerald" | "amber"`). Diganti jadi
`"success" | "warning"` di 14 call site pada 6 berkas — nama prop tidak lagi mengunci implementasi
ke satu warna.

### Yang sengaja tidak disentuh

| Lokasi                                       | Alasan                                                                                                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_app.activity.tsx:182` (`ACCENT`)           | Skala **11 warna kategorikal** (cyan/blue/sky/violet/teal/indigo/rose/orange/slate/emerald/amber). Mengubah satu jadi `bg-warning` berarti menyatakan "perubahan status = peringatan", yang tidak benar. Tidak ada token 11-nilai. |
| `_app.activity.tsx:115` (`KIND_META`)        | Sama — pasangan dari `ACCENT`.                                                                                                                                                                                                     |
| `SourceRow` `tone="emerald"` di Sales Orders | Skala kategorikal (New Product/Existing/Prototype), bukan semantik. Sempat ikut terganti oleh sed lalu **dikembalikan**.                                                                                                           |
| `STATUS_STYLES.Prospect` (sky)               | "Baru, belum dinilai" tidak punya token; `muted` dan `primary` sudah dipakai Lost dan Repeat Order.                                                                                                                                |

### Verifikasi kontras (diukur, bukan diperkirakan)

Rasio dihitung dari nilai oklch token, lalu diperiksa ulang pada elemen yang benar-benar dirender
(warna dinormalisasi lewat canvas, latar translusen dikomposit berlapis).

| Kombinasi                                            |  Rasio | AA (4.5:1) |
| ---------------------------------------------------- | -----: | :--------: |
| `text-warning` di `bg-warning/10` atas kartu         | 4.98:1 |   lolos    |
| `text-success` di `bg-success/10` atas kartu         | 4.75:1 |   lolos    |
| `text-destructive` di `bg-destructive/10` atas kartu | 5.75:1 |   lolos    |
| Badge "Active Customer" **terukur di browser**       | 4.70:1 |   lolos    |

Audit kontras otomatis atas seluruh teks pada Dashboard, Clients, Client detail, dan Sales Orders:
**0 kegagalan**.

Catatan: `text-success` di atas tint turun ke 4.36:1 bila latarnya background halaman, bukan kartu
putih. Pada aplikasi ini badge terisi hanya dirender di dalam kartu (baris tabel memakai varian
titik yang transparan), jadi kasus itu tidak terjadi — terkonfirmasi pada pengukuran 4.70:1 di atas.

### Temuan pre-existing (di luar lingkup, tidak diubah)

~~Halaman Reports punya 3 label legend grafik di bawah AA.~~ **Diperbaiki — lihat bagian berikutnya.**

Dark mode belum terpasang (tidak ada toggle maupun provider yang menambahkan kelas `.dark`), jadi
blok token `.dark` di `styles.css` masih belum terpakai. Hitungan dark mode menunjukkan
`text-destructive` di atas tint hanya 3.99:1 — perlu ditinjau kalau dark mode nanti diaktifkan.

---

## Perbaikan warna legend grafik Reports (2026-09-30, menyusul)

### Diagnosis

Warna serinya **tidak salah**. Recharts memakai warna seri untuk dua hal sekaligus: swatch dan teks
label. Sebagai elemen grafis, ambang AA hanya 3:1 — dan garis/batangnya lolos:

| Warna seri                  | Sebagai garis/batang (butuh 3:1) | Sebagai teks 10–11px (butuh 4.5:1) |
| --------------------------- | -------------------------------: | ---------------------------------: |
| `CHART_COLORS[2]` `#C97716` |                     3,42:1 lolos |                   3,42:1 **gagal** |
| `--color-border-strong`     |     2,14:1 — batang besar, wajar |                   2,14:1 **gagal** |

Jadi menggelapkan warna seri justru salah sasaran: itu akan mengubah tampilan grafik (dan
`--color-border-strong` memang sengaja pucat sebagai batang referensi target) demi memperbaiki teks.

### Perbaikan

Memisahkan warna teks dari warna seri lewat helper baru `src/components/charts/chart-legend.tsx`:

```tsx
<Legend wrapperStyle={{ fontSize: 11 }} formatter={legendLabel} />
```

Swatch tetap memakai warna seri sebagai penanda data; labelnya memakai `--color-foreground`.
Tidak ada warna grafik yang berubah.

### Hasil (diukur di browser)

| Label                   | Sebelum |    Sesudah |
| ----------------------- | ------: | ---------: |
| Achievement             |  5,17:1 | **13,3:1** |
| Target (kumulatif)      |  3,42:1 | **13,3:1** |
| Target (bulanan)        |  2,14:1 | **13,3:1** |
| Revenue                 |  5,17:1 | **13,3:1** |
| New Product             |  5,17:1 | **13,3:1** |
| Existing / Repeat Order |  5,04:1 | **13,3:1** |
| Prototype Paid          |  3,42:1 | **13,3:1** |

Ketujuh swatch tetap berwarna seri (terverifikasi: 7 elemen `recharts-surface` utuh). Audit kontras
otomatis seluruh teks halaman Reports: **0 kegagalan**.

### Diseragamkan ke Dashboard

Dua legend di `AchievementTrendChart` awalnya dibiarkan karena sudah lolos AA (`--color-primary` dan
`--color-navy` cukup gelap). Menyusul permintaan, keduanya ikut memakai `formatter={legendLabel}`.

**Seluruh 5 legend di aplikasi kini memakai formatter yang sama** — tidak ada lagi tempat yang bisa
memunculkan ulang masalah ini saat warna seri berubah.

Diverifikasi pada kedua state toggle grafik (satu legend hanya dirender per state):

| View      | Label       | Sebelum |    Sesudah |
| --------- | ----------- | ------: | ---------: |
| Kumulatif | Achievement |  5,17:1 | **13,3:1** |
| Kumulatif | Target      |  5,17:1 | **13,3:1** |
| Per-bulan | Achievement |  5,17:1 | **13,3:1** |
| Per-bulan | Target      |  5,17:1 | **13,3:1** |

Swatch tetap utuh di kedua state (2 elemen `recharts-surface` per view).
