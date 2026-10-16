# Verifikasi Task 10a — Forecast Aggregate dan Drilldown

Tanggal: 16 Oktober 2026

Status: **Verified local**

Scope: Task 10a; UI, export, dan browser reconciliation tetap Task 10b.

## Hasil

[Pasti] `crm_forecast_snapshot` memakai satu scope server-side untuk nilai Sales
Order dan quotation terbuka. Forecast aktif dihitung sebagai nilai SO dalam periode
ditambah nilai quotation terbobot yang `expected_close_date`-nya berada dalam
periode. Bobot yang diuji adalah kontrak existing: Quotes Sent 30%, Negotiation
55%, Hot Prospect 75%, dan Commit 90%.

[Pasti] Periode yang sudah berakhir tidak menerima proyeksi pipeline saat ini.
RPC mengembalikan `snapshotMode=historical_unavailable`, `openPipelineValue=null`,
`forecastValue=null`, dan drilldown kosong. Ini membedakan angka yang tidak dapat
direkonstruksi dari angka nol.

[Pasti] Quotation tanpa tanggal dan overdue dilaporkan dalam bucket terpisah.
Closed Won, Closed Lost, tanggal di luar periode, revision superseded, soft-deleted,
dan quotation tanpa tanggal tidak menambah open forecast periode.

[Pasti] Drilldown dipaginasi di server (`limit` maksimum 200 dan `offset`) dengan
urutan stabil. Aggregate tetap berasal dari seluruh scope, bukan hanya page yang
sedang dimuat. Setiap page membawa `contributionValue`; adapter menolak payload
yang tidak rekonsiliasi.

[Pasti] Function memakai `security invoker`, `search_path=''`, RLS existing, dan
owner filter server-side. Sales yang meminta owner lain tetap mendapat buku
bisnisnya sendiri; Manager dapat memfilter owner yang sah. Execute untuk `anon`
tidak tersedia dan direct REST anonymous menghasilkan HTTP 401.

## Acceptance yang diverifikasi

| Acceptance              | Bukti lokal                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| AC12                    | Fixture setiap open stage serta terminal/outside/superseded/deleted/undated; aggregate dan formula lulus           |
| AC13 — bucket           | Command perubahan expected date memindahkan quotation keluar periode dan mengubah aggregate tepat sebesar bobotnya |
| AC13 — audit            | Event old/new/request ID ditemukan setelah command                                                                 |
| AC13 — traceability     | Aggregate direkonsiliasi ke weighted drilldown; pagination tidak mengubah aggregate                                |
| AC13 — RLS              | Sales owner-only, Manager owner filter, anonymous execute ditolak                                                  |
| Historical truthfulness | Periode historis mengembalikan forecast unavailable, bukan current pipeline atau nol palsu                         |

## Bukti pengujian

1. RED sebelum implementasi:
   - DB test gagal `PGRST202` karena `crm_forecast_snapshot` belum ada.
   - Unit test gagal karena module adapter belum ada.
   - Pagination test kemudian gagal `PGRST202` sebelum signature pagination diterapkan.
2. Targeted final:
   - `bun test supabase/tests/crm-forecast-snapshot.test.ts src/lib/data/forecast-snapshot.test.ts`
   - **8 pass, 0 fail, 53 assertions**.
3. Fresh migration replay:
   - `supabase db reset --local --workdir /tmp/dsm-gate-a.heGRvH`
   - Seluruh migration sampai `20261016144752_add_crm_forecast_snapshot.sql`
     dan seed lokal selesai.
4. Full suite final:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test`
   - **754 pass, 0 fail, 2.905 assertions, 103 files**.
5. Static/build:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
   - `git diff --check` — lulus.
6. Database/security:
   - Function catalog: `security invoker`, stable, `search_path=''`, anon execute
     false, authenticated execute true.
   - Direct REST anonymous — HTTP 401.
   - `supabase db lint --local --level warning` tidak menemukan isu pada function
     baru; tetap melaporkan tiga error analyzer temp-table historis yang sudah ada
     pada migration lama.

Full-suite run pertama tidak lulus karena test atomicity lama memakai default
container `supabase_db_DSM_SALES_WEB_APP_V2`, yang sudah berhenti. Run final
memberi `LOCAL_SUPABASE_DB_CONTAINER` eksplisit ke stack disposable yang aktif;
test atomicity tersebut dan seluruh suite kemudian lulus. Tidak ada production
database yang digunakan.

## Batas verifikasi

- **Source-inspected:** formula, stage weights, scope owner/client, RLS/grants,
  historical mode, pagination, dan adapter validation.
- **Tested-local:** fresh migration replay, role filter, direct anonymous denial,
  exclusions, aggregate/drilldown reconciliation, bucket move dan audit event,
  targeted/full suite, lint, typecheck, build.
- **Browser-verified:** tidak relevan untuk Task 10a; consumer UI belum diubah.
- **Unverified:** Reports UI, Dashboard consumer, export snapshot/reconciliation,
  empty/error presentation, database remote/production, deployment.
- **Blocked:** tidak ada blocker lokal untuk Task 10a. Remote migration tetap tidak
  diizinkan dan Task 18 live tetap blocker terpisah.

## File Task 10a

- `supabase/migrations/20261016144752_add_crm_forecast_snapshot.sql`
- `supabase/tests/crm-forecast-snapshot.test.ts`
- `src/lib/data/forecast.ts`
- `src/lib/data/forecast-snapshot.ts`
- `src/lib/data/forecast-snapshot.test.ts`

Tidak ada commit, push, deployment, atau migration remote pada slice ini.

## Addendum 17 Oktober 2026 — batas tanggal bisnis

[Pasti] Verifikasi Task 10b pada pergantian tanggal menemukan PostgreSQL lokal
masih berada pada 16 Oktober UTC ketika tanggal bisnis Jakarta sudah 17 Oktober.
Migration diperbaiki agar snapshot mode, as-of, dan bucket overdue memakai
`(statement_timestamp() at time zone 'Asia/Jakarta')::date`, bukan `current_date`.
Fresh reset dan full suite setelah koreksi lulus; lihat
[evidence Task 10b](2026-10-17-crm-task-10b-verification.md).
