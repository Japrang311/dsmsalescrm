# Task 18 — Production backup, restore drill, dan release

Tanggal: 18 Oktober 2026

Status: **AC21 verified; release `f928e21` deployed; ongoing backup schedule masih berisiko**

## Scope dan otorisasi

[Pasti] Pemilik produk mengizinkan target produksi, migration aplikasi, backup
inventory, dan isolated restore drill. Tidak ada reset atau restore terhadap
database produksi. Tidak ada pesan eksternal yang dikirim.

Target yang diverifikasi:

- Supabase project `qhtfixgbcpcitokeryxb`, region `ap-northeast-1`;
- Vercel project `dsmsalescrm`, production alias `https://www.dsmsales.app`;
- source release: commit bersih `f928e21` dari detached worktree.

## Backup produksi dan isolated restore

[Pasti] Project memakai Supabase Free plan. Managed downloadable backup tidak
tersedia pada plan ini; snapshot dibuat dengan Supabase CLI sesuai panduan
backup/restore resmi. Dump disimpan di luar repository pada direktori lokal
owner-only dengan mode direktori `0700` dan file `0600`.

Dokumentasi acuan:

- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

Snapshot mencakup roles, schema, data aplikasi, Auth, dan metadata Storage.
Storage memiliki 0 bucket dan 0 object, sehingga tidak ada payload file yang
perlu disalin terpisah. Hash SHA-256 dicatat pada manifest privat, bukan pada
repository.

Restore dilakukan ke stack Supabase lokal terisolasi dengan image PostgreSQL
yang sama dengan produksi (`17.6.1.147`). Dua percobaan awal gagal karena
perbedaan schema Auth pada target lama; keduanya berada dalam transaksi dan
rollback tanpa partial restore. Target kemudian dibuat ulang dengan versi yang
sesuai dan roles + schema + data dipulihkan dalam satu transaksi.

Data load terukur sekitar 0,69 detik setelah target tersedia. Berdasarkan
timestamp snapshot 06.28–06.32 WIB dan penyelesaian drill sebelum deployment
06.46 WIB, upper bound proses snapshot sampai rekonsiliasi kurang dari 18 menit,
di bawah RTO D07 empat jam.

## Rekonsiliasi restore

Semua count sumber produksi dan target restore sama:

| Objek                                    |     Produksi |      Restore |
| ---------------------------------------- | -----------: | -----------: |
| Auth users                               |           10 |           10 |
| Profiles                                 |           10 |           10 |
| Clients                                  |           95 |           95 |
| Sales orders                             |          297 |          297 |
| Sales-order items                        |          568 |          568 |
| Commercial documents                     |          545 |          545 |
| Commercial-document items                |        1.015 |        1.015 |
| Tasks                                    |          570 |          570 |
| Follow-up logs                           |        1.147 |        1.147 |
| Activity log                             |        2.161 |        2.161 |
| Targets                                  |           60 |           60 |
| Business-calendar holidays               |           25 |           25 |
| Storage buckets / objects                |        0 / 0 |        0 / 0 |
| Public RLS tables / policies / functions | 12 / 40 / 46 | 12 / 40 / 46 |

Delapan checksum agregat tambahan untuk tabel aplikasi utama juga sama. Auth
users dipulihkan, tetapi JWT secret target lokal sengaja berbeda; sesi login
produksi tidak dinyatakan portable ke target restore.

## Migration dan deployment

[Pasti] Dua belas migration additive diterapkan ke produksi, dari
`20261016125950_crm_reports_metric_scope` sampai
`20261017145427_add_crm_repeat_order_consumer_contracts`. CLI mengeluarkan warning
cache katalog `pgdelta`, tetapi daftar migration remote kemudian membuktikan
seluruh dua belas versi terdaftar.

[Pasti] Deployment production:

- deployment ID: `dpl_HHuPX6EwWRmX7v9Tsi2Rie5ZdXpT`;
- URL immutable: `https://dsmsalescrm-g1gmzph0b-hiulaukgalak.vercel.app`;
- alias: `https://www.dsmsales.app`, `https://dsmsalescrm.vercel.app`, dan
  `https://dsmsales.app`;
- status Vercel: `Ready`;
- rollback candidate sebelumnya:
  `https://dsmsalescrm-8mw589duj-hiulaukgalak.vercel.app`.

Schema baru additive; rollback aplikasi tidak menghapus migration atau data.

## Verifikasi

### Tested local sebelum release

- `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_SALES_WEB_APP_V2 bun run test:ci`
  — **820 pass, 0 fail, 3.175 assertions, 110 files**.
- `bun run lint` — lulus.
- `bun run typecheck` — lulus.
- `bun run build` — lulus.
- `git diff --check` — lulus.

### Production source/API inspected

- migration parity diverifikasi melalui daftar migration remote;
- RPC repeat-order dipanggil dengan tiga identity Sales aktif dan mengembalikan
  agregat owner-scoped tanpa membuka row milik owner lain;
- cohort Sales awal: 29 kandidat, 0 overdue, 8 on-cadence, 21 data-insufficient;
- scope Manager organisasi: 46 kandidat, 1 overdue, 15 on-cadence, 30
  data-insufficient. Perbedaan ini sesuai kontrak role, bukan mismatch count.

### Browser-verified production

Sesi autentikasi Sales Manager yang sudah ada dipakai read-only. Dashboard,
Clients, Tasks, Sales Orders, dan Reports selesai memuat. Komponen baru terlihat:
forecast, backlog Won tanpa SO, action queue, dan kesehatan repeat-order. Tasks
menampilkan aggregate organisasi 46 kandidat / 1 overdue, sama dengan RPC scope
Manager. Tidak ada console warning atau error pada halaman yang diperiksa.

Export Excel dipicu tetapi browser tidak mengembalikan download event yang dapat
diaudit. Karena itu isi export produksi **belum direkonsiliasi** dan tidak dihitung
sebagai pass. Tidak ada command koreksi, replay, snooze, feedback, follow-up, atau
mutation lain yang dijalankan terhadap data pelanggan produksi.

## Risiko tersisa

- [Pasti] Snapshot ini memenuhi recovery point untuk release 18 Oktober dan
  isolated restore membuktikan recoverability-nya.
- [Pasti] Free plan tidak menyediakan jadwal managed backup yang dapat diunduh.
  Tidak ada automation harian yang dibuktikan, sehingga RPO berkelanjutan 24 jam
  belum dijamin setelah snapshot ini menua.
- [Pasti] Authenticated smoke hanya memakai role Manager. Role Sales dan Executive
  dibuktikan melalui RPC production dan browser E2E lokal, bukan browser produksi.
- [Pasti] Export production, mutation smoke, dan komunikasi pilot ke Sales belum
  diverifikasi atau dilakukan.

Keputusan: AC21 dan gate recovery untuk release ini lulus. Risiko backup berkala
tetap menjadi blocker operasional sebelum release database berikutnya, bukan
alasan untuk mengklaim Task 17/Gate C selesai.
