# Verifikasi Task 10b — Forecast UI dan Export

Tanggal: 17 Oktober 2026

Status: **Verified local + browser**

Scope: Task 10b beserta split renderer export; Task 11 dan Gate B belum dikerjakan.

## Hasil

[Pasti] Reports sekarang memakai `crm_forecast_snapshot`, bukan lagi menjumlahkan
seluruh pipeline client-side. UI menampilkan basis Nilai SO, periode, `as of`,
`fetchedAt`, label `Snapshot saat ini`, nilai SO periode, pipeline terbobot,
forecast, target, bucket belum dijadwalkan/overdue, dan drilldown quotation dengan
bobot serta kontribusinya.

[Pasti] Periode historis menampilkan `Forecast historis tidak tersedia`; current
pipeline tidak ditampilkan sebagai forecast masa lalu dan tidak diganti dengan
nol palsu. Filter Pajak, Tipe SO, atau Source juga membuat forecast eksplisit
unavailable karena quotation tidak memiliki dimensi pembanding yang sama.

[Pasti] Dashboard memakai snapshot forecast bulan berjalan dari RPC yang sama.
Nilai forecast tidak lagi diturunkan dari aggregate pipeline tanpa tanggal.

[Pasti] XLSX membawa metadata exact (`Forecast mode`, as-of, fetchedAt, pipeline
terbobot, dan forecast) serta sheet `Forecast Drilldown`. Test browser
merekonsiliasi nilai exact UI dan XLSX terhadap respons RPC yang sama. PDF memakai
snapshot yang sama, memuat ringkasan dan drilldown forecast, dan file hasil browser
terverifikasi memiliki signature PDF yang valid.

[Pasti] Koreksi lintas-slice dilakukan pada migration Task 10a: tanggal bisnis RPC
sekarang memakai `Asia/Jakarta`, bukan `current_date` PostgreSQL yang berjalan UTC.
Tanpa koreksi ini, bucket overdue dan as-of terlambat berubah sampai tujuh jam.

## Acceptance yang diverifikasi

| Acceptance              | Bukti lokal                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC12                    | UI dan export memakai server snapshot; terminal, outside-period, superseded/deleted, dan undated tetap dikeluarkan oleh aggregate teruji |
| AC13 — traceability     | Aggregate exact direkonsiliasi ke RPC dan XLSX; UI menampilkan quotation, stage, expected close, bobot, dan kontribusi                   |
| Historical truthfulness | Preset bulan lalu menampilkan unavailable dan tidak menampilkan label current snapshot                                                   |
| Basis/period/as-of      | Label basis, periode, as-of, dan fetchedAt terlihat pada Reports; Dashboard menampilkan fetchedAt snapshot bulan berjalan                |
| Empty/error             | SSR smoke memastikan historical/error tidak merender forecast nol buatan; current empty menampilkan tabel kosong yang eksplisit          |
| Export                  | XLSX exact values = RPC; PDF berhasil diunduh sebagai file `%PDF-`                                                                       |

## Bukti pengujian

1. RED sebelum implementasi:
   - `npx playwright test e2e/crm-gate-a.spec.ts --grep "Reports export uses" --project=chromium`
   - Gagal karena region `Forecast Nilai SO` dan label `Snapshot saat ini` belum ada.
2. Targeted setelah fresh migration replay:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test supabase/tests/crm-forecast-snapshot.test.ts supabase/tests/crm-expected-close.test.ts src/lib/data/forecast-snapshot.test.ts tests/ui-smoke.test.tsx`
   - **19 pass, 0 fail, 95 assertions**.
3. Regression gabungan command/forecast/export:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test supabase/tests/crm-forecast-snapshot.test.ts supabase/tests/task-progress.test.ts src/lib/data/forecast-snapshot.test.ts src/lib/dashboard-export-data.test.ts`
   - **28 pass, 0 fail, 115 assertions**.
4. Full suite:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 npm test`
   - **756 pass, 0 fail, 2.909 assertions, 103 files**.
5. Static/build:
   - `npm run lint` — lulus.
   - `npm run typecheck` — lulus.
   - `npm run build` — lulus.
   - `git diff --check` — lulus.
6. Browser Chromium:
   - `npx playwright test e2e/crm-gate-a.spec.ts --grep "Reports export uses" --project=chromium`
   - **1 pass**: current label/basis, UI–RPC–XLSX exact reconciliation, PDF
     download, historical unavailable, Dashboard consumer, dan console/page error bersih.
7. Visual inspection lokal 1440×1000:
   - Tidak ada horizontal overflow (`scrollWidth=clientWidth=1440`).
   - Drilldown dibatasi scroll internal 420px dengan sticky header; tinggi halaman
     turun dari 8.707px menjadi 3.702px tanpa membuang row atau mengubah export.

## Fresh database proof

`bunx supabase@2.109.1 db reset --workdir /tmp/dsm-gate-a.heGRvH` mereplay
seluruh migration sampai `20261016144752_add_crm_forecast_snapshot.sql` dan seed
lokal pada project disposable `DSM_GATE_A_20261016`. Targeted DB dan browser test
setelah reset lulus. Tidak ada database remote/produksi yang digunakan.

## Batas verifikasi

- **Source-inspected:** integrasi Reports/Dashboard, unavailable policy untuk filter
  tanpa dimensi quotation, reuse snapshot pada XLSX/PDF, dan timezone Jakarta.
- **Tested-local:** fresh migration replay, targeted/full suite, lint, typecheck,
  build, XLSX exact reconciliation, dan PDF file generation.
- **Browser-verified:** current/historical Reports, Dashboard forecast, XLSX/PDF
  download, console/page error, dan inspeksi visual layout desktop.
- **Unverified:** browser mobile, isi teks PDF melalui parser independen, database
  remote/produksi, deployment, dan migration parity remote.
- **Batas pagination:** UI dan XLSX menyatakan jumlah row page yang
  ditampilkan/diekspor dibanding total server. Aggregate tetap exact untuk seluruh
  scope, tetapi navigasi/export drilldown di atas 100 row belum tersedia pada UI.
- **Blocked:** tidak ada blocker lokal untuk Task 10b. Tindakan remote tetap tidak
  diizinkan; Task 18 live tetap blocker terpisah.

## File Task 10b dan split renderer

Core 10b:

- `src/components/reports/ReportsForecastSection.tsx`
- `src/routes/_app.reports.tsx`
- `src/routes/_app.dashboard.tsx`
- `src/lib/dashboard-export-data.ts`
- `e2e/crm-gate-a.spec.ts`

Split renderer/test agar batas file plan tetap eksplisit:

- `src/lib/export-xlsx.ts`
- `src/lib/export-pdf.ts`
- `tests/ui-smoke.test.tsx`

Koreksi evidence-driven pada migration 10a:

- `supabase/migrations/20261016144752_add_crm_forecast_snapshot.sql`

Tidak ada commit, push, deployment, atau migration remote pada slice ini.
