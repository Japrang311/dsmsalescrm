# CRM Reliability and Growth — Task 09a verification

Tanggal: 16 Oktober 2026
Status: **Verified local; browser, migration remote, dan deployment belum dilakukan**

## Perilaku yang berubah

1. Quotation memiliki `expected_close_date` nullable tanpa default dan tanpa
   backfill. Maknanya tetap ekspektasi PO/closing, terpisah dari expiry dan next
   follow-up.
2. Quotation baru tidak dapat dibuat atau dipindahkan ke stage `Commit` tanpa
   expected close date. Row legacy yang sudah ada tidak disentuh migration dan
   tidak diberi tanggal palsu.
3. Perubahan tanggal hanya tersedia melalui command
   `set_quotation_expected_close_date`. Command memvalidasi role, ownership,
   current revision, soft-delete, expected `updated_at`, dan request ID.
4. Setiap perubahan material membuat event immutable dengan tanggal lama/baru,
   actor, owner, request ID, reason opsional, dan version hasil. Retry request
   yang sama mengembalikan hasil sama; payload berbeda ditolak.
5. Revisi Quotation membawa expected close date dari revision sebelumnya sebagai
   draft. Tanggal itu tetap dapat diubah atau dikosongkan di stage non-Commit.

## Acceptance Task 09a

| Acceptance | Hasil lokal |
| --- | --- |
| Field nullable dan backward-compatible | Lulus: kolom nullable tanpa default; fresh reset seluruh migration lulus; tidak ada update/backfill row existing |
| Commit baru wajib memiliki tanggal | Lulus: direct insert dan `transition_commercial_stage` tanpa tanggal ditolak dan transaksi rollback |
| Legacy tidak diberi tanggal palsu | Lulus: migration hanya menambah kolom nullable; tidak ada statement backfill |
| Event old/new | Lulus: event RLS-scoped menyimpan old/new, actor/owner, request ID, reason, dan version hasil |
| Version check | Lulus: stale `updated_at` ditolak; dua command concurrent menghasilkan tepat satu pemenang |
| Retry dan rollback | Lulus: retry identik tidak menggandakan event; kegagalan insert event membatalkan update tanggal |
| Revision copy | Lulus: revision baru membawa tanggal dari revision sebelumnya |

AC12–13 belum dinyatakan selesai penuh. Task 09a menyediakan schema, mutation,
audit, dan concurrency contract; aggregate forecast dan rekonsiliasi bucket baru
menjadi scope Task 10.

## Perintah dan hasil

- Fresh migration pada project lokal terisolasi `DSM_GATE_A_20261016`:
  `bunx supabase@2.109.1 db reset --local` — lulus sampai migration
  `20261016135442_add_expected_close_command.sql`, termasuk seed sintetis lokal.
- Targeted DB/adapter/regression — **31 pass, 0 fail, 101 assertions**.
- Full test serial dengan container test eksplisit:
  `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test tests scripts supabase src --timeout 30000 --max-concurrency=1`
  — **743 pass, 0 fail, 2840 assertions, 101 files**.
- `bun run lint` — lulus.
- `bun run typecheck` — lulus.
- `bun run build` — lulus.
- `supabase db advisors --local` — tidak menemukan issue.
- `supabase db lint --local` — tiga error existing pada analisis fungsi temporary
  table (`tmp_ci_pool`, `tmp_imported_quotation_ids`,
  `tmp_business_calendar_import`). Tidak ada temuan pada migration Task 09a;
  aggregate lint tetap tidak diklaim hijau.

Endpoint API test adalah `http://127.0.0.1:54321` dan database test adalah
`127.0.0.1:54322`. Browser tidak relevan untuk slice 09a karena belum ada UI;
browser stage transition dan revision form menjadi acceptance Task 09b.

## Batas verifikasi

- Migration belum dijalankan pada database remote/produksi.
- Belum ada deployment atau smoke browser produksi.
- Belum ada UI untuk mengisi, menampilkan, atau mengonfirmasi tanggal; itu Task
  09b.
- Belum ada aggregate forecast/drilldown; itu Task 10.
- Tidak ada commit atau push untuk slice ini.

## File berubah

Implementasi inti:

- `supabase/migrations/20261016135442_add_expected_close_command.sql`
- `supabase/tests/crm-expected-close.test.ts`
- `src/lib/data/commercial-documents.ts`
- `src/lib/data/commercial-documents.test.ts`

Penyesuaian kontrak/regression fixture yang diwajibkan kolom dan rule baru:

- `src/lib/data/commercial-grouping.test.ts`
- `supabase/tests/commercial-documents-schema.test.ts`
- `supabase/tests/manual-sales-order-quotation-link.test.ts`
- `src/lib/data/dashboard-metrics-reconciliation.test.ts`

File untracked pengguna bertanggal 9 Agustus tidak diubah. `tasks/plan.md` dan
`tasks/todo.md` historis tidak diubah.
