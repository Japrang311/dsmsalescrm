# CRM Reliability and Growth — Task 09b verification

Tanggal: 16 Oktober 2026
Status: **Verified local + browser; migration remote dan deployment belum dilakukan**

## Perilaku yang berubah

1. Form Quotation menampilkan `Expected Close` sebagai tanggal PO/closing yang
   terpisah dari Quotation expiry dan next follow-up. Stage `Commit` tidak dapat
   disimpan tanpa tanggal tersebut.
2. Pembuatan Quotation stage `Commit` mengirim tanggal dalam RPC transaksi yang
   sama. Ini menutup gap kontrak yang ditemukan saat integrasi UI: sebelumnya
   command create tidak menerima tanggal sehingga UI tidak mungkin memenuhi
   constraint Commit secara atomik.
3. Pipeline drawer, dialog perpindahan stage drag/drop/Tasks, dan halaman detail
   Quotation meminta Expected Close sebelum masuk `Commit`. Error command server
   dipertahankan dan ditampilkan, bukan diganti pesan generik.
4. Revisi Quotation membawa tanggal revision sebelumnya ke form untuk
   dikonfirmasi, disesuaikan, atau dikosongkan. Konfirmasi disimpan atomik di
   RPC `revise_quotation`; kegagalan tidak dapat meninggalkan revision parsial.
   Caller lama yang tidak mengirim parameter konfirmasi tetap mewarisi tanggal.
5. Tanggal dipetakan ke model `CommercialItem`, sehingga nilai yang tersimpan
   tetap terlihat setelah cache invalidation dan reload.

## Acceptance Task 09b

| Acceptance                                        | Hasil lokal                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expected Close berbeda dari expiry/next follow-up | Lulus: field dan helper text terpisah pada create, revision, Pipeline, dan detail                                                                                |
| Commit tanpa tanggal ditolak                      | Lulus: schema form, direct insert, stage RPC, create RPC, dan browser transition diuji                                                                           |
| Validasi server dapat ditampilkan                 | Lulus: dialog transition menyimpan error command inline; drawer/detail menampilkan detail error melalui toast                                                    |
| Revision dapat mengonfirmasi tanggal              | Lulus: browser membuktikan nilai diwariskan, diubah, disimpan atomik, lalu tampil pada revision baru; DB test membuktikan caller lama inherit dan explicit clear |
| Persist dan reload                                | Lulus: browser memindahkan quotation ke Commit lalu halaman detail membaca tanggal tersimpan                                                                     |
| Caller lama create/revision tetap kompatibel      | Lulus: parameter baru trailing dengan default; seluruh regression adapter/DB lama tetap lulus                                                                    |

AC12–13 belum dinyatakan selesai penuh. Task 09a–09b menyelesaikan input,
mutation, audit, dan flow browser; aggregate forecast, drilldown, export, serta
rekonsiliasi bucket adalah scope Task 10a–10b.

## Bukti pengujian

- Targeted DB/schema/adapter:
  `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test src/components/clients/commercial-form-schemas.test.ts src/lib/data/commercial-documents.test.ts supabase/tests/crm-expected-close.test.ts --timeout 30000 --max-concurrency=1`
  — **23 pass, 0 fail, 86 assertions**.
- Atomicity regression yang sempat gagal karena command pertama menunjuk
  container project utama yang sedang berhenti, diulang dengan container test
  eksplisit — **1 pass, 0 fail, 9 assertions**.
- Full local suite dengan container test eksplisit — **746 pass, 0 fail, 2852
  assertions, 101 files**.
- Browser Playwright Chromium:
  `npx playwright test e2e/browser-flows.spec.ts --grep "quotation Commit transition" --project=chromium`
  — **1 pass**. Flow mencakup reject tanpa tanggal, save stage, reload detail,
  inherit revision, edit tanggal, dan persist revision baru.
- `npm run lint` — lulus.
- `npm run typecheck` — lulus.
- `npm run build` — lulus.
- `git diff --check` — lulus.
- `supabase db advisors --local` — tidak menemukan issue.
- `supabase db lint --local` — tiga error existing pada analisis fungsi temporary
  table (`tmp_ci_pool`, `tmp_imported_quotation_ids`, dan
  `tmp_business_calendar_import`); tidak ada temuan pada migration Task 09a–09b.

Browser memakai build lokal di `http://127.0.0.1:4173`; API test tepat
`http://127.0.0.1:54321` dan database test `127.0.0.1:54322`. Data yang dibuat
adalah fixture sintetis lokal.

## Konflik source dan keputusan implementasi

Plan memperkirakan maksimal lima file UI setelah inventarisasi. Source aktual
memiliki jalur stage change tambahan pada Commercial Detail, selain Pipeline
drawer dan dialog perpindahan bersama. Membatasi perubahan ke lima file akan
membiarkan pengguna masuk `Commit` tanpa sarana mengisi tanggal pada jalur
detail. Scope file diperluas hanya untuk menutup jalur yang menjalankan aturan
bisnis yang sama; keputusan D01–D08 tidak diubah.

Kontrak `create_quotation` juga harus ditambah parameter trailing opsional agar
create-at-Commit dapat atomik. Signature lama tidak dipertahankan sebagai
overload terpisah untuk menghindari ambiguitas PostgREST; caller yang tidak
mengirim parameter tetap bekerja melalui default `NULL`, terbukti oleh full
regression suite. `revise_quotation` memakai dua parameter trailing default
untuk membedakan caller lama yang mewarisi tanggal dari form baru yang secara
eksplisit mengonfirmasi tanggal atau `NULL` dalam transaksi revision yang sama.

## Batas verifikasi dan blocker

- Migration belum dijalankan pada database remote/produksi.
- Tidak ada deployment atau smoke browser produksi.
- Tidak ada screenshot sukses terpisah; bukti browser adalah eksekusi Playwright
  Chromium dan report lokal. Screenshot failure sementara hanya dipakai untuk
  memperbaiki selector test, bukan sebagai bukti lulus.
- Forecast/reports/export belum menggunakan Expected Close; itu Task 10.
- Tidak ada commit atau push untuk slice ini.

## File berubah untuk Task 09b

- `src/components/clients/CreateRecordDialogs.tsx`
- `src/components/clients/commercial-form-schemas.ts`
- `src/components/clients/commercial-form-schemas.test.ts`
- `src/components/pipeline/PipelineStageMoveDialog.tsx`
- `src/components/pipeline/PipelineCardDrawer.tsx`
- `src/components/commercial/CommercialDetailPage.tsx`
- `src/components/commercial/CommercialDetailMainCard.tsx`
- `src/lib/domain.ts`
- `src/lib/data/commercial-items.ts`
- `src/lib/data/commercial-documents.ts`
- `src/lib/data/commercial-documents.test.ts`
- `supabase/migrations/20261016135442_add_expected_close_command.sql`
- `supabase/tests/crm-expected-close.test.ts`
- `e2e/browser-flows.spec.ts`
- `tasks/crm-reliability-and-growth-todo.md`

File untracked pengguna bertanggal 9 Agustus tidak diubah. `tasks/plan.md` dan
`tasks/todo.md` historis tidak diubah.
