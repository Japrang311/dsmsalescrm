# Intent: Wajibkan follow-up terjadwal saat membuat Quotation

Ditangkap via `interview-me`, 2026-08-03. Konteks lahirnya intent ini: saat
mendiagnosis kenapa Dashboard "Activity Compliance" selalu 0% (lihat
`supabase/migrations/20260803120000_sync_client_next_fu_from_tasks.sql`),
ditemukan bahwa `clients.next_fu`/Activity Compliance sudah benar secara
teknis, tapi tetap 0% karena di production tidak ada satu pun Task aktif
yang punya `next_action_date` terisi -- akar masalahnya: membuat Quotation
tidak pernah memaksa sales menentukan langkah selanjutnya.

## Outcome
Form "Buat Quotation" (termasuk saat membuat revisi `_REV.n`) punya 2 kolom
wajib baru: **Next Action** (teks bebas) dan **Tanggal Follow-up**. Quotation
tidak bisa disimpan tanpa mengisi keduanya.

## Mekanisme (disepakati saat interview)
Saat Quotation tersimpan, sistem otomatis membuat satu `Task` baru yang
terhubung ke Quotation itu:
- `client_id` = client dari quotation
- `owner_id` = sales yang membuat quotation
- `method` = default `'Phone'` (tidak ditanya di form, bisa diganti nanti
  saat sales log progress di Task drawer)
- `category` = `'Quotation'`
- `next_action` = isi kolom Next Action
- `next_action_date` = isi kolom Tanggal Follow-up
- `due_date` = sama dengan `next_action_date`
- `workflow_status` = `'Open'`

Task inilah yang membuat `clients.next_fu` (via trigger yang sudah
terpasang) dan Activity Compliance card mulai menunjukkan angka nyata.

## User
Sales rep yang membuat atau merevisi Quotation.

## Why now
Activity Compliance selalu 0% bukan cuma soal database yang tidak
tersambung (sudah diperbaiki), tapi karena tidak ada titik di alur kerja
yang memaksa sales menentukan "selanjutnya ngapain" saat membuat Quotation.

## Success
Setiap Quotation baru/revisi baru otomatis punya follow-up terjadwal by
design (tidak bisa dilewati sales), sehingga Activity Compliance mulai
menunjukkan angka nyata seiring sales membuat Quotation baru.

## Constraint
- Form tetap ringkas: hanya 2 kolom baru (Next Action + Tanggal), TANPA
  kolom Metode.
- Desain UI/UX kolom baru ini mengikuti skill `bencium` frontend design
  (diminta eksplisit oleh user).

## Out of scope
- Form Customer PO dan Sales Order TIDAK disentuh oleh perubahan ini
  (kemungkinan menyusul terpisah, belum diputuskan).
- Quotation-quotation lama yang sudah ada TIDAK di-backfill dan TIDAK
  diminta melengkapi follow-up retroaktif.

## Next step
Lanjut ke `spec-driven-development` untuk menulis SPEC.md (acceptance
criteria, detail field/validasi, perilaku edge-case) sebelum implementasi,
karena perubahan ini menyentuh schema (auto-create Task) dan form
komersial yang sudah live di production.
