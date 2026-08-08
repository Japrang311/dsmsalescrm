# Rencana Remediasi Audit Codebase

> **Status:** APPROVED — D-01 sampai D-04 disetujui; Fase A dan B1-B3 selesai,
> Checkpoint B terverifikasi, production migration parity hijau
> **Tanggal:** 2026-08-08
> **Status release B:** Commit `f701816` dan `22e7612` sudah push ke
> `origin/main`; migration B1-B3 sudah applied ke Supabase production
> `qhtfixgbcpcitokeryxb`; Vercel production Ready; GitHub Actions run
> `31266493103` success.
> **Sumber:** `audit/00-REPORT.md`, `audit/03-security.md`,
> `audit/04-maintainability.md`, `audit/05-readability.md`
> **Checklist eksekusi:** `tasks/audit-remediation-todo.md`

## Tujuan

Menutup 12 temuan audit secara bertahap tanpa rewrite, tanpa mengubah history
bisnis, dan tanpa membuat production menjadi tempat uji coba. Hasil akhir yang
dituju adalah baseline lokal/CI yang hijau, perubahan ownership yang atomik dan
tercatat, lifecycle account yang membedakan workload aktif dari history, serta
kode Task yang lebih murah diubah.

## Koreksi Penting atas Saran Audit

[Pasti] SEV-04 tidak boleh diperbaiki dengan memakai satu predicate yang sama
untuk semua fungsi. Dua kontrak bisnisnya berbeda:

1. **Active transferable ownership** hanya menghitung/memindahkan pekerjaan yang
   masih aktif: Client non-Lost, Task workflow aktif dan tidak archived, serta
   commercial document current, tidak soft-deleted, dan tidak terminal.
2. **Historical blocking references** harus tetap menghitung seluruh referensi
   bisnis/audit, termasuk record soft-deleted dan revisi lama. Ini diperlukan
   agar akun yang masih memiliki history tidak dapat dihapus permanen.

Karena itu `transfer_active_ownership` dan ringkasan workload perlu memakai
kontrak pertama, sedangkan `account_reference_counts` dan
`delete_eligible_account` harus mempertahankan kontrak kedua. Menyamakan
semuanya justru berisiko menghapus akun yang masih menjadi bagian audit trail.

## Keputusan Arsitektur yang Disarankan

| ID   | Keputusan                         | Rekomendasi                                                                                                                                    |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | History owner dokumen tidak aktif | Soft-deleted, superseded revision, dan stage terminal tetap menyimpan owner historis; jangan ikut transfer aktif.                              |
| D-02 | Event reassign Client             | Tambahkan `client_owner_change`; write baru memakai `event_data` terstruktur dan dilakukan di RPC yang sama dengan update owner.               |
| D-03 | Row audit lama                    | Jangan update/delete row `activity_log` lama. Reader mengenali legacy reassign secara kompatibel dan mengecualikannya dari Status Audit Trail. |
| D-04 | Dependency policy                 | Critical/High tanpa exception memblokir CI; Moderate/Low menjadi laporan. Exception wajib punya alasan, owner, dan tanggal kedaluwarsa.        |
| D-05 | Refactor Task                     | Behavior-preserving, sesudah baseline hijau; ekstraksi kecil per boundary, bukan rewrite satu kali.                                            |
| D-06 | Migration                         | Jangan edit migration yang sudah ada. Semua perubahan schema/function memakai migration baru.                                                  |

**Catatan keputusan 2026-08-08:** User menyetujui rencana lokal D-01 sampai
D-04 dan pelaksanaan Task A1-A3. Persetujuan awal ini tidak mencakup perubahan
remote, commit, push, atau deployment; tindakan tersebut kemudian dilakukan
setelah instruksi terpisah dari user.

**Catatan eksekusi 2026-08-08:** B1-B3 diimplementasikan lokal dengan
`client_owner_change`, RPC atomik `reassign_client_owner`, adapter client,
reader activity/status yang kompatibel dengan row legacy, dan migration
forward-only. Implementasi dikomit pada `f701816`; koreksi assertion test
dikirim pada `22e7612`. Migration production telah applied ke Supabase remote
`qhtfixgbcpcitokeryxb`; warning cache `pg-delta` tidak muncul lagi pada dry-run
ulang; CI run `31266493103` hijau termasuk Production migration parity,
Application and RLS tests, dan Browser E2E flows. Bukti browser/UAT spesifik
untuk reassign-owner di UI ditambahkan sebagai E2E lokal `manager can reassign
client owner and see ownership audit after reload`, yang membuktikan owner
persist setelah reload dan Activity Log menampilkan event sebagai Perubahan
Owner, bukan Perubahan Status Client.

## Dependency Graph

```text
Keputusan D-01..D-04
        |
        v
Baseline dapat dipercaya (A1-A4)
        |
        +--> Audit ownership atomik (B1-B3)
        |
        +--> Lifecycle dua-kontrak (C1-C3)
        |
        +--> Triage dependency --> CI gate (D1-D2)
        |
        v
Cleanup kontrak/debt kecil (E1-E3)
        |
        v
Refactor TasksInboxPage bertahap (F1-F3)
        |
        v
Release review --> remote migration/push hanya setelah approval terpisah
```

## Urutan Tindakan

### Fase 0 — Persetujuan Kontrak

- Konfirmasi D-01 sampai D-04 sebelum membuat migration.
- Tetapkan bahwa audit history lama tidak dimutasi.
- Tetapkan policy dependency dan siapa yang menjadi owner exception.

### Fase A — Pulihkan Signal Engineering

1. Format `DateRangePicker` agar lint kembali hijau.
2. Buat test document-numbering re-entrant dan buktikan dua run berturut-turut.
3. Bersihkan identifier TypeScript mati, lalu aktifkan lint rule unused.
4. Jalankan checkpoint penuh sebelum menyentuh alur ownership.

Alasan urutan: perubahan security/lifecycle tidak boleh dinilai di atas baseline
yang sudah merah karena residue fixture atau formatting.

### Fase B — Tutup Celah Audit Ownership

1. Tambah kontrak database `client_owner_change` dan perluas validasi
   `event_data` secara aditif.
2. Ganti `reassign_client_owner` dengan versi atomik: validasi role aktif,
   lock row, update owner, insert audit, lalu commit sebagai satu transaksi.
3. Pindahkan caller route ke data adapter; jangan ada direct RPC/insert audit di
   komponen.
4. Status Audit Trail hanya menerima nilai `ClientStatus` yang valid; legacy
   reassign tetap dapat tampil sebagai event ownership di Activity feed, tanpa
   mengubah row historis.
5. Uji forced audit failure: owner wajib tetap sama jika audit insert gagal.

### Fase C — Benarkan Lifecycle tanpa Merusak History

1. Tulis characterization test untuk workload aktif dan historical references.
2. Tambahkan helper/predicate database khusus active transferable commercial
   document.
3. Gunakan predicate itu pada transfer dan summary aktif saja.
4. Pastikan delete eligibility tetap diblokir oleh seluruh referensi historis.
5. Uji soft-delete, superseded revision, terminal stage, dan row audit lama.

### Fase D — Tutup Risiko Dependency

1. Triage 17 advisory berdasarkan dependency graph dan reachability.
2. Upgrade dependency induk/resolution aman dan dokumentasikan exception yang
   memang tidak reachable.
3. Baru setelah baseline audit diterima, jadikan job CI exit non-zero untuk
   Critical/High tanpa exception.

Mengaktifkan gate sebelum triage akan membuat CI merah permanen dan mendorong
orang mematikan gate lagi.

### Fase E — Bersihkan Kontrak yang Menyesatkan

1. Persempit `CommercialItemPatch` ke field yang benar-benar didukung.
2. Hapus exact cache write `["clients", "rows"]` yang tidak punya consumer,
   atau implementasikan updater paginated yang memakai query-key factory.
3. Bersihkan variabel PL/pgSQL yang tidak dipakai melalui migration baru bila
   function perlu didefinisikan ulang; jangan edit migration historis.

### Fase F — Kurangi Blast Radius Halaman Task

1. Tambah characterization test untuk filter, action, dan tiga view.
2. Ekstrak pure selectors/state controller.
3. Ekstrak query/mutation actions ke hook/module tanpa mengubah query keys.
4. Ekstrak Table, Kanban, dan Calendar satu per satu; verifikasi setelah setiap
   ekstraksi.

## Checkpoint Wajib

### Checkpoint A — Baseline Tepercaya

- `bun run lint` exit 0.
- `bun run typecheck` exit 0.
- Focused document-numbering test lolos dua kali berurutan.
- `bun run test` lolos dua kali berurutan pada database lokal yang sama.
- `bun run build` exit 0.

### Checkpoint B — Audit Ownership

- Fresh local DB reset sukses.
- Positive role tests dan negative role/RLS tests lolos.
- Forced audit failure membuktikan owner tidak berubah.
- Status Audit Trail tidak merender nama owner sebagai status.
- Activity feed tetap menampilkan event owner change baru dan legacy.

### Checkpoint C — Lifecycle

- Transfer tidak mengubah soft-deleted/superseded/terminal document.
- Summary active sama dengan jumlah row yang benar-benar transferable.
- Permanent delete tetap ditolak jika ada reference historis apa pun.
- Account lifecycle suite dan DB lint/advisors lolos sesuai baseline yang
  disetujui.

### Checkpoint D — Dependency/CI

- `bun audit --json` tidak memiliki Critical/High yang belum ditangani.
- Exception report berisi reason, owner, expiry.
- Test script membuktikan CI gate exit non-zero pada fixture High/Critical.
- Report artifact tetap di-upload saat job gagal.

### Checkpoint E — Refactor Task

- Tidak ada perubahan perilaku/label/query-key contract.
- Unit/integration test dan tiga mode tampilan lolos.
- `TasksInboxPage` tidak lagi memiliki query, mutation, dan seluruh view dalam
  satu function.
- Full test, lint, typecheck, build, dan E2E lolos.

## Prioritas dan Estimasi

| Paket kerja                         | Prioritas | Estimasi   | Owner yang disarankan       |
| ----------------------------------- | --------- | ---------- | --------------------------- |
| Baseline engineering                | P0        | 0,5-1 hari | QA/DevEx                    |
| Atomic Client ownership audit       | P0        | 1-1,5 hari | Supabase/backend + frontend |
| Lifecycle dua-kontrak               | P0        | 1-2 hari   | Supabase/backend            |
| Dependency triage dan gate          | P1        | 0,5-1 hari | DevEx/security              |
| Compatibility/cache/DB lint cleanup | P1        | 0,5-1 hari | Frontend/backend            |
| TasksInboxPage extraction           | P2        | 2-3 hari   | Frontend                    |

[Kemungkinan Besar] Total 5,5-9,5 hari kerja fokus untuk satu engineer,
di luar waktu approval, remote migration, deployment, dan browser UAT
production.

## Risiko dan Mitigasi

| Risiko                                                            | Dampak                                    | Mitigasi                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| Mengedit migration lama                                           | Local dan production schema dapat berbeda | Selalu migration aditif baru; fresh `db reset` dan migration parity check. |
| Audit row lama diubah untuk “merapikan” kind                      | Chain of custody/history rusak            | Forward-only event kind; compatibility read untuk legacy row.              |
| Satu predicate dipakai untuk active transfer dan permanent delete | Akun dengan history dapat terhapus        | Pisahkan active ownership dan historical reference contracts.              |
| Query key berubah saat refactor Task                              | UI stale atau cache shape salah           | Freeze exact keys dalam test sebelum ekstraksi.                            |
| Dependency upgrade besar sekaligus                                | Regression bundle/export/build            | Upgrade per parent dependency, focused verification, lalu full gate.       |
| Push `main` langsung deploy production                            | Perubahan belum UAT masuk live            | Review commit/push terpisah; jangan push tanpa approval eksplisit.         |

## Gate Remote dan Release

Rencana ini hanya mengizinkan implementasi dan verifikasi **lokal** setelah
disetujui. Untuk B1-B3, user kemudian memberi instruksi terpisah untuk
commit/push, remote Supabase mutation, dan verifikasi production. Tindakan
berikut tetap membutuhkan persetujuan terpisah dan eksplisit untuk fase
berikutnya:

- apply migration ke Supabase production `qhtfixgbcpcitokeryxb`;
- push/merge ke `main` yang memicu Vercel production;
- backfill atau perubahan data `activity_log` (rekomendasi saat ini: jangan
  dilakukan);
- deployment/UAT production.

Status harus selalu dilaporkan terpisah: local code, local DB, Git commit/push,
Supabase remote, Vercel deployment, dan browser production UAT.

## Definition of Done Program

- Seluruh acceptance criteria di checklist selesai.
- Tidak ada Critical/High dependency tanpa exception aktif yang sah.
- Full test lolos dua kali berurutan setelah fresh reset dan pada DB yang sama.
- Lint, typecheck, build, DB lint/advisors, dan E2E hijau.
- Audit ownership/lifecycle negative tests lolos.
- Dokumentasi audit diperbarui dengan status `RESOLVED`, `ACCEPTED`, atau
  `DEFERRED` per SEV, disertai bukti commit/test.
- User meninjau checkpoint lokal sebelum remote migration atau push.
