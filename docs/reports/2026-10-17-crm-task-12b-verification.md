# Verifikasi Task 12b — Signal list UI

Tanggal: 17 Oktober 2026

Status: **Verified local + browser; Task 13 dan Task 14 belum dimulai**

Scope: Task 12b, consumer UI dari action-signal contract Task 12a pada halaman
Tasks dan Dashboard. Slice ini tidak menambah aksi follow-up, persistence snooze,
feedback, atau repeat-order.

## Hasil

[Pasti] Halaman Tasks kini menampilkan antrean tindakan server-side dengan jumlah
total exact, grouping per quotation, seluruh alasan rule, priority, owner, nilai,
status data belum cukup, dan tautan ke quotation sumber. Page berikutnya memakai
cursor keyset RPC Task 12a, bukan pagination array di browser.

[Pasti] Dashboard memakai snapshot ringkas maksimal lima row dan memberi tautan
ke antrean lengkap. Sales tetap dipaksa ke owner sendiri oleh RPC; Manager dapat
memakai owner filter di Tasks; Executive hanya menerima aggregate dan tidak
menerima row, cursor, nama client, atau tautan sumber.

[Pasti] Loading, query error tanpa angka nol buatan, empty, data-insufficient,
aggregate-only, dan load-more mempunyai state presentasi berbeda. State snoozed
belum dibuat karena persistence dan aturan snooze adalah scope Task 14.

## Acceptance yang diverifikasi

| Acceptance Task 12b | Bukti lokal/browser                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Daftar exception    | Satu card per quotation; beberapa rule tetap terlihat sebagai alasan terpisah              |
| Count server-side   | Attribute UI dan teks total direkonsiliasi langsung dengan hasil RPC lokal                 |
| Source navigation   | Link quotation dapat difokuskan dan dibuka dengan Enter                                    |
| Role boundary       | Sales owner-only dari RPC; Executive aggregate-only tanpa row/link                         |
| Pagination          | Infinite query meneruskan `nextCursor`; adapter dan DB tie-pagination Task 12a tetap lulus |
| State presentation  | Loading/error/empty/data-insufficient/aggregate/pagination diuji terpisah                  |
| Dashboard summary   | Limit lima dan link ke `/tasks` terverifikasi di browser                                   |
| Responsive          | Viewport 320 x 720 tidak menghasilkan horizontal document overflow                         |

AC15–AC17 belum dinyatakan selesai penuh: follow-up dari exception adalah Task 13
dan snooze/feedback adalah Task 14.

## Bukti pengujian

1. TDD targeted:
   - Test awal gagal karena `ActionSignalList` belum ada.
   - Test link antrean lengkap gagal sebelum prop Dashboard ditambahkan.
   - Final:
     `bun --env-file=.env.local test tests/precision-ui.test.tsx src/lib/data/action-signals.test.ts`
     — **15 pass, 0 fail, 48 assertions**.
2. Full unit/database suite:
   - `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_GATE_A_20261016 bun run test:ci`
   - **776 pass, 0 fail, 3.022 assertions, 106 files**.
   - Run pertama memakai default container checkout utama yang mati dan menghasilkan
     775 pass + 1 infrastructure fail pada `docker exec`. Run final memakai override
     container disposable yang memang melayani endpoint test.
3. Static/build:
   - `bun run lint` — lulus setelah helper internal tidak lagi diekspor.
   - `bun run typecheck` — lulus.
   - `bun run build` — lulus, termasuk build yang dijalankan oleh suite E2E.
   - `git diff --check` — lulus pada pemeriksaan akhir.
4. Browser:
   - Targeted Chromium Task 12b — **1 pass**.
   - Database disposable di-reset dari semua migration sampai
     `20261017070000_add_crm_action_signals.sql`, lalu `bun run test:e2e` —
     **17 pass, 0 fail**.
   - Diverifikasi: rekonsiliasi RPC/UI, Tasks, Dashboard, Sales, Executive,
     keyboard Enter, link sumber, viewport 320 px, dan tidak ada console issue.
   - Selector kalender lama diperketat menjadi exact match karena tambahan teks
     antrean membuat substring `Sen` ambigu; behavior kalender tidak diubah.

## Database lokal

Semua browser dan test yang menulis data memakai API loopback
`http://127.0.0.1:54321` dari project disposable `DSM_GATE_A_20261016` dan container
database `supabase_db_DSM_GATE_A_20261016`. Checkout utama melaporkan container
default `supabase_db_DSM_SALES_WEB_APP_V2` tidak aktif; ini tidak dialihkan ke
remote. Tidak ada database produksi yang dibaca atau diubah.

## Batas verifikasi

- **Source-inspected:** query key/scope, infinite cursor propagation, grouping,
  count display, Dashboard limit, source link, dan role presentation.
- **Tested-local:** state component, adapter reconciliation, full 776-test suite,
  lint, typecheck, build, fresh reset database disposable.
- **Browser-verified:** Tasks/Dashboard, RPC-to-UI count/reason, Sales/Executive,
  keyboard, mobile overflow, dan seluruh 17 regression flow.
- **Blocked:** migration parity produksi, deployment, remote smoke, dan Task 18
  live backup/restore tetap di luar otorisasi.
- **Unverified:** follow-up action Task 13, snooze/feedback Task 14, repeat-order
  Task 15–17, serta semua kondisi produksi.

## File Task 12b

- `src/components/tasks/ActionSignalList.tsx`
- `src/routes/_app.tasks.tsx`
- `src/routes/_app.dashboard.tsx`
- `tests/precision-ui.test.tsx`
- `e2e/browser-flows.spec.ts`
- `tasks/crm-reliability-and-growth-todo.md`

Tidak ada commit, push, deployment, atau migration remote pada slice ini.
