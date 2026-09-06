# Task List: Design Audit Remediation — Pass 3 & Pass 4

> Dibuat: 2026-09-06
> Sumber: audit desain live app `dsmsalescrm.vercel.app`. Finding IDs di artifact
>   "DSM Sales CRM Design Audit"
>   (https://claude.ai/code/artifact/a7421df0-664e-4b80-ac72-2336239c1d3b).
> Lanjutan dari `tasks/design-audit-pass-1-2-todo.md`.
> Scope: Pass 3 (polish sweep — semua finding Low) dan Pass 4 (Dashboard rework, C8).
> Non-scope: remote Supabase mutation, production deployment.

## Prinsip

- Semua fix lokal. Tidak ada perubahan skema atau RLS.
- Angka/tanggal lewat helper `src/lib/format.ts` — jangan bikin formatter baru.
- Pass 3 boleh diselesaikan dalam **satu branch** karena tiap item kecil.
- Pass 4 adalah keputusan desain, bukan bug fix — lewati proses brainstorming
  dulu sebelum menyentuh kode (lihat catatan di task P4-1).

## Catatan hasil verifikasi source (koreksi terhadap audit awal)

- **L3 (login `autocomplete`) — sudah benar.** `src/routes/login.tsx` sudah pakai
  `autoComplete="email"` dan `autoComplete="current-password"`; accessibility
  tree browser tidak menampilkannya. Tidak ada pekerjaan; opsional ganti
  `"email"` → `"username"` (lebih standar untuk form login).
- **P3 & CL2** sudah dipindah ke `tasks/design-audit-pass-1-2-todo.md`
  (P2-6 dan P2-8). Tidak diulang di sini.
- `src/lib/preferences-store.ts` **sudah punya** `dateFormat` dan
  `currencyFormat` (per-device), dipakai di Settings UI tapi **belum di-wire**
  ke formatter tampilan. Relevan untuk P3-1.

---

# PASS 3 — Polish Sweep

Satu branch, banyak commit kecil. Semua finding Low.

## Task P3-1: Number & Date Localization Konsisten (finding C4, C5)

**Priority:** P2

**Description:** (C4) Revenue pakai koma `id-ID` (`Rp118,54 milyar`) tapi persen
pakai titik (`35.7%`, `145%`); Pipeline win rate `35.7%`. (C5) Empat format
tanggal berbeda di app: `01 Jan 2026` (Dashboard/SO), `8/8/2026` (Activity),
`17/07/2026` (Settings sample), `07 Sep 2026` (Pipeline card).

**Acceptance criteria:**

- [ ] `formatPercent` di `src/lib/format.ts` menghasilkan koma desimal (`35,7%`), bukan titik
- [ ] Semua caller `formatPercent` (~15 file) tetap benar setelah perubahan
- [ ] Semua tanggal tampil lewat `formatDateShort` (`DD MMM YYYY`) — tidak ada `toLocaleDateString` / `new Date().toLocale*` ad-hoc di komponen atau route
- [ ] Activity Log dan Pipeline card memakai `formatDateShort`
- [ ] Keputusan diambil & dicatat: `preferences-store.dateFormat` / `currencyFormat` **di-wire** ke formatter, ATAU field-nya dihapus dari Settings + store jika tidak akan dipakai (jangan biarkan kontrol mati)
- [ ] Format di file export (PDF/CSV/Excel) tidak berubah

**Verification:**

- [ ] Focused test `src/lib/format.test.ts` untuk `formatPercent` (koma) + `formatDateShort`
- [ ] Browser check: Pipeline win rate, Dashboard %, Activity Log tanggal, Pipeline card tanggal
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/lib/format.ts` (+ `format.test.ts`)
- `src/routes/_app.activity.tsx`, `src/components/pipeline/PipelineBoard.tsx`
- `src/components/clients/StatusAuditTrail.tsx`, `src/components/tasks/TasksInboxViews.tsx`, `src/components/commercial/CommercialDetailSidebar.tsx` (audit `toLocaleDateString`)
- `src/routes/_app.settings.tsx` + `src/lib/preferences-store.ts` (wire atau hapus)

**Estimated scope:** Small-Medium

---

## Task P3-2: Login — Mobile Layout (finding L2)

**Priority:** P2

**Description:** Di 375px, `min-h-screen items-center justify-center` membuat
card `max-w-sm` mengambang di tengah vertikal dengan pita kosong besar di atas
dan bawah.

**Acceptance criteria:**

- [ ] Di bawah ~480px: card top-aligned (dengan padding-top) atau edge-to-edge tanpa border/shadow
- [ ] Di desktop: tetap centered seperti sekarang
- [ ] Logo, copy, form, error state tidak berubah
- [ ] Tidak ada horizontal overflow

**Verification:**

- [ ] Browser screenshot `/login` di 375px dan 1440px
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/routes/login.tsx`

**Estimated scope:** Small

---

## Task P3-3: Dashboard — Label Duplikat & AI Card Placement (finding D1, D2)

**Priority:** P2

**Description:** (D1) "Achievement YTD vs Yearly Target" muncul dua kali — sebagai
KPI tile dan sebagai judul chart di bawah, dengan framing sedikit beda.
(D2) `<AiSummaryCard />` (route line ~430) berada **di atas** grid KPI (line ~435),
sehingga card berisi satu tombol + satu kalimat mendorong angka ke bawah.

**Acceptance criteria:**

- [ ] Judul chart cumulative diberi nama berbeda dari KPI tile (mis. "Akumulasi capaian per bulan")
- [ ] `AiSummaryCard` dipindah ke bawah grid KPI utama SAAT belum ada ringkasan, ATAU dikompres jadi satu baris prompt di header
- [ ] Setelah ringkasan dibuat, card boleh tetap di posisi menonjol (keputusan dicatat)
- [ ] Tidak ada perubahan logika AI summary (pilot Adhitya-only tetap)

**Verification:**

- [ ] Browser screenshot Dashboard desktop + mobile, sebelum & sesudah "Buat Ringkasan"
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** Idealnya setelah P4 (Dashboard rework) — kalau P4 belum jalan, kerjakan sebagai perbaikan kecil di layout lama

**Files likely touched:**

- `src/routes/_app.dashboard.tsx`
- `src/components/dashboard/TargetCharts.tsx` (judul chart)

**Estimated scope:** Small

---

## Task P3-4: Reports & List Header Cleanup (finding R2, R3, SO1)

**Priority:** P2

**Description:** (R2) `_app.reports.tsx:483` mencetak baris
"Rentang: … · Semua sales · Semua klien" yang mengulang filter bar tepat di
atasnya. (R3) Revenue yang sama (Rp29,02 milyar) tampil "60%" di Dashboard
(vs target tahunan Rp48 milyar) dan "80% dari target Rp36,5 milyar" di Reports
(vs target YTD) — tanpa label, terbaca seperti kontradiksi. (SO1) Header
Sales Orders / Quotations: "…Total estimasi Rp118,54 milyar" wrap sehingga
"milyar" jatuh ke baris 2 di sebelah toggle Table/Stage.

**Acceptance criteria:**

- [ ] Baris "Rentang: …" dihapus dari layar, ATAU dipertahankan hanya di PDF export (di mana filter bar tidak ada)
- [ ] Setiap angka "% of target" diberi label eksplisit: "vs target setahun penuh" / "vs target sampai bulan ini" — di Dashboard dan Reports
- [ ] Header list: meta line ("N dokumen aktif · Total estimasi …") punya baris sendiri di bawah judul, tidak bertabrakan dengan toggle
- [ ] Meta line tidak wrap di tengah angka (ikut aturan P2-3)

**Verification:**

- [ ] Browser check Reports (layar + PDF), Dashboard KPI label, Sales Orders + Quotations header desktop + mobile
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** P2-3 (number wrap)

**Files likely touched:**

- `src/routes/_app.reports.tsx` (± `src/lib/export-pdf.ts`)
- `src/components/dashboard/KpiCard.tsx` / `ExecutiveCards.tsx` (label)
- `src/components/reports/ReportsKpiCards.tsx`
- `src/routes/_app.sales-orders.index.tsx`, `_app.quotations.index.tsx`
- `src/components/commercial/CommercialViews.tsx` (jika header di sini)

**Estimated scope:** Small-Medium

---

## Task P3-5: KPI Accent Style Terbaca Seperti "Selected" (finding SO2)

**Priority:** P2

**Description:** `src/components/reports/ReportPrimitives.tsx` memberi
`border-primary/40 bg-primary/[0.03]` pada KPI card saat prop `accent` true
(Total Revenue di SO, Achievement YTD di Reports). Efeknya seperti focus-ring /
state "terpilih" padahal card tidak interaktif.

**Acceptance criteria:**

- [ ] Accent card terbaca sebagai "metric utama/emphasis", bukan "sedang dipilih" — mis. accent bar tipis di atas / label eyebrow, bukan border biru penuh + tint
- [ ] Kalau card memang tidak diklik, tidak ada `ring` / border yang meniru focus state
- [ ] Konsisten dipakai di Dashboard KPI utama dan Reports KPI utama
- [ ] Kontras accent memenuhi AA (ikut P1-2)

**Verification:**

- [ ] Browser check Reports + Sales Orders KPI row
- [ ] Keyboard: pastikan tidak ada elemen yang terlihat focusable tapi tidak melakukan apa-apa
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** P1-2, dan idealnya P4-1 (karena Dashboard KPI hierarchy ditentukan di sana)

**Files likely touched:**

- `src/components/reports/ReportPrimitives.tsx`
- `src/components/dashboard/KpiCard.tsx`

**Estimated scope:** Small

---

# PASS 4 — Dashboard Information-Design Rework (finding C8)

## Task P4-1: Rancang Ulang Hirarki & Kepadatan Dashboard

**Priority:** P1 (setelah Pass 1–3), dikerjakan sebagai proyek kecil tersendiri

**Description:** Dashboard sekarang: 8 KPI tile identik (bobot/padding/radius/
shadow sama) di grid `sm:grid-cols-2 xl:grid-cols-4`, lalu 4 chart progresi
bulanan yang mirip (`YtdAchievementVsTargetChart`,
`MonthlyAchievementVsTargetChart`, `RevenueTrendChart`, plus
`TargetAllSalesChart` / `SingleSalesTargetChart`), full-width single-column,
lalu follow-up list + `SalesPerformanceTable` + `ActivityComplianceCard`.
Hasilnya: tidak ada hirarki (angka inti = angka sekunder), scroll sangat
panjang, jauh lebih parah di mobile (tiap tile ≈ 40% viewport).

Ini keputusan layout, bukan bug. **Lewati brainstorming dulu** — gunakan skill
`superpowers:brainstorming` atau diskusi eksplisit dengan user untuk memutuskan
pertanyaan terbuka di bawah sebelum menulis kode.

### Keputusan user (2026-09-06)

1. **Hero band = 3 tile:** Achievement YTD vs target · Monthly achievement ·
   Waiting PO value. Diangkat besar di atas; sisanya jadi row stat ringkas.
2. **Chart bulanan digabung jadi 1** dengan toggle **Kumulatif / Per-bulan**
   (menggantikan `YtdAchievementVsTargetChart` + `MonthlyAchievementVsTargetChart`
   + `RevenueTrendChart`). `TargetAllSalesChart` (per-sales) → pindah ke Reports.
3. **Follow-Up Prioritas + Sales Performance table → ringkas:** 3–5 baris teratas
   + tombol "Lihat semua" ke `/tasks` resp. `/reports`.
4. **Dashboard = cepat, Reports = dalam.** Chart analitis (funnel, forecast,
   per-sales, top customers, risk alerts) hidup di Reports; Dashboard menyimpan
   hero + row stat sekunder + 1 chart tren + ringkasan follow-up.
5. **Scope Sales Manager vs Sales:** layout sama, data tetap role-filtered
   (default — tidak dibahas terpisah).

### Acceptance criteria (setelah pertanyaan dijawab)

- [ ] 1–2 metric inti diangkat: tile lebih besar / header band / tipografi angka lebih besar — jelas berbeda dari metric sekunder
- [ ] Metric sekunder tetap ada tapi lebih ringkas (row of small stats, bukan 8 card penuh)
- [ ] Chart progresi bulanan yang redundan digabung/di-tab menjadi maksimal 2 chart
- [ ] Desktop: chart tampil 2-up, bukan 1 kolom penuh
- [ ] Mobile: dari header sampai chart pertama muat dalam ≈ 2 layar scroll, bukan 4+
- [ ] Semua data tetap dari backend snapshot yang sama (tidak ada seed/mock fallback — lihat CLAUDE.md)
- [ ] Export Dashboard (PDF/CSV/Excel) menerima snapshot yang sama seperti Dashboard yang terlihat
- [ ] Semantik heading benar (ikut P1-1) dan tidak diregresi
- [ ] `AiSummaryCard` ditempatkan sesuai keputusan D2 (P3-3)

### Verification

- [ ] Design plan / wireframe disetujui user sebelum kode ditulis
- [ ] Browser screenshot before/after: Dashboard desktop + mobile
- [ ] Ukur panjang scroll (px) before/after, dicatat di report
- [ ] Existing dashboard selector test (`src/lib/data/dashboard-selectors`) tetap pass
- [ ] `bun run lint`
- [ ] `bun run build`
- [ ] Short report di `docs/reports/<date>-dashboard-rework.md`

**Dependencies:** Pass 1 (terutama P1-1 semantic HTML), Pass 3 (P3-3, P3-5)

**Files likely touched:**

- `src/routes/_app.dashboard.tsx` (utama)
- `src/components/dashboard/KpiCard.tsx`, `ExecutiveCards.tsx`, `TargetCharts.tsx`, `RevenueTrendChart.tsx`, `TodaysFollowUpList.tsx`, `SalesPerformanceTable.tsx`, `ActivityComplianceCard.tsx`, `AiSummaryCard.tsx`
- `src/lib/data/dashboard-selectors.ts` (hanya jika perlu selector agregat baru — tanpa ubah sumber data)
- `src/components/layout/PageContainer.tsx` (jika perlu varian layout)

**Estimated scope:** Large

---

## Suggested Execution Order

**Pass 3 (satu branch):**

1. P3-1 Localization (paling banyak menyentuh file — lakukan pertama, isolasi)
2. P3-2 Login mobile
3. P3-4 Reports/list header cleanup
4. P3-5 KPI accent style
5. P3-3 Dashboard labels + AI card (skip jika P4 dijadwalkan segera setelahnya)

**Pass 4 (proyek terpisah):**

6. P4-1 — brainstorming/keputusan user → design plan → implementasi → report

## Release Gate

- [ ] Tidak ada remote Supabase mutation di seluruh task list ini
- [ ] Sebelum push ke `main`: `bun run lint`, `bun run build`, focused test terkait hijau
- [ ] Browser UAT (screenshot desktop + mobile) dilaporkan terpisah dari local build
- [ ] Pass 4 tidak dimulai sebelum 5 pertanyaan terbuka P4-1 dijawab user
- [ ] `src/lib/no-mock-dependencies.test.ts` tetap pass (tidak ada mock/seed masuk lagi ke Dashboard)
