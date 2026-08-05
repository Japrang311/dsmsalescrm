# Task List: Win/Loss + Cycle Time Analytics (P1D)

Spec: `specs/p1d-winloss-cycle-analytics.md` (direvisi 2026-08-05).
Plan: `tasks/priority-1-plan.md`.

> **Status:** Belum diimplementasi.

> **Fitur paling aman dari Priority 1:** murni aditif. Tidak ada schema
> change, tidak ada migration, tidak ada dependency baru, tidak menyentuh
> production database. Semua data sudah ada — ini hanya query + selector +
> chart + export.

> **Sumber data:** `commercial_documents` (via facade `listCommercialItems()`
> yang mengembalikan `CommercialItem[]`), BUKAN tabel legacy `commercial_items`.

## Dependency order

```
Task 1D-1 (winLossRatio)     ─┐
Task 1D-2 (averageCycleTime) ─┤ ← saling independen, boleh paralel
Task 1D-3 (funnel + dwell)   ─┘
                               │
                               ▼
                    Task 1D-4 (komponen chart)
                               │
                               ▼
                    Task 1D-5 (wire ke reports)
                               │
                               ▼
                    Task 1D-6 (export)
```

## Tasks

- [ ] **Task 1D-1: Selector `winLossRatio`**
  - Acceptance:
    - Pure function di `src/lib/analytics-selectors.ts`, input
      `CommercialItem[]`, tidak ada query Supabase di dalamnya (ikut pola
      `report-selectors.ts` / `dashboard-selectors.ts`).
    - Hanya menghitung `type === "Quotation"` dengan stage terminal
      (`Closed Won` / `Closed Lost`). Stage non-terminal tidak masuk
      denominator.
    - Output per sales: jumlah won, jumlah lost, dan persentase
      `won / (won + lost) * 100`.
    - Pembagian nol ditangani: sales tanpa dokumen terminal → jangan
      menghasilkan `NaN`.
    - Lost reason breakdown **reuse** `quotationLostReasonBreakdown()` yang
      sudah ada di `report-selectors.ts` — jangan tulis ulang.
  - Verify:
    - Unit test: dataset normal, dataset semua-won, dataset semua-lost,
      dataset kosong, dataset hanya stage non-terminal.
    - `bun run test` pass.
  - Dependencies: None.
  - Files: `src/lib/analytics-selectors.ts`,
    `src/lib/analytics-selectors.test.ts` (keduanya baru).
  - Size: S.

- [ ] **Task 1D-2: Selector `averageCycleTime`**
  - Acceptance:
    - Join `CommercialItem.soNumber` ↔ `SalesOrder.soNumber` (sudah
      diverifikasi: `commercial_documents.so_number` diisi oleh RPC
      pembuatan SO).
    - Hitung selisih hari `SalesOrder.date - CommercialItem.documentDate`.
    - Quotation tanpa SO yang cocok → **di-skip**, jangan diestimasi dan
      jangan dihitung sebagai 0.
    - Selisih negatif (SO bertanggal lebih awal dari quotation — mungkin
      terjadi karena backdate HARIFF) → di-skip dan dihitung berapa
      banyak yang di-skip, supaya bisa ditampilkan sebagai catatan.
    - Output: average, median, min, max per sales, plus jumlah dokumen
      yang masuk hitungan.
  - Verify:
    - Unit test: pasangan cocok, quotation tanpa SO, SO tanpa quotation,
      selisih negatif, dataset kosong.
    - `bun run test` pass.
  - Dependencies: None (paralel dengan 1D-1).
  - Files: `src/lib/analytics-selectors.ts`,
    `src/lib/analytics-selectors.test.ts`.
  - Size: S.

- [ ] **Task 1D-3: Selector `stageConversionFunnel` + `averageDwellTime`**
  - Acceptance:
    - Funnel stage: Quotes Sent → Negotiation → Hot Prospect → Commit →
      Closed Won. Denominator stage N = semua Quotation yang pernah mencapai
      stage N; numerator = yang lanjut ke N+1.
    - `Closed Lost` dihitung sebagai keluar di stage tempat dia hilang —
      tetap masuk denominator stage-stage sebelumnya.
    - Extend `quotationFunnel()` yang sudah ada di `dashboard-selectors.ts`
      untuk conversion rate; jangan duplikasi logika hitung count per stage.
    - `averageDwellTime` dihitung dari `activity_log` kind
      `commercial_item_stage_change` (key: `commercial_document_id`).
    - **Dokumen tanpa histori stage change di-exclude**, bukan dianggap
      dwell 0. Selector mengembalikan juga jumlah dokumen yang di-exclude,
      supaya UI bisa menampilkan catatan bahwa angka ini hanya mencakup
      data sejak logging aktif.
  - Verify:
    - Unit test: semua stage terisi, semua Closed Won (konversi 100%),
      semua Closed Lost di Quotes Sent (0% lanjut), dataset kosong,
      activity_log kosong (dwell time harus mengembalikan "tidak ada data",
      bukan 0).
    - `bun run test` pass.
  - Dependencies: None (paralel dengan 1D-1, 1D-2).
  - Files: `src/lib/analytics-selectors.ts`,
    `src/lib/analytics-selectors.test.ts`, kemungkinan
    `src/lib/data/dashboard-selectors.ts` (extend, jangan ubah perilaku
    fungsi lama).
  - Size: M.

- [ ] **Task 1D-4: Komponen chart di `src/components/reports/`**
  - Acceptance:
    - Tiga komponen terpisah: Win/Loss, Cycle Time, Conversion Funnel.
      **Jangan inline ke `_app.reports.tsx`** — file itu sudah 1167 baris.
    - Pakai Recharts (sudah ada), gaya `Card`/`CardHeader`/`CardContent`
      mengikuti chart yang sudah ada di reports.
    - Empty state pakai `src/components/ui/empty-state.tsx` yang sudah ada.
    - Chart dwell time menampilkan catatan eksplisit kalau sebagian dokumen
      di-exclude karena tidak punya histori stage change.
    - Responsif: 1 kolom di mobile, 2 kolom di desktop untuk Win/Loss +
      Cycle Time (ikut pola grid reports existing).
  - Verify:
    - `bun run dev`, buka Reports: ketiga chart render dengan data asli.
    - Kecilkan window ke lebar mobile: tidak ada horizontal scroll / layout
      pecah.
    - `bun run lint` pass.
  - Dependencies: 1D-1, 1D-2, 1D-3.
  - Files: 3 file baru di `src/components/reports/`.
  - Size: M.

- [ ] **Task 1D-5: Wire ke `_app.reports.tsx`**
  - Acceptance:
    - Tiga section baru dipasang setelah chart existing.
    - Data diambil dari `useDashboardData()` yang sudah ada — **jangan**
      tambah query Supabase baru; data `commercial-items`, `sales-orders`
      sudah di-fetch di sana dan di-share lewat cache React Query.
    - Kalau `activity_log` untuk dwell time perlu di-fetch, tambahkan
      sebagai query baru dengan query key konsisten, dan pastikan hanya
      di-fetch saat Reports dibuka (jangan bebani dashboard).
    - Filter `ReportFilterBar` existing (owner/range/client) berlaku juga
      untuk chart baru — tidak ada filter baru.
    - Angka **konsisten dengan dashboard KPI**. Kalau jumlah Quotation di
      funnel berbeda dengan yang ditampilkan dashboard, itu bug, bukan
      "beda definisi" — selidiki sebelum lanjut.
  - Verify:
    - Ganti owner di filter → ketiga chart ikut berubah.
    - Bandingkan jumlah Closed Won di chart baru dengan angka di dashboard
      untuk periode yang sama → harus sama persis.
    - Range kosong → empty state tampil, bukan chart kosong / error.
    - `bun run lint` pass, `bun run build` sukses.
  - Dependencies: 1D-4.
  - Files: `src/routes/_app.reports.tsx`.
  - Size: S.

- [ ] **Task 1D-6: Integrasi export CSV/XLSX/PDF**
  - Acceptance:
    - Data analytics baru masuk ke context export yang sudah ada
      (`dashboard-export-data.ts`) dan keluar di CSV/XLSX/PDF.
    - Format export existing **tidak rusak** — kolom lama tetap di posisi
      yang sama, konsumen file lama tidak terganggu.
    - Kalau menambah kolom/sheet baru mengubah struktur file yang sudah
      dipakai user, **tanya user dulu** (spec: "Ask first").
  - Verify:
    - Export ketiga format, buka file hasilnya, konfirmasi data analytics
      ada dan angkanya sama dengan yang di layar.
    - `bun run test` pass (termasuk `dashboard-export-data.test.ts` existing).
  - Dependencies: 1D-5.
  - Files: `src/lib/dashboard-export-data.ts`, `src/lib/export-xlsx.ts`,
    `src/lib/export-pdf.ts`, `src/lib/export-csv.ts` (sesuai kebutuhan).
  - Size: S–M.

## Checkpoint akhir P1D

- [ ] 3 section baru tampil di Reports
- [ ] Angka konsisten dengan dashboard KPI (dibandingkan langsung, bukan
      diasumsikan)
- [ ] Filter ReportFilterBar berfungsi untuk chart baru
- [ ] Empty state tampil saat tidak ada data
- [ ] Export CSV/XLSX/PDF berisi data baru, format lama tidak rusak
- [ ] `bun run test` pass, `bun run lint` pass, `bun run build` sukses
- [ ] **Konfirmasi user sebelum push ke `main`**
