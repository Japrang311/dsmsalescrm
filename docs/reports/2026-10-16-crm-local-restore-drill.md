# CRM local restore drill — 16 Oktober 2026

Status: **Verified local; production gate blocked**
Scope: instance Supabase test terisolasi `DSM_GATE_A_20261016`; tidak ada akses,
backup, reset, atau restore terhadap proyek remote.

## Tujuan dan batas bukti

Drill ini menguji prosedur backup/restore untuk schema `public`, `private`,
`auth`, dan `storage` memakai data sintetis. Bukti ini tidak membuktikan plan,
inventaris backup, retention, RPO, RTO, atau file Storage produksi.

## Fixture sintetis

- satu Auth user lokal dengan alamat `example.invalid`;
- satu bucket private lokal;
- satu objek teks sintetis 23 byte;
- database aplikasi fresh-reset; tidak mengandung data pelanggan produksi.

## Prosedur dan hasil

Waktu eksekusi: 16 Oktober 2026 sekitar 20:28 WIB.

1. `pg_dump` custom-format dijalankan pada database test untuk empat schema.
2. payload Storage lokal diarsipkan terpisah dari volume test.
3. dump dipulihkan ke database baru `crm_gate_a_restore` di instance lokal yang
   sama, setelah target dibuat kosong.
4. restore memakai `--exit-on-error`; exit code akhir `0`.
5. seluruh base-table row count pada empat schema dibandingkan antara sumber dan
   target; diff kosong.
6. payload Storage diekstrak ke direktori terisolasi dan SHA-256 dibandingkan.

| Pemeriksaan | Sumber | Restore | Hasil |
| --- | ---: | ---: | --- |
| Auth users | 1 | 1 | sama |
| Storage buckets | 1 | 1 | sama |
| Storage objects metadata | 1 | 1 | sama |
| Relasi `auth` / routines | 23 / 4 | 23 / 4 | sama |
| Relasi `private` / routines | 8 / 27 | 8 / 27 | sama |
| Relasi `public` / routines | 15 / 49 | 15 / 49 | sama |
| Relasi `storage` / routines | 10 / 17 | 10 / 17 | sama |
| Seluruh base-table row count | — | — | diff kosong |
| SHA-256 payload Storage | tersanitasi | tersanitasi | sama |

Ukuran dump database `563785` byte dan arsip Storage `4608` byte. Backup lokal
selesai di bawah satu detik menurut resolusi pengukuran shell; restore database
plus ekstraksi Storage memerlukan sekitar satu detik. Angka ini hanya berlaku
untuk fixture kecil dan **bukan** estimasi RTO produksi.

## RPO/RTO dan blocker

- RPO lokal fixture statis: 0 perubahan terukur antara snapshot dan restore.
- RTO lokal fixture kecil: sekitar 1 detik.
- RPO/RTO produksi: **unverified**.
- Blocker AC21: izin untuk membaca plan dan inventaris backup live, membuat backup
  sesuai mekanisme proyek aktual, serta memilih target restore remote terisolasi
  tidak termasuk otorisasi sesi ini.

Keputusan: prosedur lokal layak menjadi dasar runbook, tetapi Task 18 dan gate
migrasi produksi tetap **Blocked** sampai drill terhadap backup live yang
diotorisasi selesai.
