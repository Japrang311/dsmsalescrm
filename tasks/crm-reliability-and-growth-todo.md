# Checklist — CRM Reliability and Growth

Tanggal: 18 Oktober 2026 · Status: **Task 00–16 released production; Task 18/AC21 verified untuk release; baseline Task 17 berjalan dan Gate C belum siap**.

[Spec](../specs/crm-reliability-and-growth.md) ·
[Plan dan acceptance per task](crm-reliability-and-growth-plan.md)

## Paket dokumentasi

- [x] Ringkasan pengembangan dibuat.
- [x] Spec dengan AC01–AC23 dan keputusan D01–D08 dibuat.
- [x] Plan dan dependency/checkpoint dibuat.
- [x] ADR-005 Accepted pada 16 Oktober 2026.
- [x] Approval dokumen/spec/plan dan default D01–D08 dicatat: pemilik produk,
      16 Oktober 2026, pesan "dokumen approved".

Disetujui oleh pemilik produk melalui pesan "dokumen approved" pada 16 Oktober 2026.
Approval mencakup paket dokumen dan default D01–D08 sebagai baseline pengembangan.
Implementasi Gate A diverifikasi lokal pada 16 Oktober 2026. Approval dokumen
tidak memberi izin otomatis untuk migration produksi, push, atau deployment.

## Keputusan

| ID                                  | Status   | Pilihan final / pemberi keputusan / tanggal              |
| ----------------------------------- | -------- | -------------------------------------------------------- |
| D01 — Definisi metrik               | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D02 — Range dan target              | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D03 — Koreksi lineage               | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D04 — Forecast bertanggal           | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D05 — Cadence repeat-order          | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D06 — Exception thresholds          | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D07 — Recovery dan replay retention | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |
| D08 — Batas ekspansi AI             | Accepted | Default spec diterima / pemilik produk / 16 Oktober 2026 |

## Eksekusi

Acceptance, verification, file scope, dan dependensi setiap task ada pada plan.
Checkbox hanya boleh selesai jika evidence dicatat, bukan karena kode ditulis.

- [x] 00 Baseline, fixture, dan keputusan — verified local; lihat baseline ledger.
- [x] 01 Kontrak scope metrik/target — verified local.
- [x] 02 Reports range sampai database — verified local.
- [x] 03 Target, periode, export (termasuk 03b) — verified local + browser.
- [x] 04a Definisi SO pada UI — verified local + browser.
- [x] 04b Definisi SO pada export — verified local + XLSX reconciliation.
- [x] 04c Definisi SO pada AI facts/prompt — verified local.
- [x] 05 Reproduksi gap lineage/audit lokal — source-inspected + regression.
- [x] 06 Command header SO atomik — verified local.
- [x] 07a Command item SO atomik — verified local.
- [x] 07b UI item SO dan konflik — browser-verified.
- [x] 08 Audit visibility dan legacy review — verified local; produksi unverified.
- [x] Gate A: AC01–11 lulus lokal; migration dan app released production 18 Oktober 2026.
- [x] 09a Expected close schema/command — verified local; lihat evidence ledger.
- [x] 09b Expected close form/stage transition — verified local + browser; lihat evidence ledger.
- [x] 10a Forecast aggregate/drilldown — verified local; lihat evidence ledger.
- [x] 10b Forecast UI/export — verified local + browser; lihat evidence ledger.
- [x] 11 Backlog Won tanpa SO — verified local + browser; lihat evidence ledger.
- [x] Gate B: AC12–14 lulus lokal; migration dan app released production 18 Oktober 2026.
- [x] 12a Signal rules/aggregate — verified local; lihat evidence ledger.
- [x] 12b Signal list UI — verified local + browser; lihat evidence ledger.
- [x] 13 Follow-up dari exception — verified local + browser; lihat evidence ledger.
- [x] 14 Snooze dan feedback — verified local + browser; lihat evidence ledger.
- [x] 15 Cadence repeat-order — verified local; lihat evidence ledger.
- [x] 16 Repeat signal pada antrean/client — verified local + browser; lihat evidence ledger.
- [ ] 17 Pilot dan evaluasi — baseline production 19–30 Oktober dibekukan; completion menunggu 10 hari kerja dan review Sales.
- [ ] Gate C: AC15–20 lulus dan hasil pilot direview.
- [x] 18 Backup/restore drill — production snapshot, isolated restore, Auth/Storage/schema/data reconciliation dan RTO release diverifikasi.
- [ ] 19 UX dan refactor terarah.
- [ ] 20 AI output evaluation; tidak menghalangi core CRM jika ekspansi AI ditunda.
- [ ] 21 Handoff, dokumen lama, backlog.
- [ ] Gate D: operasional dan handoff selesai sesuai scope yang disetujui.

## Traceability acceptance

| Acceptance | Task                |
| ---------- | ------------------- |
| AC01–03    | 01–03               |
| AC04–05    | 04a–c               |
| AC06–08    | 06–08               |
| AC09–11    | 05–08               |
| AC12–13    | 09–10               |
| AC14       | 11                  |
| AC15–17    | 12–14               |
| AC18–20    | 15–17               |
| AC21       | 18                  |
| AC22       | Semua release gates |
| AC23       | 20                  |

## Evidence ledger

Tambahkan satu baris per task/slice. Jangan menaruh credentials atau data pelanggan
pribadi. Status yang tersedia: Not started, In progress, Blocked, Verified local,
Released, Deferred. Blocker harus menjelaskan kebutuhan untuk melanjutkan.

| Task                              | Status         | Commit         | Test/hasil                                                                                                   | Browser                                                                                    | Migration/deploy                               | Evidence link                                                                                 |
| --------------------------------- | -------------- | -------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 00 Baseline                       | Verified local | Tidak dibuat   | Source/schema/grants/RLS/trigger diperiksa; fixture sintetis; 10 unit pass                                   | Tidak relevan                                                                              | Instance test baru; remote tidak dilakukan     | [Baseline](../docs/reports/2026-10-16-crm-gate-a-baseline.md)                                 |
| 01 Scope metrik                   | Verified local | Tidak dibuat   | Range, leap year, lintas tahun, target comparable, zero denominator lulus                                    | Tidak relevan (pure helper)                                                                | Tidak ada                                      | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 02 Reports DB scope               | Verified local | Tidak dibuat   | Role matrix dan RPC scope lulus                                                                              | Reports dimuat dengan snapshot exact                                                       | Fresh reset lokal; remote tidak dilakukan      | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 03 Target/export                  | Verified local | Tidak dibuat   | Target multi-year/partial/subset dan export snapshot lulus                                                   | XLSX exact value/range/snapshot direkonsiliasi ke RPC                                      | Tidak ada remote                               | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 04a–c Definisi Nilai SO           | Verified local | Tidak dibuat   | 26 targeted report/export/AI pass; full suite pass                                                           | Definisi/label Reports dan Dashboard diperiksa                                             | Tidak ada                                      | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 05 Lineage gap                    | Verified local | Tidak dibuat   | Regression cross-client/non-Won/superseded/deleted/owner/concurrency lulus                                   | Manual link flow lulus                                                                     | Tidak ada backfill/autocorrect                 | [Baseline](../docs/reports/2026-10-16-crm-gate-a-baseline.md)                                 |
| 06 Header command                 | Verified local | Tidak dibuat   | Version/replay/no-op/direct bypass/audit rollback/RLS lulus                                                  | Conflict draft/reload/save lulus                                                           | Fresh migration lokal; remote tidak dilakukan  | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 07a–b Item command/UI             | Verified local | Tidak dibuat   | Add/edit/delete, total/version, rollback, FOC, stale lulus                                                   | Full SO correction flow lulus                                                              | Fresh migration lokal; remote tidak dilakukan  | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 08 Audit/legacy                   | Verified local | Tidak dibuat   | Owner/actor/RLS negatif dan cursor adapter lulus; legacy link events didaftar                                | Audit before/after terlihat setelah reload                                                 | Produksi unverified                            | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| Gate A                            | Verified local | Tidak dibuat   | 736 pass; lint/typecheck/build lulus                                                                         | 14 Chromium pass                                                                           | Tidak ada push/deploy/migration remote         | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md)                               |
| 09a Expected close schema/command | Verified local | Tidak dibuat   | 31 targeted pass; full 743 pass; RLS/direct bypass/version/concurrency/retry/rollback lulus                  | Tidak relevan; UI ada di 09b                                                               | Fresh reset lokal; remote tidak dilakukan      | [Task 09a](../docs/reports/2026-10-16-crm-task-09a-verification.md)                           |
| 09b Expected close UI/transition  | Verified local | Tidak dibuat   | 23 targeted pass; full 746 pass; lint/typecheck/build lulus                                                  | Chromium: Commit tanpa tanggal ditolak, persist/reload dan revision confirm lulus          | Migration hanya lokal; deploy tidak dilakukan  | [Task 09b](../docs/reports/2026-10-16-crm-task-09b-verification.md)                           |
| 10a Forecast aggregate/drilldown  | Verified local | Tidak dibuat   | 8 targeted pass; full 754 pass; RLS/exclusion/reconciliation/pagination/audit lulus                          | Tidak relevan; UI/export tetap Task 10b                                                    | Fresh reset lokal; remote tidak dilakukan      | [Task 10a](../docs/reports/2026-10-16-crm-task-10a-verification.md)                           |
| 10b Forecast UI/export            | Verified local | Tidak dibuat   | 19 targeted + full 756 pass; UI/RPC/XLSX exact reconciliation; PDF valid                                     | Chromium current/historical/Dashboard/export lulus; visual desktop tanpa overflow          | Fresh reset lokal; remote tidak dilakukan      | [Task 10b](../docs/reports/2026-10-17-crm-task-10b-verification.md)                           |
| 11 Won tanpa SO / Gate B          | Verified local | Tidak dibuat   | 13 targeted + full 762 pass; exact total/page, RLS, direct API, delete/restore, link lulus                   | 16 Chromium pass; create/link/reload/reconcile dan forecast unchanged lulus                | Fresh reset lokal; remote tidak dilakukan      | [Task 11 / Gate B](../docs/reports/2026-10-17-crm-task-11-gate-b-verification.md)             |
| 12a Signal rules/aggregate        | Verified local | Tidak dibuat   | 12 targeted + full 774 pass; cutoff, dedupe, RLS, exact count, tie cursor, invalid cursor, performance lulus | Tidak relevan; UI/browser menjadi Task 12b                                                 | Fresh reset lokal; remote tidak dilakukan      | [Task 12a](../docs/reports/2026-10-17-crm-task-12a-verification.md)                           |
| 12b Signal list UI                | Verified local | Tidak dibuat   | 15 targeted + full 776 pass; state, grouping, count, adapter, lint/typecheck/build lulus                     | 17 Chromium pass; RPC/UI, Tasks/Dashboard, Sales/Executive, keyboard, mobile lulus         | Fresh reset lokal; remote tidak dilakukan      | [Task 12b](../docs/reports/2026-10-17-crm-task-12b-verification.md)                           |
| 13 Follow-up dari exception       | Verified local | Tidak dibuat   | 31 targeted + full 783 pass; RLS/direct API, concurrency, replay, rollback, role/ownership lulus             | Open-record-reload lulus; final full 18 pass tanpa retry                                   | Migration hanya lokal; remote tidak dilakukan  | [Task 13](../docs/reports/2026-10-17-crm-task-13-verification.md)                             |
| 14 Snooze dan feedback            | Verified local | Task 14 commit | 31 targeted + full 793 pass; RLS/direct bypass, forged rule, concurrency, retry, rollback, transfer lulus    | Snooze/reload/resurface/feedback/reconcile lulus; full 19 pass tanpa retry                 | Dua migration hanya lokal; remote ditahan      | [Task 14](../docs/reports/2026-10-17-crm-task-14-verification.md)                             |
| 15 Cadence repeat-order           | Verified local | `2732812`      | 15 targeted + full 808 pass; D05 median/window, exclusion, DB-helper reconciliation, role/transfer lulus     | Tidak relevan; UI/browser menjadi Task 16                                                  | Fresh reset lokal; remote tidak dilakukan      | [Task 15](../docs/reports/2026-10-17-crm-task-15-verification.md)                             |
| 16 Repeat signal/client           | Verified local | `f928e21`      | 26 targeted + full 815 pass; RLS/direct bypass, concurrency, retry, rollback, Task reuse dan feedback lulus  | Targeted lulus; full Chromium serial 20/20, count/client/insufficient/owner boundary lulus | Fresh reset lokal; remote tidak dilakukan      | [Task 16](../docs/reports/2026-10-17-crm-task-16-verification.md)                             |
| 17 Pilot repeat-order             | In progress    | Belum dibuat   | 5 targeted + full 820 pass; production cohort 29 candidate/0 overdue dibekukan untuk 19–30 Okt               | Manager production: 46 candidate/1 overdue, Tasks render, console bersih                   | `d05-v1` released; review Sales belum tersedia | [Task 17 readiness](../docs/reports/2026-10-18-crm-task-17-pilot-readiness.md)                |
| 18 Backup/restore + release       | Released       | `f928e21`      | Production snapshot restored isolated; counts/checksums/Auth/Storage reconcile; pre-release full 820 pass    | Authenticated read-only smoke Dashboard/Clients/Tasks/SO/Reports; export unverified        | 12 migration applied; Vercel deployment Ready  | [Task 18 / release](../docs/reports/2026-10-18-crm-task-18-production-restore-and-release.md) |

## Release checklist per slice

- [x] Scope dan keputusan bisnis disetujui.
- [x] Targeted dan full checks yang relevan lulus lokal.
- [x] RLS/direct API/concurrency diuji untuk mutation Gate A.
- [x] Data legacy tidak dimutasi tanpa keputusan.
- [x] Backup/restore produksi dan kompatibilitas migration dikonfirmasi; backup berkala tetap risiko operasional.
- [x] Otorisasi target remote serta deployment tersedia; release memakai commit bersih `f928e21` tanpa push baru.
- [x] Migration parity, deployment, dan authenticated read-only smoke diverifikasi terpisah; export/mutation smoke dicatat unverified.
- [x] Schema Gate A additive; rollback app dan batas rollback data dicatat di runbook.
- [x] Spec/plan/ADR/evidence diperbarui tanpa menghapus sejarah sampai Gate B.
