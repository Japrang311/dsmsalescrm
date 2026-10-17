# Task 17 — Readiness pilot repeat-order dan evaluasi

Tanggal: 18 Oktober 2026

Status: **Baseline production dibekukan; completion menunggu 10 hari kerja dan review Sales**

Scope: Task 17 dan review Gate C untuk pilot D05. Laporan ini menyiapkan kontrak
cohort, analisis feedback, klasifikasi false-positive, serta gate keputusan
`retain`/`tune`/`stop`. Laporan ini bukan hasil pilot manusia dan tidak mengklaim
kenaikan revenue.

## Kebenaran utama

[Pasti] Baseline production dibekukan 18 Oktober 2026 untuk periode operasional
19–30 Oktober 2026 (10 hari kerja; tidak ada holiday lokal pada rentang itu).
Belum ada feedback yang dapat dibuktikan berasal dari Sales dalam pilot
operasional. Karena itu Task 17 belum memenuhi acceptance dan Gate C belum siap.

[Pasti] Database test lokal hanya berisi satu event feedback sintetis dari flow
E2E: satu client, satu actor, rule `d05-v1`, dan hasil `not_relevant`. Event ini
berguna untuk verifikasi kontrak persistence, tetapi tidak sah sebagai bukti
adopsi atau relevansi lapangan.

[Pasti] Tabel feedback produksi masih berisi 0 event dan 0 client direview pada
snapshot awal.

[Pasti] Keputusan pilot saat ini adalah **defer / belum memilih**. Memilih retain,
tune, atau stop dari satu fixture sintetis akan menyesatkan. Tidak ada klaim
revenue, conversion lift, atau dampak bisnis kausal.

## Kontrak cohort yang harus dibekukan

| Field            | Aturan                                                                           | Status saat ini               |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------- |
| Rule version     | Satu cohort hanya memakai satu versi, saat ini `d05-v1`                          | Siap                          |
| Periode baseline | Minimal 10 hari kerja / dua minggu kerja                                         | 19–30 Okt; belum selesai      |
| Scope pengguna   | Semua tiga akun aktif dengan role `sales`; scope sama sampai review              | Dibekukan 18 Oktober 2026     |
| Candidate count  | Aggregate server-side, bukan jumlah row yang sedang dimuat                       | 29                            |
| Overdue cohort   | Daftar ID client pada snapshot awal; laporan hanya menyimpan count               | 0; snapshot kosong            |
| Feedback         | Feedback terbaru per client; event lama tetap dihitung sebagai audit event       | Implementasi siap             |
| False positive   | Reviewer memilih `seasonal`, `project`, atau `other`; alasan bebas tidak ditebak | Siap sebagai kontrak analisis |
| Keputusan        | Product Owner memilih `retain`, `tune`, atau `stop` setelah review Sales         | Blocked                       |

Identitas client dan actor tidak boleh dimasukkan ke laporan agregat. ID hanya
boleh digunakan sementara sebagai kunci dedupe pada analisis lokal yang aman.

## Analisis yang diimplementasikan

Helper `analyzeRepeatOrderPilot`:

- menolak cohort dengan duplicate overdue-client ID atau count tidak konsisten;
- menolak feedback dari luar cohort;
- menolak rule version campuran agar perubahan threshold tidak mencemari hasil;
- memilih feedback terbaru per client dengan timestamp dan ID sebagai tie-breaker;
- menghitung reviewed/unreviewed, relevant/not relevant, relevance rate, dan
  jumlah reviewer tanpa membawa nama;
- menghitung false-positive musiman/proyek/other hanya dari klasifikasi reviewer;
- menampilkan `uncategorized` bila alasan bebas belum diklasifikasikan.

Helper `assessRepeatOrderPilotDecision` tidak memilih keputusan. Ia hanya menahan
proposal keputusan bila:

- baseline kurang dari 10 hari kerja;
- belum ada review Sales atau sample feedback;
- masih ada client overdue yang belum direview;
- feedback `not_relevant` belum diklasifikasikan;
- rationale mengklaim dampak revenue secara kausal.

## Worksheet pilot operasional

Snapshot awal diambil setelah migration dan deployment production selesai.

| Item                                       | Nilai                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| Baseline mulai / selesai                   | 19 Okt 2026 / target 30 Okt 2026                             |
| Hari kerja baseline                        | 0 dari minimum 10 pada saat snapshot                         |
| Rule version                               | `d05-v1`                                                     |
| Scope Sales/owner                          | 3 akun aktif ber-role `sales`, semua owner                   |
| Candidate / overdue                        | 29 / 0                                                       |
| Client direview                            | 0 operasional                                                |
| Relevant / not relevant                    | 0 / 0 operasional                                            |
| Seasonal / project / other / uncategorized | 0 / 0 / 0 / 0 operasional                                    |
| Keputusan                                  | **Defer — baseline belum selesai dan sampel overdue kosong** |
| Klaim revenue                              | Tidak dibuat                                                 |

## Prosedur untuk membuka blocker

1. Jalankan baseline minimal 10 hari kerja dengan scope tiga akun Sales yang
   sudah dibekukan.
2. Pada 30 Oktober, ambil snapshot akhir dengan `d05-v1` dan scope yang sama.
   Jika overdue tetap nol, perpanjang atau ulang cohort; jangan menyimpulkan
   relevansi aturan dari sample kosong.
3. Minta Sales menilai setiap client overdue melalui feedback yang sudah tersedia.
4. Reviewer mengklasifikasikan setiap `not_relevant` sebagai seasonal, project,
   atau other; kategori ambigu tetap `uncategorized` dan memblokir keputusan.
5. Jalankan helper pada export tersanitasi dan rekonsiliasi count ke database.
6. Product Owner mereview alasan dan memilih retain, tune, atau stop. Jika tune,
   threshold baru wajib mengubah spec, test, dan rule version sebelum dipakai.
7. Jalankan Gate C lengkap: performance, akses negatif, follow-up E2E, regression,
   dan browser smoke pada environment pilot yang diotorisasi.

## Bukti pengujian lokal

1. TDD RED pertama: module `repeat-order-pilot` belum ada dan test gagal import.
2. TDD RED kedua: keputusan belum dikembalikan sebagai bagian receipt evaluasi.
3. Targeted final:
   `bun test src/lib/repeat-order-pilot.test.ts` — **5 pass, 0 fail**.
4. Cakupan: latest feedback, dedupe client, explicit false-positive category,
   uncategorized visibility, mixed-version rejection, baseline/Sales/revenue gate,
   dan decision receipt.
5. Full regression:
   `LOCAL_SUPABASE_DB_CONTAINER=supabase_db_DSM_SALES_WEB_APP_V2 bun run test:ci`
   — **820 pass, 0 fail, 3.175 assertions, 110 files**.
6. `bun run lint`, `bun run typecheck`, `bun run build`, dan `git diff --check`
   — lulus.

## Batas verifikasi

- **Source-inspected:** Task 17 plan, D05/AC20, persistence feedback Task 16,
  baseline dua minggu, dan batas klaim revenue.
- **Tested-local:** helper analisis dan decision gate dengan fixture sintetis,
  full regression 820 test, lint, typecheck, build, dan diff hygiene.
- **Browser-verified:** tidak ada perubahan UI pada Task 17; flow feedback Task 16
  sudah diverifikasi terpisah.
- **Production-inspected:** migration/deploy selesai; tiga RPC owner-scoped
  merekonsiliasi 29 kandidat, 0 overdue, 8 on-cadence, dan 21 data-insufficient.
- **Browser-verified production:** role Manager memuat Tasks dengan aggregate
  organisasi 46 kandidat / 1 overdue tanpa console warning/error. Angka Manager
  tidak dimasukkan ke cohort karena aturan pilot membatasi role `sales`.
- **Blocked:** selesainya baseline, review manusia, klasifikasi false positive
  aktual, pilihan retain/tune/stop, dan Gate C.
- **Unverified:** relevance rate aktual, export produksi, adopsi pengguna,
  dampak bisnis, dan browser production untuk role Sales/Executive.

## File Task 17 saat ini

- `src/lib/repeat-order-pilot.ts`
- `src/lib/repeat-order-pilot.test.ts`
- `docs/reports/2026-10-18-crm-task-17-pilot-readiness.md`
- `tasks/crm-reliability-and-growth-todo.md`

Tidak ada data pelanggan atau credential ditulis ke laporan. Tidak ada pesan
eksternal atau mutation data pelanggan yang dilakukan untuk memulai baseline.
