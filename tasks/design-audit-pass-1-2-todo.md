# Task List: Design Audit Remediation — Pass 1 & Pass 2

> Dibuat: 2026-09-06
> Sumber: audit desain live app `dsmsalescrm.vercel.app` (signed-in Sales Manager,
>   desktop 1440px + mobile 375px). Ringkasan & finding IDs ada di artifact
>   "DSM Sales CRM Design Audit"
>   (https://claude.ai/code/artifact/a7421df0-664e-4b80-ac72-2336239c1d3b).
> Scope: Pass 1 (High + visible defect) dan Pass 2 (Medium system + per-halaman).
> Non-scope: remote Supabase mutation, production deployment, Dashboard rework
>   penuh (C8 = pass tersendiri), semua finding Low (pass 3).

## Prinsip

- Semua fix lokal. Tidak ada perubahan skema atau RLS.
- Pakai token semantik di `src/styles.css`; jangan hardcode warna baru di komponen.
- Setiap perubahan angka/tanggal lewat helper di `src/lib/format.ts`, bukan
  inline `toLocaleString` / `toFixed` baru.
- Release gate: `bun run lint` + `bun run build` + focused test hijau sebelum
  push ke `main`. Browser UAT dilaporkan terpisah dari local build.

---

# PASS 1 — Correctness & Access

Prioritas absolut. Dikerjakan sebelum onboarding user baru.

## Task P1-1: Semantic HTML & Screen-Reader Structure (finding C1, L1)

**Priority:** P0

**Description:** Halaman app dibangun hampir seluruhnya dari `<div>`. Satu-satunya
heading asli di Dashboard adalah `<h1>Dashboard</h1>`; judul card, nilai KPI,
label chart, dan grid "Sales Performance vs Target" semuanya generic element.
Grid performa adalah CSS-grid div, bukan `<table>`. Login tidak punya `<h1>`
sama sekali.

**Acceptance criteria:**

- [ ] Judul tiap card/section memakai `<h2>` atau `<h3>` sesuai hirarki (tidak skip level)
- [ ] `SalesPerformanceTable` dan grid data serupa memakai `<table>` dengan `<th scope>` yang benar, atau minimal `role="table/row/columnheader/cell"`
- [ ] Tiap chart punya `aria-label` ringkas ATAU visually-hidden data table sebagai fallback
- [ ] `src/routes/login.tsx`: "DSM Sales" (atau "Masuk ke DSM Sales") menjadi `<h1>`
- [ ] `<main>` / landmark region konsisten di `_app` shell
- [ ] Tidak ada regresi visual — perubahan murni semantik + kelas utility

**Verification:**

- [ ] axe-core / Lighthouse a11y pass di Dashboard, Login, Pipeline, Clients (0 error kategori "Info & Relationships")
- [ ] Keyboard: Tab menembus semua kontrol; heading navigation (screen reader rotor) menghasilkan outline yang masuk akal
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/dashboard/KpiCard.tsx`, `ExecutiveCards.tsx`, `SalesPerformanceTable.tsx`, `ActivityComplianceCard.tsx`, `TargetCharts.tsx`, `RevenueTrendChart.tsx`
- `src/components/ui/chart.tsx`
- `src/routes/login.tsx`
- `src/routes/_app.tsx` (landmark)
- `src/components/clients/ClientsTable.tsx`, `src/components/commercial/CommercialViews.tsx` (verifikasi sudah `<table>`)

**Estimated scope:** Large

---

## Task P1-2: Status & Accent Color Contrast (finding C2, L3)

**Priority:** P0

**Description:** Forge Blue `oklch(0.54 0.13 249)`, Signal Amber
`oklch(0.58 0.13 58)`, dan Closed Green `oklch(0.51 0.12 150)` dipakai dengan
teks putih (tombol "Sign in", filled badge, progress bar). Estimasi kontras:
biru ≈ 3.8:1, hijau ≈ 4.1:1, amber ≈ 3.3:1 — di bawah ambang AA 4.5:1 untuk
teks normal. Amber adalah yang terburuk dan dipakai untuk progress bar
"behind target" serta badge "Overdue".

**Acceptance criteria:**

- [ ] 6 pasangan token (`primary`, `warning`, `success`, `destructive`, masing-masing vs foreground-nya) diverifikasi dengan contrast checker
- [ ] Setiap teks normal-size di atas fill status/accent mencapai ≥ 4.5:1; teks large/bold ≥ 3:1
- [ ] Solusi: turunkan channel L token ATAU ganti `*-foreground` amber/hijau ke Carbon Navy — pilih yang menjaga identitas industrial
- [ ] `destructive`, `warning`, `success` tetap mudah dibedakan satu sama lain
- [ ] Dark mode token ikut diverifikasi atau ditandai out-of-scope secara eksplisit
- [ ] Tidak ada warna hardcoded baru di komponen — semua di `src/styles.css`

**Verification:**

- [ ] Tabel hasil contrast (pasangan → rasio sebelum/sesudah) dicatat di PR atau `docs/reports/`
- [ ] Visual check: Login button, Pipeline "Overdue" badge, Dashboard progress bar, "Escalated"/"Overdue" task badge
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None (tapi selesaikan sebelum P2-2 badge work)

**Files likely touched:**

- `src/styles.css`
- `src/components/reports/chart-colors.ts` (hanya jika mapping token bergeser)

**Estimated scope:** Small-Medium

---

## Task P1-3: Activity Log — Raw JSON Payload di Feed (finding A1)

**Priority:** P0

**Description:** Entry "Sales Order dibuat" di Activity Log me-render field
`detail` mentah:
`{"so_number": "DSM-26SO181", "number_mode": "Manual", "backdate_reason": null, "customer_po_date": "2026-09-04", ...}`
verbatim ke feed. Harus jadi kalimat human-readable.

**Acceptance criteria:**

- [ ] `detail` tidak pernah tampil sebagai object/JSON string di feed, drawer, maupun row detail
- [ ] Tiap `kind` activity punya formatter yang menghasilkan kalimat, mis. "Nur Iman membuat Sales Order DSM-26SO181 (manual, PO 4 Sep 2026)"
- [ ] Tanggal di dalam kalimat lewat `formatDateShort`
- [ ] Kalau payload tidak dikenali, fallback ke label `kind` yang aman — bukan `JSON.stringify`
- [ ] Activity export (CSV/PDF) memakai teks yang sama, tidak berubah strukturnya

**Verification:**

- [ ] Focused test untuk activity detail formatter (minimal: sales order created, pipeline update, soft-delete/restore)
- [ ] Browser check Activity Log — scroll 30+ entry, tidak ada `{` / `"` mentah
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/routes/_app.activity.tsx`
- `src/lib/data/activity-log.ts` (atau tempat `detail` dibangun)
- `src/lib/export-activity.ts` (jika teks di-share)

**Estimated scope:** Medium

---

## Task P1-4: Pipeline "Performa per Owner" Empty State (finding P1)

**Priority:** P0

**Description:** Panel "PERFORMA PER OWNER" di Pipeline menampilkan
"Belum ada data owner." padahal filter "Semua sales" aktif dan 5 owner jelas
punya revenue (terlihat di Dashboard "Sales Performance vs Target YTD").
Kemungkinan bug data-binding, bukan pilihan desain.

**Acceptance criteria:**

- [ ] Dengan filter "Semua sales", panel menampilkan baris per owner: value + win rate
- [ ] Empty state hanya muncul saat memang tidak ada commercial item yang cocok filter
- [ ] Angka owner konsisten dengan Dashboard `SalesPerformanceTable` untuk periode yang sama
- [ ] Perilaku benar untuk role sales (hanya dirinya) vs manager/executive (semua)

**Verification:**

- [ ] Unit/focused test untuk selector agregasi owner Pipeline
- [ ] Browser check Pipeline: default filter + filter per-owner
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/pipeline/PipelineAnalytics.tsx`
- `src/lib/data/pipeline-metrics.ts` / `src/lib/data/*` selector terkait

**Estimated scope:** Small-Medium

---

# PASS 2 — Rasa "Satu Sistem"

Dikerjakan setelah Pass 1 hijau. Boleh dipecah jadi beberapa PR kecil.

## Task P2-1: Shared Filter Bar Primitive (finding C6)

**Priority:** P1

**Description:** Filter bar tiap halaman list beda komponen: `PipelineFilterBar`,
`ReportFilterBar`, filter inline di `_app.sales-orders.index.tsx`,
`CommercialViews`, plus filter di Clients. Campur native `<select>`, combobox
pill dengan chevron dua arah (⇕), dan tombol biasa ("Status", "Sumber").
Lebar ragged; di mobile stack dengan tepi kiri/kanan tidak rata.

**Acceptance criteria:**

- [ ] Satu primitive filter reusable (`src/components/shell/` atau `src/components/ui/`) dipakai Pipeline, Sales Orders, Quotations, Reports, Clients
- [ ] Satu tinggi kontrol, satu gaya chevron, satu perilaku "menu" — tombol yang membuka menu terlihat identik dengan dropdown
- [ ] Mobile: semua filter full-width, stacked, tepi rata
- [ ] Desktop: wrap rapi, tidak ada kontrol yang overflow container
- [ ] Perilaku filter existing (opsi, default, reset) tidak berubah
- [ ] Pipeline "Next action" filter (dari task UI-1 lama) tetap berfungsi

**Verification:**

- [ ] Browser screenshot desktop + mobile: Pipeline, Sales Orders, Quotations, Reports, Clients
- [ ] Existing filter test tetap pass
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/shell/FilterBar.tsx` (baru) + `src/components/ui/select.tsx` (jika perlu varian)
- `src/components/pipeline/PipelineFilterBar.tsx`
- `src/components/reports/ReportFilterBar.tsx`
- `src/components/commercial/CommercialViews.tsx`
- `src/routes/_app.sales-orders.index.tsx`, `_app.clients.index.tsx`, `_app.quotations.index.tsx`

**Estimated scope:** Large

---

## Task P2-2: Tenangkan Badge "Active Customer" (finding C7)

**Priority:** P1

**Description:** Filled green pill "Active Customer" muncul di hampir tiap baris
Clients table, Quotations table, dan Pipeline board card. Itu metadata lifecycle
klien, bukan status baris — dinding hijau bersaing dengan status yang sebenarnya
(stage pipeline, urgensi task, klasifikasi PPN).

**Acceptance criteria:**

- [ ] Lifecycle klien didemote: teks quiet / dot kecil / dipindah keluar baris — bukan filled badge
- [ ] Filled badge disisakan untuk state yang berubah & butuh perhatian (overdue, escalated, stage, closed-won-tanpa-SO)
- [ ] "Prospect" vs "Active Customer" masih bisa dibedakan
- [ ] Konsisten di Clients, Quotations, Pipeline card, dan `ExecutiveCards`

**Verification:**

- [ ] Browser check ketiga halaman — hitung "berapa badge per baris" turun
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** P1-2 (contrast) selesai dulu supaya keputusan warna final

**Files likely touched:**

- `src/components/clients/StatusBadges.tsx`
- `src/components/clients/ClientsTable.tsx`
- `src/components/pipeline/PipelineBoard.tsx`, `PipelineCardDrawer.tsx`
- `src/components/commercial/CommercialViews.tsx`
- `src/components/dashboard/ExecutiveCards.tsx`

**Estimated scope:** Medium

---

## Task P2-3: Currency Values Wrap Mid-Number (finding C3)

**Priority:** P1

**Description:** Nilai Rupiah pecah di tengah angka: Pipeline metric card
(`Rp118,54` / `milyar` dua baris), Dashboard KPI tile, sel Clients table
(`Rp38,6 juta` wrap), nomor SO (`DSM–` / `26SO181`).

**Acceptance criteria:**

- [ ] Value + unit dibungkus `white-space: nowrap` (utility `.num` atau kelas baru)
- [ ] Sel/tile angka punya `min-width` sesuai value terpanjang yang diharapkan
- [ ] Type mengecil responsif sebelum wrap (clamp), tidak pernah pecah baris
- [ ] Nomor dokumen (`DSM–26SO181`, `DSM-26QUO-0514`) tidak pernah wrap
- [ ] Tetap pakai `formatRupiahShort` / `formatRupiahFull` — tidak ada formatter baru

**Verification:**

- [ ] Browser check desktop + mobile: Pipeline metrics, Dashboard KPI, Clients table, Sales Orders table
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/styles.css` (utility)
- `src/components/dashboard/KpiCard.tsx`, `ExecutiveCards.tsx`
- `src/components/pipeline/PipelineAnalytics.tsx`
- `src/components/clients/ClientsTable.tsx`
- `src/components/commercial/CommercialViews.tsx`

**Estimated scope:** Small-Medium

---

## Task P2-4: Chart Y-Axis Clipping & Wrapping (finding C9)

**Priority:** P1

**Description:** Di Dashboard dan Reports, tick Y-axis teratas (`Rp38 milyar`)
terpotong di atas plot area, dan tiap tick wrap dua baris (`Rp28,5` / `milyar`).

**Acceptance criteria:**

- [ ] Tick Y-axis disingkat via formatter (`Rp38M` / `38 M`) — tidak wrap
- [ ] Margin kiri chart cukup untuk label terpanjang
- [ ] Padding atas container cukup untuk tick tertinggi — tidak ada clipping
- [ ] Tick `interval` fixed sehingga tidak berdesakan di layar sempit
- [ ] Konsisten dipakai semua chart Recharts (dashboard + reports)

**Verification:**

- [ ] Browser screenshot Dashboard + Reports charts, desktop + mobile
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/dashboard/TargetCharts.tsx`, `RevenueTrendChart.tsx`
- `src/components/reports/*` (chart komponen)
- `src/components/ui/chart.tsx`
- `src/lib/format.ts` (helper `formatRupiahAxis` jika perlu)

**Estimated scope:** Small-Medium

---

## Task P2-5: Bedakan Badge "Escalated" vs "Overdue" (finding D3)

**Priority:** P1

**Description:** Di list "Follow-Up Prioritas Hari Ini" (Dashboard), badge
"Escalated" dan "Overdue" sama-sama pill merah pucat — tidak bisa dibedakan
sekilas padahal artinya beda.

**Acceptance criteria:**

- [ ] "Escalated" = amber (Signal Amber), "Overdue" = merah (destructive)
- [ ] Masing-masing punya ikon berbeda
- [ ] Kontras teks pada badge memenuhi AA (ikut hasil P1-2)
- [ ] Perlakuan sama di Dashboard `TodaysFollowUpList` dan halaman Tasks

**Verification:**

- [ ] Browser check Dashboard follow-up list + Tasks list
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** P1-2

**Files likely touched:**

- `src/components/dashboard/TodaysFollowUpList.tsx`
- `src/components/tasks/*` (badge shared)
- `src/lib/business-rules.ts` (jika mapping status→warna di sana)

**Estimated scope:** Small

---

## Task P2-6: Pipeline Board Card Template Konsisten (finding P2, P3)

**Priority:** P1

**Description:** Card di board render beda antar kolom: sebagian menampilkan
string dimensi/spec + tanggal; sebagian menampilkan nama produk uppercase +
status next-action (`overdue 2h` / `no next action`). Judul card juga selalu
truncate ke teks yang sama (`PT. Mekanika Elektrika ...`) sehingga card klien
yang sama tidak bisa dibedakan.

**Acceptance criteria:**

- [ ] Satu template card untuk semua stage: client → product/spec → value → owner → next-action
- [ ] Field yang sama di posisi yang sama, apa pun kolomnya
- [ ] Baris produk/project lebih menonjol, atau nama klien di-truncate dari tengah supaya bagian pembeda tetap terlihat
- [ ] Closed Won quotation tanpa SO tetap sangat terlihat (jangan regresi dari UI-6 lama)
- [ ] Drag affordance & keyboard Enter/Space buka drawer tetap jalan

**Verification:**

- [ ] Browser screenshot Pipeline board desktop + mobile, minimal 3 kolom terlihat
- [ ] Manual drag/drop tetap buka confirmation dialog
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** P2-2 (badge), P2-3 (number wrap)

**Files likely touched:**

- `src/components/pipeline/PipelineBoard.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx` (jika label perlu align)

**Estimated scope:** Medium

---

## Task P2-7: Tasks — Default View & Scope Labels (finding T1, T2)

**Priority:** P1

**Description:** (T1) Halaman Tasks landing dengan "TODAY (0)" terpilih, jadi
user pertama kali melihat "Inbox kosong" padahal Dashboard bilang 18 open task
dan "UPCOMING (1)" ada di sebelahnya. (T2) Angka overdue tidak rekonsiliasi:
Dashboard "Overdue Follow-Ups 13 · 7 escalated · 6 overdue", Tasks "OVERDUE 0"
dan "Team Exceptions 2".

**Acceptance criteria:**

- [ ] Tasks default ke view yang ada isinya — "Upcoming" / "All active", atau auto-pilih bucket non-empty pertama
- [ ] Tiap angka count punya label scope eksplisit ("Ditugaskan ke saya" vs "Seluruh tim")
- [ ] Dashboard "Overdue Follow-Ups" dan Tasks memakai istilah scope yang sama sehingga 13 vs 0 jelas fakta yang sama di scope berbeda
- [ ] Tidak mengubah logika penghitungan overdue itu sendiri

**Verification:**

- [ ] Browser check Tasks load pertama (bukan empty), toggle My Tasks / Team Exceptions
- [ ] Bandingkan angka Dashboard vs Tasks untuk user yang sama
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/routes/_app.tasks.tsx`
- `src/components/dashboard/ExecutiveCards.tsx` (label "Overdue Follow-Ups")
- `src/lib/data/tasks.ts` (jika label scope diturunkan dari selector)

**Estimated scope:** Small-Medium

---

## Task P2-8: Wide Table Scroll Affordance (finding CL1, CL2)

**Priority:** P1

**Description:** (CL1) Di desktop, Clients table memotong kolom "NON PPN" dan
nilainya di tepi kanan; container scroll tapi tidak ada yang menandai.
Sama di Sales Orders & Quotations. (CL2) Kolom nama klien wrap 3–4 baris
(`PT. Hariff Daya Tunggal Engineering`), tinggi baris jadi tidak rata.

**Acceptance criteria:**

- [ ] Tabel lebar punya scrollbar horizontal yang selalu terlihat, ATAU fade mask di tepi kanan, ATAU kolom pertama (client / no. dokumen) sticky
- [ ] Body halaman tetap tidak scroll horizontal (regresi UI-2 lama tidak boleh)
- [ ] Kolom nama klien dilebarkan dan di-cap 2 baris dengan ellipsis + `title`
- [ ] Berlaku di Clients, Sales Orders, Quotations tables

**Verification:**

- [ ] Browser check desktop (1440 + ~1024) dan mobile: Clients, Sales Orders, Quotations
- [ ] Konfirmasi `document.documentElement.scrollWidth === window.innerWidth` di mobile
- [ ] `bun run lint`
- [ ] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/ui/table.tsx` (wrapper scroll + fade)
- `src/components/clients/ClientsTable.tsx`
- `src/components/commercial/CommercialViews.tsx`

**Estimated scope:** Medium

---

## Suggested Execution Order

**Pass 1 (satu branch atau 4 PR kecil, urut):**

1. P1-2 Color contrast — cepat, dan jadi fondasi P2-2 / P2-5
2. P1-3 Activity JSON — defect terlihat, self-contained
3. P1-4 Pipeline owner panel — defect terlihat, self-contained
4. P1-1 Semantic HTML — paling besar, kerjakan terakhir di Pass 1

**Pass 2 (boleh paralel per PR):**

5. P2-3 Number wrap (kecil, dipakai P2-6)
6. P2-4 Chart axes
7. P2-5 Escalated/Overdue badge
8. P2-1 Shared filter bar (besar)
9. P2-2 Badge "Active Customer"
10. P2-8 Table scroll affordance
11. P2-7 Tasks default view & scope
12. P2-6 Pipeline card template (butuh P2-2 + P2-3)

## Release Gate

- [ ] Tidak ada remote Supabase mutation di seluruh task list ini
- [ ] Sebelum push ke `main`: `bun run lint`, `bun run build`, focused test terkait hijau
- [ ] Browser UAT (screenshot desktop + mobile) dilaporkan terpisah dari local build
- [ ] Finding Low (C4, C5, L2, L3, D1, D2, SO1, SO2, R2, R3) → pass 3, tidak di sini
- [ ] Dashboard rework (C8) → task list tersendiri
