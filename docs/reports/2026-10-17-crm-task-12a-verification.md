# Verifikasi Task 12a — Signal rules dan aggregate

Tanggal: 17 Oktober 2026

Status: **Verified local; UI Task 12b belum dimulai**

Scope: Task 12a, bagian server/pure rules dari AC15 dan AC17. Tidak mencakup
komponen daftar, integrasi Tasks/Dashboard, aksi follow-up, snooze, atau repeat-order.

## Hasil

[Pasti] CRM kini mempunyai kontrak deterministik untuk empat sinyal yang sudah
disetujui: Won tanpa SO aktif, expected close lewat, quotation expiry maksimal
tujuh hari, dan deal stagnan minimal empat belas hari. Repeat-order tetap berada
di Task 15–17.

[Pasti] Usia Won hanya berasal dari stage event terstruktur yang valid. Edit
metadata, `updated_at`, legacy text, dan sekadar membuat task tidak mengarang atau
mereset usia progress. Data tanpa event/follow-up yang cukup dilabeli
`data_insufficient` dengan usia `null`.

[Pasti] Aggregate menghitung total server-side sebelum pagination. Sales selalu
dipaksa ke owner sendiri, Manager/Super Admin dapat memakai filter owner, Executive
hanya menerima aggregate tanpa row/cursor, dan anonymous direct API ditolak.

[Pasti] Urutan keyset stabil memakai priority, due date, ketersediaan nilai, nilai,
entity ID, dan rule ID. Test memasukkan dua row dengan priority, due date, dan nilai
yang sama untuk membuktikan tidak ada duplikasi atau gap.

## Acceptance yang diverifikasi

| Acceptance        | Bukti lokal                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Alasan dan cutoff | Rule ID, reason, expiry hari ke-7, stagnan hari ke-14, serta boundary negatif hari ke-8/13 lulus |
| Dedupe            | Satu row per `entity_id + rule_id`; satu entity boleh memiliki beberapa alasan berbeda           |
| Event validity    | Won age hanya dari event schema v1 yang valid; legacy text dan `updated_at` tidak dipakai        |
| RLS/role scope    | Sales owner-only; Manager owner filter; Executive aggregate-only; anonymous ditolak              |
| Count/pagination  | Total/by-rule exact dan independen dari page; keyset stabil pada tie; malformed cursor ditolak   |
| Nilai             | Nilai tanpa line item tetap `null`, bukan angka nol buatan                                       |
| Performa          | 3.531 kandidat; median 31,15 ms, maksimum 40,34 ms, payload 30.641 byte                          |

## Bukti pengujian

1. TDD RED:
   - Unit test awal gagal karena helper/adapter belum tersedia, lalu enam behavior
     test gagal dengan `NOT_IMPLEMENTED` setelah skeleton dibuat.
   - DB contract test awal menghasilkan empat kegagalan `PGRST202` karena
     `crm_action_signals` belum ada; anonymous denial sudah lulus.
2. Targeted final:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun --env-file=.env.local test src/lib/data/action-signals.test.ts supabase/tests/crm-action-signals.test.ts`
   - **12 pass, 0 fail, 67 assertions**.
3. Full unit/database suite final:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **774 pass, 0 fail, 3.008 assertions, 106 files**.
   - Satu run sebelumnya juga menghasilkan 774 pass, tetapi wrapper shell berakhir
     dengan error karena memakai variabel read-only `status`; hasil itu tidak dipakai
     sebagai bukti. Run final memakai `result_code` dan exit 0.
4. Static/build:
   - `bun run lint` — lulus.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus.
   - `git diff --check` — lulus.
5. Database quality:
   - `bunx supabase@2.109.1 db reset --local --workdir /tmp/dsm-gate-a.heGRvH`
     — lulus sampai migration `20261017070000` pada database disposable.
   - `bunx supabase@2.109.1 db advisors --local --workdir /tmp/dsm-gate-a.heGRvH`
     — tidak menemukan issue.
   - `bunx supabase@2.109.1 db lint --local --workdir /tmp/dsm-gate-a.heGRvH`
     — RPC Task 12a bersih; tiga error static-analysis temp-table pada fungsi lama
     tetap ada (`migrate_commercial_document_data`,
     `admin_import_normalized_documents`, `import_business_calendar_holidays`).
   - Migration list lokal memuat `20261017070000` setelah Task 11
     `20261017060000`.
6. Performance fixture:
   - Fixture diperbaiki agar quotation Commit sintetis memenuhi constraint
     `expected_close_date` yang diperkenalkan Task 09.
   - 2.000 client, 3.977 quotation, 7.956 item, 910 SO, dan 4.000 task sintetis.
   - Lima sample setelah warm-up: **30,57 / 30,86 / 31,15 / 31,98 / 40,34 ms**.
   - Budget plan: median <=220 ms, maksimum <=400 ms, payload <=200.000 byte;
     seluruhnya lulus.
   - Database disposable di-reset setelah benchmark sehingga fixture tidak tersisa.

## Fresh database proof

Semua migration direplay pada project disposable `DSM_GATE_A_20261016` dengan API
`http://127.0.0.1:54321`, PostgreSQL `127.0.0.1:54322`, dan container
`supabase_db_DSM_GATE_A_20261016`. Test yang menulis data memakai endpoint lokal
tersebut. Tidak ada database remote/produksi yang diubah.

## Batas verifikasi

- **Source-inspected:** pure rule, adapter validation/reconciliation, aggregate
  RPC, grants, role boundary, deterministic ordering, dan compatibility fixture.
- **Tested-local:** fresh migration replay, cutoffs, dedupe, event validity,
  exact count, tie pagination, malformed cursor, owner scope, Executive aggregate,
  anonymous denial, performance, targeted/full suite, lint, typecheck, build,
  advisors, lint schema, dan migration list lokal.
- **Browser-verified:** tidak relevan untuk Task 12a karena belum ada consumer UI;
  browser/keyboard/mobile/error-state menjadi acceptance Task 12b.
- **Blocked:** migration parity produksi, migration remote, deployment, dan
  authenticated production smoke belum diizinkan. Task 18 live backup/restore
  tetap blocked terpisah.
- **Unverified:** database/traffic produksi, browser UI Task 12b, action follow-up
  Task 13, snooze Task 14, dan repeat-order Task 15–17.

## File Task 12a

- `src/lib/crm-signal-rules.ts`
- `src/lib/data/action-signals.ts`
- `src/lib/data/action-signals.test.ts`
- `supabase/migrations/20261017070000_add_crm_action_signals.sql`
- `supabase/tests/crm-action-signals.test.ts`
- `scripts/seed-performance-fixture.ts` (compatibility fixture terpisah)

Tidak ada commit, push, deployment, atau migration remote pada slice ini.
