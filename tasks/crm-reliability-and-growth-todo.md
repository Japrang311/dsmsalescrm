# Checklist — CRM Reliability and Growth

Tanggal: 16 Oktober 2026 · Status: **Gate A verified local dan siap review; gate produksi blocked Task 18 remote**.

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
- [x] Gate A: AC01–11 lulus lokal; siap review. Remote migration tetap ditahan oleh Task 18.
- [ ] 09a Expected close schema/command.
- [ ] 09b Expected close form/stage transition.
- [ ] 10a Forecast aggregate/drilldown.
- [ ] 10b Forecast UI/export.
- [ ] 11 Backlog Won tanpa SO.
- [ ] Gate B: AC12–14 lulus.
- [ ] 12a Signal rules/aggregate.
- [ ] 12b Signal list UI.
- [ ] 13 Follow-up dari exception.
- [ ] 14 Snooze dan feedback.
- [ ] 15 Cadence repeat-order.
- [ ] 16 Repeat signal pada antrean/client.
- [ ] 17 Pilot dan evaluasi.
- [ ] Gate C: AC15–20 lulus dan hasil pilot direview.
- [ ] 18 Backup/restore drill — local drill lulus; **Blocked** untuk inventaris/restore live berizin.
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

| Task | Status | Commit | Test/hasil | Browser | Migration/deploy | Evidence link |
| --- | --- | --- | --- | --- | --- | --- |
| 00 Baseline | Verified local | Tidak dibuat | Source/schema/grants/RLS/trigger diperiksa; fixture sintetis; 10 unit pass | Tidak relevan | Instance test baru; remote tidak dilakukan | [Baseline](../docs/reports/2026-10-16-crm-gate-a-baseline.md) |
| 01 Scope metrik | Verified local | Tidak dibuat | Range, leap year, lintas tahun, target comparable, zero denominator lulus | Tidak relevan (pure helper) | Tidak ada | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 02 Reports DB scope | Verified local | Tidak dibuat | Role matrix dan RPC scope lulus | Reports dimuat dengan snapshot exact | Fresh reset lokal; remote tidak dilakukan | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 03 Target/export | Verified local | Tidak dibuat | Target multi-year/partial/subset dan export snapshot lulus | XLSX exact value/range/snapshot direkonsiliasi ke RPC | Tidak ada remote | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 04a–c Definisi Nilai SO | Verified local | Tidak dibuat | 26 targeted report/export/AI pass; full suite pass | Definisi/label Reports dan Dashboard diperiksa | Tidak ada | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 05 Lineage gap | Verified local | Tidak dibuat | Regression cross-client/non-Won/superseded/deleted/owner/concurrency lulus | Manual link flow lulus | Tidak ada backfill/autocorrect | [Baseline](../docs/reports/2026-10-16-crm-gate-a-baseline.md) |
| 06 Header command | Verified local | Tidak dibuat | Version/replay/no-op/direct bypass/audit rollback/RLS lulus | Conflict draft/reload/save lulus | Fresh migration lokal; remote tidak dilakukan | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 07a–b Item command/UI | Verified local | Tidak dibuat | Add/edit/delete, total/version, rollback, FOC, stale lulus | Full SO correction flow lulus | Fresh migration lokal; remote tidak dilakukan | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 08 Audit/legacy | Verified local | Tidak dibuat | Owner/actor/RLS negatif dan cursor adapter lulus; legacy link events didaftar | Audit before/after terlihat setelah reload | Produksi unverified | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| Gate A | Verified local | Tidak dibuat | 736 pass; lint/typecheck/build lulus | 14 Chromium pass | Tidak ada push/deploy/migration remote | [Gate A](../docs/reports/2026-10-16-crm-gate-a-verification.md) |
| 18 Backup/restore | Blocked | Tidak dibuat | DB/Auth/Storage synthetic restore dan reconciliation lulus lokal | Tidak relevan | Live inventory/restore tidak diizinkan | [Restore drill](../docs/reports/2026-10-16-crm-local-restore-drill.md) |

## Release checklist per slice

- [x] Scope dan keputusan bisnis disetujui.
- [x] Targeted dan full checks yang relevan lulus lokal.
- [x] RLS/direct API/concurrency diuji untuk mutation Gate A.
- [x] Data legacy tidak dimutasi tanpa keputusan.
- [x] Backup/restore lokal dan kompatibilitas migration dikonfirmasi; produksi blocked.
- [ ] Otorisasi target remote serta push/deploy tersedia.
- [ ] Migration parity, deployment, dan authenticated smoke diverifikasi terpisah.
- [x] Schema Gate A additive; rollback app dan batas rollback data dicatat di runbook.
- [ ] Spec/plan/ADR/evidence diperbarui tanpa menghapus sejarah.
