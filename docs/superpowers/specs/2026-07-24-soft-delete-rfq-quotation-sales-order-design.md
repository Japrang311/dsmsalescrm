# Soft Delete untuk RFQ, Quotation, dan Sales Order

Tanggal: 2026-07-24
Status: Disetujui

## Masalah

Saat ini tidak ada cara untuk menghapus RFQ, Quotation, atau Sales Order
dari aplikasi setelah dibuat, meskipun record tersebut dibuat karena
kesalahan atau merupakan duplikat. Pengguna meminta fitur hapus, yang
tersedia untuk semua role kecuali Executive.

## Batasan yang ditemukan saat proses desain

Setiap tabel yang terekspos di aplikasi ini sengaja **tidak memiliki
kebijakan DELETE permanen** (PRD §9: "archive over hard delete" — lihat
komentar di `clients.sql`, `tasks.sql`, `commercial_items.sql`,
`sales_orders.sql`, `normalize_commercial_documents.sql`). Data revenue
(Sales Order) khususnya tidak boleh hilang begitu saja dari laporan
historis. Fitur ini mengikuti pola yang sudah ada tersebut: **soft
delete**, bukan `DELETE` SQL biasa.

## Cakupan (Scope)

- RFQ dan Quotation sama-sama berupa baris di `public.commercial_documents`
  (dibedakan lewat kolom `type`). Sales Order berada di
  `public.sales_orders`.
- Role: Sales, Manager, Super Admin bisa menghapus/memulihkan. Executive
  tidak berubah (tetap read-only).
- Sales hanya bisa menghapus/memulihkan record miliknya sendiri (dicocokkan
  lewat `owner_id`). Manager dan Super Admin bisa menghapus/memulihkan
  record siapa saja. Ini persis sama dengan kebijakan RLS UPDATE yang
  sudah ada di kedua tabel — tidak perlu ada perubahan RLS untuk
  penegakan izin akses.
- Penghapusan bersifat bisa dipulihkan (ada aksi "Restore"), bukan
  penghapusan permanen satu arah.

## Di luar cakupan (secara eksplisit)

- **Tidak ada pemblokiran saat menghapus RFQ/Quotation yang sudah punya
  Sales Order turunan.** Sudah dicek di skema database: tidak ada foreign
  key atau relasi apa pun dari `sales_orders` yang mengarah balik ke baris
  `commercial_documents` asal-usulnya secara konsep. Untuk menegakkan
  aturan ini perlu menambah relasi baru yang dilacak di database, yang
  merupakan fitur terpisah dan jauh lebih besar. Fitur "Restore" menjadi
  jaring pengaman kalau ternyata ini jadi masalah di praktiknya.
- Tidak ada perubahan pada selector dashboard/laporan, selain efek alami
  dari baris yang terhapus otomatis dikecualikan begitu query
  list/detail memfilter berdasarkan `deleted_at`.
- Tidak ada jalur hapus permanen (hard delete) dalam fitur ini.

## Perubahan skema database

Migration baru menambahkan kolom berikut ke `public.commercial_documents`
dan `public.sales_orders`:

```sql
alter table public.commercial_documents
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);

alter table public.sales_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id);
```

Tidak ada perubahan kebijakan RLS. Kebijakan UPDATE yang sudah ada di
kedua tabel sudah berbunyi:

```text
(role = 'sales' and owner_id = auth.uid()) or role in ('manager', 'super_admin')
```

Soft delete/restore diimplementasikan sebagai UPDATE terhadap dua kolom
ini, sehingga kebijakan yang sudah ada ini otomatis menegakkan persis
set izin akses yang diminta.

**Catatan penting (ditemukan saat pengecekan skema):** `commercial_documents`
dan `sales_orders` TIDAK punya table-level UPDATE grant ke role
`authenticated` — hanya kolom tertentu yang di-grant secara eksplisit
(lihat `20260719041351_harden_normalized_document_permissions.sql`). Migrasi
baru untuk fitur ini **wajib** menambahkan `deleted_at` dan `deleted_by` ke
grant tersebut, contoh:

```sql
grant update (deleted_at, deleted_by) on table public.commercial_documents to authenticated;
grant update (deleted_at, deleted_by) on table public.sales_orders to authenticated;
```

Kalau langkah ini terlewat, RLS policy akan mengizinkan tapi UPDATE tetap
gagal karena kekurangan grant kolom di level Postgres — ini sudah dua kali
terjadi di proyek ini sebelumnya (lihat `HANDOFF.md` poin gotcha soal grant
kolom).

Migration kedua (transaksi terpisah, mengikuti pola yang sudah ada untuk
penambahan nilai enum — lihat
`20260721100000_add_sales_order_edit_activity_kinds.sql`) menambahkan ke
`public.activity_kind`:

- `commercial_document_deleted`
- `commercial_document_restored`
- `sales_order_deleted`
- `sales_order_restored`

## Perubahan data layer

`src/lib/data/commercial-documents.ts`:

- `deleteCommercialDocument(id)`: mengisi `deleted_at = now()`,
  `deleted_by = user saat ini`. Sebelum menyimpan, dicek dulu apakah ada
  baris `commercial_documents` lain yang punya
  `supersedes_document_id = id` (artinya sudah ada revisi Quotation yang
  lebih baru) — jika ada, permintaan hapus ditolak dengan pesan error
  yang jelas. Pengecekan ini berlaku untuk baris RFQ maupun Quotation
  (untuk RFQ pengecekan ini otomatis tidak pernah cocok, karena RFQ tidak
  ikut dalam rantai revisi).
- `restoreCommercialDocument(id)`: mengosongkan kedua kolom tersebut.
- Keduanya menulis satu baris `activity_log` (aktor, dokumen target,
  jenis aksi).
- Fungsi fetch yang sudah ada, yang dipakai oleh tampilan list/detail,
  ditambahkan `.is("deleted_at", null)` supaya baris yang terhapus
  otomatis hilang dari tampilan normal tanpa perlu menyentuh logika
  bisnis di setiap tempat pemanggilan.
- Fungsi fetch baru (atau parameter opsional pada fungsi yang sudah ada)
  mengembalikan hanya baris dengan `deleted_at is not null`, untuk
  tampilan "Show deleted".

`src/lib/data/sales-orders.ts`: bentuknya sama —
`deleteSalesOrder(id)` / `restoreSalesOrder(id)`, tanpa pengecekan
revisi (Sales Order tidak punya rantai revisi), fungsi fetch yang sudah
ada memfilter `deleted_at is null` secara default, ditambah jalur fetch
baru khusus untuk yang terhapus.

## Perubahan UI

Halaman detail (`_app.rfq.$id.tsx`, `_app.quotations.$id.tsx`,
`_app.sales-orders.$soId.tsx`):

- Menambahkan tombol "Delete" di sebelah kontrol edit yang sudah ada,
  dengan pengecekan kepemilikan yang sama seperti yang sudah dipakai
  untuk edit (contoh: `canEditOwnSo` di halaman detail SO — sales hanya
  melihatnya di record miliknya sendiri, manager/super admin selalu
  melihatnya, executive tidak pernah melihatnya).
- Klik tombol membuka dialog konfirmasi `AlertDialog` dari shadcn. Setelah
  dikonfirmasi, memanggil fungsi delete lalu kembali ke halaman list
  terkait.
- Jika penghapusan Quotation ditolak karena ada revisi yang lebih baru,
  pesan error tersebut ditampilkan langsung di halaman, bukan berpindah
  halaman.

Halaman list (`_app.rfq.index.tsx`, `_app.quotations.index.tsx`,
`_app.sales-orders.index.tsx`):

- Menambahkan toggle "Show deleted", hanya terlihat untuk
  Sales/Manager/Super Admin (disembunyikan untuk Executive), yang
  mengganti query list ke jalur fetch khusus data terhapus.
- Dalam mode ini, aksi per baris berubah menjadi "Restore", menggantikan
  aksi baris normal.

## Pengujian

- Test RLS/data-layer (`bun run test`) yang mencakup: sales bisa
  menghapus/memulihkan record miliknya sendiri, tidak bisa menghapus
  milik orang lain; manager/super_admin bisa menghapus/memulihkan record
  siapa saja; executive tidak bisa menghapus atau memulihkan (saat ini
  tidak ada kebijakan UPDATE yang berlaku untuk executive, jadi seharusnya
  sudah otomatis gagal/fail-closed — perlu dikonfirmasi dengan test);
  baris yang terhapus dikecualikan dari fungsi fetch normal dan muncul di
  jalur fetch khusus data terhapus; menghapus Quotation yang punya revisi
  lebih baru akan ditolak; memulihkan record mengosongkan kedua kolom dan
  membuat baris terlihat kembali di fetch normal.
