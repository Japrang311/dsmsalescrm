# Task List: UI/UX Design Refresh

> Dibuat: 2026-08-27
> Sumber: audit desain UI/UX DSM Sales CRM, berbasis inspeksi source + `bun run build`
> Scope: perbaikan UX dan visual identity aplikasi internal DSM Sales CRM
> Non-scope: remote Supabase mutation, production deployment, redesign total

## Design Direction

DSM Sales CRM harus terasa seperti tool kerja sales operasional untuk bisnis
manufacturing/metal: padat, cepat discan, tegas, dan tidak terlalu generik
enterprise. Arah visual tetap restrained, tapi bergeser dari
`Salesforce-inspired` ke DSM/industrial sales.

**Token arah visual awal:**

- Carbon Navy: `#14324A`
- Forge Blue: `#1D70B8`
- Galvanized: `#EEF2F5`
- Steel Line: `#B8C1C8`
- Signal Amber: `#C97716`
- Closed Green: `#2F7D50`

**Signature UI:** Pipeline menggunakan nuansa "steel rail" pada stage header
dan kartu, cukup sebagai satu aksen khas. Jangan menambah dekorasi berlebihan.

---

## Task UI-1: Fix Pipeline `Next action` Filter

**Priority:** P0

**Description:** Filter `Next action` di Pipeline sekarang memiliki state dan
kontrol UI, tetapi belum dipakai untuk memfilter board/query. Perbaiki agar
opsi `Overdue`, `Hari ini`, `7 hari ke depan`, dan `Tanpa next action`
mengubah daftar card sesuai ekspektasi user.

**Acceptance criteria:**

- [x] Memilih `Overdue` hanya menampilkan commercial item dengan next action lewat dari hari ini
- [x] Memilih `Hari ini` hanya menampilkan commercial item dengan next action hari ini
- [x] Memilih `7 hari ke depan` hanya menampilkan commercial item dengan next action dalam 7 hari
- [x] Memilih `Tanpa next action` hanya menampilkan commercial item tanpa active linked task
- [x] `Reset filter` mengembalikan owner, status, dan next action ke `all`
- [x] Pipeline metrics/header tidak misleading terhadap data yang difilter

**Verification:**

- [x] Unit test atau focused test untuk fungsi filter next action
- [ ] Browser/local manual check Pipeline untuk semua opsi filter
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/routes/_app.pipeline.tsx`
- `src/components/pipeline/PipelineFilterBar.tsx`
- `src/lib/data/*` or controller/helper file if extraction is needed

**Estimated scope:** Medium

---

## Task UI-2: Introduce Shared App Page Container

**Priority:** P1

**Description:** Samakan spacing, max width, dan vertical rhythm halaman app.
Dashboard sudah punya wrapper `max-w-[1440px] p-4 md:p-6`, sementara Pipeline
dan Tasks memakai container polos. Buat shared page container agar halaman
internal terasa satu sistem.

**Acceptance criteria:**

- [x] Ada reusable `PageShell`/`PageContainer` untuk halaman authenticated app
- [x] Dashboard, Pipeline, Tasks, Clients index, Sales Orders index, Reports memakai spacing yang konsisten
- [x] Halaman data padat tetap efisien, tidak menjadi landing-page style
- [x] Mobile tidak memiliki horizontal overflow kecuali board Pipeline yang memang horizontal-scroll
- [x] Tidak ada card wrapper di dalam card hanya untuk spacing

**Verification:**

- [ ] Browser screenshot desktop dan mobile untuk minimal Dashboard, Pipeline, Tasks
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/components/shell/*` or new `src/components/layout/*`
- `src/routes/_app.dashboard.tsx`
- `src/routes/_app.pipeline.tsx`
- `src/routes/_app.tasks.tsx`
- `src/routes/_app.clients.index.tsx`
- `src/routes/_app.sales-orders.index.tsx`
- `src/routes/_app.reports.tsx`

**Estimated scope:** Medium

---

## Task UI-3: Rebrand Theme Tokens Toward DSM Industrial Sales

**Priority:** P1

**Description:** Update semantic theme tokens so aplikasi tidak terasa terlalu
generic `Salesforce-inspired`. Tetap gunakan token semantik, bukan hardcoded
color di komponen.

**Acceptance criteria:**

- [x] `src/styles.css` tidak lagi menyebut theme sebagai `Salesforce-inspired`
- [x] Primary, navy, surface, border, status, dan chart tokens disesuaikan ke arah DSM/industrial sales
- [x] Status color tetap mudah dibedakan: destructive, warning, success tidak saling mirip
- [x] Contrast text terhadap background tetap accessible
- [x] Dark mode token tetap valid atau sengaja ditandai out-of-scope jika belum dipakai

**Verification:**

- [ ] Visual check Dashboard, Pipeline, Tasks, Reports
- [x] Check tidak ada hardcoded palette baru di komponen
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** UI-2 recommended, but not required

**Files likely touched:**

- `src/styles.css`
- `src/components/reports/chart-colors.ts`
- Any chart/status primitive only if token mapping needs adjustment

**Estimated scope:** Small-Medium

---

## Task UI-4: Refresh Login Screen Branding

**Priority:** P2

**Description:** Login screen sekarang aman dan sederhana, tapi terlalu
anonim. Tambahkan identitas DSM dan konteks aplikasi internal tanpa membuat
landing page.

**Acceptance criteria:**

- [x] DSM mark/logo tampil jelas di login screen
- [x] Copy menjelaskan aplikasi sebagai internal sales execution/revenue tool
- [x] Form tetap fokus: email, password, sign in
- [x] Error sign-in tetap jelas dan tidak vague
- [x] Layout responsive mobile dan desktop
- [x] Tidak ada credential, hint password, atau secret di UI

**Verification:**

- [x] Browser screenshot `/login` desktop dan mobile
- [ ] Manual invalid-login check menampilkan error
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** UI-3 recommended for visual consistency

**Files likely touched:**

- `src/routes/login.tsx`
- `public/dsm-mark.png` or existing asset imports if needed

**Estimated scope:** Small

---

## Task UI-5: Consolidate Dashboard Export Controls

**Priority:** P2

**Description:** Dashboard header terlalu padat karena DateRange, Export PDF,
Export CSV, dan Export Excel tampil sejajar. Ubah menjadi satu kontrol Export
yang membuka menu format dan data table, agar area KPI lebih cepat dibaca.

**Acceptance criteria:**

- [x] Header hanya menampilkan DateRange dan satu tombol/menu `Export`
- [x] PDF, CSV, dan Excel tetap tersedia
- [x] Menu export tetap role-aware seperti sekarang
- [x] Toast success/error tetap memakai copy yang jelas
- [x] Tidak mengubah isi file export

**Verification:**

- [ ] Focused manual check export menu untuk role sales dan manager/executive jika fixture tersedia
- [ ] Existing export tests tetap pass jika ada
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** None

**Files likely touched:**

- `src/routes/_app.dashboard.tsx`
- Optional extraction: `src/components/dashboard/DashboardExportMenu.tsx`

**Estimated scope:** Small-Medium

---

## Task UI-6: Pipeline Board Visual Refinement

**Priority:** P2

**Description:** Setelah filter benar, polish Pipeline sebagai workflow utama.
Buat stage header dan card hierarchy lebih mudah discan, dengan signature
"steel rail" yang restrained.

**Acceptance criteria:**

- [x] Stage header membedakan active/open stages dan terminal stages tanpa warna berlebihan
- [x] Card hierarchy jelas: client, type, value, status, owner, next action
- [x] Drag affordance tetap jelas untuk role yang boleh move
- [x] Closed Won quotation tanpa SO tetap sangat terlihat
- [x] Horizontal scroll affordance tetap jelas di desktop dan mobile
- [x] Tidak menambah animasi yang mengganggu kerja cepat

**Verification:**

- [ ] Browser screenshot Pipeline desktop dan mobile
- [ ] Manual drag/drop check tetap membuka confirmation dialog
- [ ] Keyboard Enter/Space pada card tetap membuka drawer
- [x] `bun run lint`
- [x] `bun run build`

**Dependencies:** UI-1, UI-3

**Files likely touched:**

- `src/components/pipeline/PipelineBoard.tsx`
- `src/components/pipeline/PipelineAnalytics.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx` if hierarchy labels need alignment

**Estimated scope:** Medium

---

## Task UI-7: Visual QA Pass and Evidence Report

**Priority:** P1 after implementation tasks

**Description:** Jalankan QA desain read-only setelah UI tasks selesai.
Tujuannya membuktikan tidak ada overlap, overflow, atau regresi responsive.

**Acceptance criteria:**

- [ ] Screenshot desktop dan mobile untuk `/login`, `/dashboard`, `/pipeline`, `/tasks`, `/clients`, `/sales-orders`, `/reports`
- [x] Catat halaman yang tidak bisa diverifikasi karena auth/local Supabase blocker
- [x] Bedakan source validation, local build, browser proof, dan production UAT
- [x] Tidak klaim authenticated browser UAT jika tidak benar-benar login

**Verification:**

- [x] `bun run lint`
- [x] `bun run build`
- [x] Browser screenshot evidence disimpan di artifact path yang jelas
- [x] Short report berisi findings, residual risks, dan recommended follow-up

**Dependencies:** UI-1 to UI-6 as applicable

**Files likely touched:**

- Optional: `docs/reports/<date>-ui-ux-design-refresh.md`
- No app source unless QA menemukan blocker yang disetujui untuk diperbaiki

**Estimated scope:** Small-Medium

---

## Suggested Execution Order

1. UI-1: Fix Pipeline `Next action` Filter
2. UI-2: Introduce Shared App Page Container
3. UI-3: Rebrand Theme Tokens Toward DSM Industrial Sales
4. UI-4: Refresh Login Screen Branding
5. UI-5: Consolidate Dashboard Export Controls
6. UI-6: Pipeline Board Visual Refinement
7. UI-7: Visual QA Pass and Evidence Report

## Release Gate

- [x] No remote Supabase mutation required for this task list
- [x] Before push to `main`: `bun run lint`, `bun run build`, and relevant focused tests must pass
- [x] Production deployment/browser UAT must be reported separately from local validation
