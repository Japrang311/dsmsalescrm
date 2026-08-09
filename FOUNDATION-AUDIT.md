# Audit Fondasi — DSM Sales CRM

> Dibuat: 2026-08-05
> Metode: pemeriksaan langsung terhadap codebase + stack Supabase lokal.
> **Bukan** terhadap database production — tidak ada akses read-only ke
> `qhtfixgbcpcitokeryxb` di sesi ini, jadi temuan soal *data* production
> belum terverifikasi. Temuan soal *skema*, *kode*, dan *proses* berlaku
> penuh karena migration lokal dan remote sudah sinkron.

## Ringkasan

Fondasi keamanan database **kuat**. Yang rapuh adalah **proses** — tidak ada
yang mencegah kode rusak sampai ke production, dan tidak ada yang memberi
tahu Anda kalau production rusak.

Dua hal rusak sekarang juga, dan keduanya lolos ke `main` karena sebab yang
sama: tidak ada gerbang otomatis.

---

## 🔴 Rusak sekarang

### F1. Tidak ada CI — tidak ada yang mengecek apa pun sebelum deploy

**Ini akar dari hampir semua temuan lain.**

- Tidak ada `.github/workflows/` — tidak ada GitHub Actions.
- Tidak ada git hook (husky/lint-staged).
- Vercel auto-deploy tiap push ke `main`.

Artinya: `bun run lint` dan `bun run test` hanya jalan kalau Anda ingat
menjalankannya manual. Kalau lupa, kode rusak tetap sampai ke
`dsmsalescrm.vercel.app` tanpa hambatan. Tidak ada staging.

Bukti bahwa ini bukan teori: dua temuan di bawah ini sudah ter-commit dan
sudah ter-deploy.

**Perbaikan:** GitHub Actions yang menjalankan `lint` + `build` di setiap
push/PR. Test butuh Supabase, jadi bisa menyusul di tahap kedua.
**Effort: kecil.** Ini pengungkit terbesar di seluruh daftar ini.

---

### F2. `bun run lint` merah di `main`

```
supabase/tests/null-role-rpc-gates.test.ts
  135:22  error  prettier/prettier
✖ 13 problems (1 error, 12 warnings)
```

Masuk lewat commit `86236f9` ("require a scheduled follow-up when creating
or revising a Quotation") — fitur yang sudah live di production sejak
3 Agustus.

Dampaknya bukan pada aplikasi (ini cuma format di file test), tapi pada
kepercayaan: **selama lint merah, Anda tidak bisa membedakan kerusakan baru
dari kerusakan lama.** Gerbangnya jadi tidak berguna.

**Perbaikan:** `bun run format`, lalu commit. Satu perintah.

---

### F3. `bun run test` merah — 1 dari 480 test gagal

```
supabase/tests/task-exceptions-rls.test.ts
"Executive sees only active escalated Manager-owned task detail"
Expected: ["41e95aa0…"]
Received: ["41e95aa0…", "497da848…"]
```

**Ini BUKAN lubang keamanan.** Sudah saya telusuri sampai akarnya:

- Policy `tasks_select` mengizinkan Executive melihat task Manager hanya
  kalau statusnya `Escalated`.
- `Escalated` = lewat **2 hari kerja** dari due date, dihitung terhadap
  **tanggal hari ini sungguhan** (`now() at time zone 'Asia/Jakarta'`).
- Test menanam `due_date: "2026-07-26"` sebagai contoh "telat tapi belum
  eskalasi". Itu benar saat test ditulis 27 Juli (baru 1 hari telat).
- Hari ini 5 Agustus. Task itu sudah 10 hari telat, jadi ikut jadi
  `Escalated`, ikut terlihat, dan test gagal.

Policy-nya bekerja persis seperti seharusnya. Test-nya yang membusuk.

**Perbaikan:** ganti tanggal hardcoded jadi relatif terhadap hari ini
(mis. `today - 10 hari` untuk escalated, `today - 1 hari` untuk yang belum).
Catatan: RLS memanggil `compute_task_due_state` tanpa parameter `p_as_of`,
jadi tanggal tidak bisa disuntik dari test — harus tanggal test-nya yang
digeser.

---

## 🟠 Akan rusak lagi

### F4. Test bergantung waktu — F3 baru yang pertama

9 file test menyentuh logika due-state/eskalasi, dan pola tanggal hardcoded
tersebar luas (`task-progress.test.ts` punya 13 literal tanggal,
`super-admin-rls.test.ts` 12).

Selama tanggalnya ditanam mati sementara logikanya membandingkan dengan
hari ini, test akan terus membusuk satu per satu seiring kalender berjalan.
Yang berbahaya: **test yang menjaga batas keamanan** (seperti F3) ikut
membusuk. Test keamanan yang sering merah karena alasan salah lebih buruk
daripada tidak ada test — orang belajar mengabaikannya, lalu regresi asli
ikut terabaikan.

Aplikasi sudah punya `src/lib/app-time.ts` (jam bisnis deterministik) untuk
sisi frontend, tapi test SQL tidak punya padanannya.

**Perbaikan:** helper tanggal relatif untuk test, dipakai konsisten.

---

### F5. Tidak ada pemantauan error production

- Tidak ada Sentry atau sejenisnya.
- Yang ada `src/lib/lovable-error-reporting.ts` — itu pipeline Lovable,
  bukan sesuatu yang Anda pantau sendiri.

Artinya kalau sales kena error jam 10 pagi, Anda baru tahu kalau dia
mengeluh. Kalau dia diam saja dan menghindari fitur itu, Anda tidak akan
pernah tahu.

**Perbaikan:** ada tier gratis yang memadai untuk skala ini. **Effort: kecil.**

---

## 🟡 Perlu dibereskan, tidak mendesak

### F6. Database lokal tidak mencerminkan production

| | Lokal | Production |
|---|---|---|
| commercial_documents | **1** | ~586 |
| sales_orders | **0** | terisi |
| clients | 69 | terisi |

Konsekuensinya: test yang hijau di lokal tidak membuktikan apa pun tentang
perilaku terhadap data asli. Dan tidak ada tempat untuk melatih migration
terhadap data yang realistis sebelum menyentuh production — padahal
CLAUDE.md mewajibkan "local-first".

Fondasi "local-first" itu ada di aturan, tapi belum ada di kenyataan.

**Perbaikan:** seed lokal yang meniru bentuk dan volume data production
(anonim). Tidak perlu 586, tapi jangan 1.

---

### F7. `anon` punya TRUNCATE di `business_calendar_holidays`

```
anon | REFERENCES
anon | TRIGGER
anon | TRUNCATE
```

Ini satu-satunya tabel `public` yang masih punya grant untuk `anon`. 11
tabel lain sudah bersih. `business_calendar_holidays` dibuat 27 Juli —
setelah migration pengetatan 18 Juli — jadi dia mewarisi default privilege
Supabase dan tidak pernah ikut di-revoke.

**Seberapa bahaya:** rendah, dan saya tidak mau membesar-besarkan.
TRUNCATE tidak bisa dipanggil lewat REST API Supabase (PostgREST hanya
mengenal SELECT/INSERT/UPDATE/DELETE dan RPC). Untuk memanfaatkannya orang
perlu koneksi Postgres langsung sebagai role `anon`, yang tidak terekspos
ke internet. Jadi ini **bukan pintu terbuka** — ini inkonsistensi dengan
standar keamanan yang Anda sendiri sudah tegakkan di semua tabel lain.

Yang perlu diingat: TRUNCATE menembus RLS. Jadi kalau suatu saat ada jalur
baru yang berjalan sebagai `anon`, ini langsung jadi nyata.

**Perbaikan:** satu migration, `revoke all on public.business_calendar_holidays
from anon;`

---

### F8. Nol test untuk route dan halaman

- 59 file test — hampir semua untuk data layer dan RLS. Itu bagus.
- 17 route, 78 komponen — hanya 6 komponen punya test, dan itu pun menguji
  logika (schema/filter), bukan render.

Jadi bug logika bisnis kemungkinan tertangkap; bug tampilan dan interaksi
tidak sama sekali. Untuk aplikasi yang dipakai orang setiap hari, itu celah
yang nyata — tapi menutupnya mahal, dan bukan prioritas sekarang.

---

### F9. Dokumentasi menyesatkan di dua tempat

1. **CLAUDE.md** menyatakan `vite.config.ts` di-wire oleh
   `@lovable.dev/vite-tanstack-config` dan melarang menambah plugin manual.
   Package itu **tidak ada** di `package.json`, dan `vite.config.ts` memang
   wire plugin secara manual. Siapa pun (termasuk AI) yang menyentuh file
   itu akan bingung atau salah langkah.

2. **`public.commercial_items` sudah tidak ada** sebagai tabel — sisanya
   ada di `private.legacy_commercial_items_20260718`. Tapi nama
   `CommercialItem` masih dipakai di seluruh kode sebagai tipe domain dan
   facade. Ini terbukti berbahaya: draft spec P1B sempat menargetkan
   subscription realtime ke `public.commercial_items`, yang akan langsung
   error karena tabelnya tidak ada.

---

## ✅ Fondasi yang sudah kuat

Supaya seimbang — ini yang tidak perlu disentuh:

- **RLS lengkap.** 12 dari 12 tabel `public` punya RLS aktif dan minimal
  satu policy. Tidak ada tabel yang bocor.
- **Tidak ada `SECURITY DEFINER` tanpa `search_path` terkunci** (0 dari
  seluruh fungsi di `public` dan `private`). Migration pengetatan 30 Juli
  benar-benar bekerja.
- **`anon` tidak punya akses baca/tulis ke satu pun tabel bisnis.**
- **Build lulus** tanpa error.
- **479 dari 480 test lulus**, dengan 59 file test — cakupan data layer dan
  RLS termasuk bagus untuk proyek seukuran ini.
- Migration lokal dan remote sinkron.

---

## Urutan yang saya sarankan

| # | Item | Effort | Kenapa duluan |
|---|---|---|---|
| 1 | **F2** — jalankan `bun run format`, commit | menit | Bikin gerbang berguna lagi |
| 2 | **F3** — perbaiki test yang membusuk | kecil | Sama; dan pastikan bukan bug keamanan |
| 3 | **F1** — pasang CI (lint + build) | kecil | Setelah hijau, kunci supaya tidak merah lagi |
| 4 | **F5** — pemantauan error production | kecil | Berhenti buta terhadap kerusakan di lapangan |
| 5 | **F4** — helper tanggal relatif untuk test | sedang | Hentikan pembusukan berulang |
| 6 | **F7** — revoke grant `anon` | menit | Rapikan, risiko rendah |
| 7 | **F9** — perbaiki CLAUDE.md | menit | Cegah kesalahan berikutnya |
| 8 | **F6** — seed lokal realistis | sedang | Bikin "local-first" jadi nyata |
| 9 | **F8** — test UI | besar | Tunda |

Empat item pertama semuanya kecil, dan bersama-sama mengubah keadaan dari
"tidak ada yang menjaga" jadi "ada yang menjaga". Itu perbaikan fondasi
yang sebenarnya.
