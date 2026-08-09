# Supabase `db lint` — accepted static-analysis exceptions

Status: **accepted** (false-positive dari static analyzer, bukan bug runtime).

## Ringkasan

`supabase db lint --linked` melaporkan 3 isu level "error" di 3 fungsi. Semuanya
berpola sama: fungsi membuat `temporary table` **di dalam body fungsi** lalu
memakainya, dan static analyzer Supabase tidak menelusuri aliran
create-then-use tersebut — ia menandai referensi temp table sebagai
"relation does not exist".

| Fungsi | Temp table | Migration sumber |
| --- | --- | --- |
| `private.migrate_commercial_document_data` | `tmp_ci_pool` | `20260719024024_migrate_commercial_document_data.sql` |
| `public.admin_import_normalized_documents` | `tmp_imported_quotation_ids` | `20260719034313_add_normalized_sheet_import.sql` |
| `public.import_business_calendar_holidays` | `tmp_business_calendar_import` | `20260805091908_import_business_calendar_holidays.sql` |

## Mengapa ini false-positive

- Temp table dibuat **sebelum** dipakai, dalam fungsi yang sama:
  `create temporary table tmp_x (...) on commit drop;` lalu `insert into
  tmp_x ...` / `from tmp_x`.
- SQL sebenarnya valid dan sudah terverifikasi: migration dipakai oleh
  `supabase db reset --local` tanpa error, dan di production importer
  berjalan normal.
- Static analyzer mengevaluasi setiap statement terhadap skema statis;
  temp table yang dibuat saat runtime tidak ada di skema statis, sehingga
  referensi berikutnya dikira "relation does not exist" (sqlState `42P01`).

## Keputusan

**Dokumentasikan sebagai accepted exception, tidak di-fix.** Alasan:

1. Memindahkan `create temporary table` keluar fungsi tidak mungkin untuk
   fungsi migration satu-kali (fungsi dihapus setelah migrasi selesai).
2. Menulis ulang fungsi agar tidak memakai temp table = refactor besar
   berisiko pada data migration yang sudah terverifikasi, demi memuaskan
   static analyzer yang keliru.
3. `db lint` exit code 0; isu ini hanya muncul sebagai laporan, tidak
   memblokir CI (job static db gates tetap pass — lihat CI pipeline).

## Kapan re-evaluasi

- Jika Supabase memperbaiki static analyzer (temp table support) dan
  warning hilang → hapus dokumen ini.
- Jika ada insiden runtime terkait fungsi importer → re-investigasi,
  jangan otomatis percaya "accepted".

## Bukti verifikasi

- `supabase db lint --linked` → 3 isu, semua pola temp-table di atas.
- `supabase db reset --local` → semua migration sampai `20260809021904`
  apply sukses (temp table berfungsi).
- Production import & business calendar CRUD berjalan (tidak ada error
  42P01 di log).
