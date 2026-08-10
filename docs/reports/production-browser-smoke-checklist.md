# Production Browser Smoke — Checklist UAT

**Tujuan:** verifikasi production authenticated flow setelah deploy `ec4819f`.
**URL:** https://dsmsalescrm.vercel.app
**Butuh:** akun login (role Sales / Manager / Super Admin — pakai akun sendiri, jangan share).

## Cara jalan

1. Login.
2. Jalanin langkah di bawah. Tiap langkah: ✅ kalau sukses, ❌ kalau error/gagal, tulis detail errornya.
3. Kalau ada error, screenshot + kirim ke saya — saya trace dari log/database.

## Checklist

### 1. Login & akses
- [ ] Login berhasil, redirect ke Dashboard
- [ ] Sidebar muncul dengan menu: Dashboard, Clients, Tasks, Pipeline, Quotations, Sales Orders, Reports

### 2. Dashboard
- [ ] KPI cards render (revenue, pipeline, tasks)
- [ ] Chart revenue trend render
- [ ] No console error (F12 → Console)

### 3. Clients
- [ ] List client render
- [ ] Buka 1 client → detail render (info, tasks, quotations tab)
- [ ] Coba search client di combobox (tipe 2-3 huruf)

### 4. Tasks
- [ ] Inbox tasks render
- [ ] Buka task drawer → edit title → save → tersimpan
- [ ] Buat task baru → muncul di list

### 5. Pipeline
- [ ] Pipeline board render per stage
- [ ] Filter owner/range berfungsi

### 6. Quotations
- [ ] List quotation render
- [ ] Buka 1 quotation → detail render (header, items, total)
- [ ] Export PDF/XLSX jalan (tombol export, file terunduh)

### 7. Sales Orders
- [ ] List SO render
- [ ] Buka 1 SO → detail render
- [ ] Form Create/Edit SO: client picker menampilkan semua client (termasuk yang owner beda dari yang lagi login)

### 8. Reports
- [ ] Reports page render
- [ ] Section Product Intelligence (Stage 4) render: Win/Loss, Lost Reasons, Cycle Time, Funnel/Dwell
- [ ] Tiap card ada CoverageNote (Cakupan: x/y (z%) · efektif sejak ...)
- [ ] Export executive report XLSX jalan (6 sheet baru: Win-Loss, Lost Reasons, Cycle Time, Stage Funnel, Stage Dwell, Data Quality)

## Khusus role Manager/Super Admin

- [ ] Settings → Tim & Role render (list team, add/edit member)
- [ ] Reassign owner dari 1 client → berhasil (jangan pakai data produksi asli untuk uji ini, pakai data test)

## Hasil

| Area | Status | Catatan |
| --- | --- | --- |
| Login | | |
| Dashboard | | |
| Clients | | |
| Tasks | | |
| Pipeline | | |
| Quotations | | |
| Sales Orders | | |
| Reports | | |
| Settings (Manager+) | | |
