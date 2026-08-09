# Audit Codebase — DSM SALES CRM

## Verdict

[Pasti] Codebase memiliki boundary RLS yang kuat, typecheck/build hijau, dan 8/8 E2E lolos, tetapi belum release-ready karena lint, dependency audit, dan suite integrasi lokal belum hijau. [Pasti] Tidak ditemukan Critical remote exploit tanpa autentikasi; temuan security terberat adalah reassign owner yang dapat commit tanpa audit trail. [Pasti] Risiko maintainability terbesar bukan ukuran file semata, melainkan predicate lifecycle commercial document yang sudah diketahui berbeda antara summary dan enforcement. [Kemungkinan Besar] Perbaikan bertahap pada transaksi audit, predicate database, fixture isolation, dan komponen Task akan menurunkan risiko tanpa rewrite arsitektur. [Menebak] Postur production hosted dapat berbeda karena environment Supabase/Vercel remote tidak diverifikasi dalam audit read-only ini.

## Ringkasan Temuan

| Kategori | High | Medium | Low | Total |
| --- | ---: | ---: | ---: | ---: |
| Security | 1 | 2 | 0 | 3 |
| Maintainability | 1 | 2 | 2 | 5 |
| Readability | 0 | 2 | 2 | 4 |
| **Total** | **2** | **6** | **4** | **12** |

## Top 10 Aksi

Urutan mempertimbangkan rasio dampak terhadap effort; dua cleanup Low dengan dampak terendah tidak masuk daftar ini.

| Temuan | Severity | Effort | Dampak |
| --- | --- | --- | --- |
| [SEV-01 — Atomikkan reassign owner dan audit trail](03-security.md#sev-01-perubahan-owner-dapat-berhasil-tanpa-audit-trail) | High | M | Menutup operasi ownership yang sekarang dapat sukses tanpa bukti aktor/alasan. |
| [SEV-03 — Jadikan dependency audit sebagai gate CI](03-security.md#sev-03-job-dependency-ci-selalu-menjadi-laporan-bukan-gate) | Medium | S | Mencegah critical/high advisory baru lolos merge tanpa keputusan risiko. |
| [SEV-09 — Pisahkan event owner change dari status change](05-readability.md#sev-09-event-reassign-owner-dinamai-sebagai-perubahan-status-client) | Medium | M | Menghentikan nama owner tampil sebagai badge status dan memulihkan semantik audit feed. |
| [SEV-06 — Buat fixture penomoran re-entrant](04-maintainability.md#sev-06-test-penomoran-dokumen-tidak-re-entrant-terhadap-database-lokal) | Medium | M | Mengembalikan `bun run test`/`verify:app` sebagai signal regression yang dapat dipercaya. |
| [SEV-04 — Satukan predicate active commercial ownership](04-maintainability.md#sev-04-predicate-lifecycle-commercial-document-sudah-menyimpang-antar-fungsi) | High | L | Mencegah summary, blocker lifecycle, dan transfer memperlakukan history secara berbeda. |
| [SEV-02 — Triage dan upgrade dependency rentan](03-security.md#sev-02-dependency-audit-gagal-dengan-advisory-high-yang-belum-ditutup) | Medium | M | Mengurangi exposure build/runtime dan mencegah jalur rentan menjadi reachable di fitur baru. |
| [SEV-10 — Persempit kontrak compatibility CommercialItem](05-readability.md#sev-10-kontrak-commercialitempatch-menawarkan-field-yang-selalu-ditolak) | Medium | M | Menghapus API yang lolos typecheck tetapi selalu gagal runtime. |
| [SEV-05 — Pecah TasksInboxPage per boundary](04-maintainability.md#sev-05-halaman-task-adalah-satu-fungsi-1171-baris-dengan-kompleksitas-sangat-tinggi) | Medium | L | Menurunkan blast radius perubahan pada workflow Task dan tiga mode tampilannya. |
| [SEV-11 — Aktifkan deteksi unused identifier](05-readability.md#sev-11-aturan-lint-mematikan-deteksi-identifier-typescript-yang-tidak-dipakai) | Low | S | Menghentikan import/type/parameter mati menambah noise pada file besar. |
| [SEV-07 — Hapus atau benarkan cache key Client yang mati](04-maintainability.md#sev-07-add-client-menulis-cache-key-yang-tidak-lagi-dikonsumsi-aplikasi) | Low | S | Menghapus kontrak cache palsu yang dapat menyesatkan perubahan optimistic update berikutnya. |

Temuan Low di luar Top 10: [SEV-08 — variabel PL/pgSQL tidak dipakai](04-maintainability.md#sev-08-plpgsql-menyimpan-hasil-query-ke-variabel-yang-tidak-pernah-dibaca) dan [SEV-12 — formatter branch tidak hijau](05-readability.md#sev-12-branch-saat-ini-tidak-memenuhi-formatter-yang-diwajibkan-lint).

## Dokumen Fase

- [01 — Scope dan peta codebase](01-scope.md)
- [02 — Automated baseline](02-baseline.md)
- [03 — Security](03-security.md)
- [04 — Maintainability](04-maintainability.md)
- [05 — Readability](05-readability.md)

## Cakupan Tidak Terselesaikan

- **Production remote:** Supabase hosted, Auth policy/rate limit, secret Vercel, response header deployment, dan data production tidak diverifikasi; tidak ada exact-target approval untuk tindakan remote.
- **Pembacaan baris demi baris:** 388 file/75.372 LOC tidak seluruhnya dibaca manual. Deep read diprioritaskan ke file LOC/churn tertinggi, auth/RLS/RPC, mutation privileged, sink input/export, Edge Function, warning tool, dan alur bisnis kritis; primitive UI lain, mayoritas test helper, serta script non-runtime hanya mendapat scan otomatis/targeted read.
- **Migration history penuh:** effective schema dan migration yang mendefinisikan ulang fungsi kritis diperiksa; seluruh 90 migration tidak direkonstruksi manual statement demi statement. Migration auto-generated dan artifact memang dikecualikan dari scope.
- **Coverage numerik:** tidak dihitung karena suite belum hijau dan tidak ada script coverage terpisah; mengeluarkan persentase dari run gagal akan menyesatkan.
- **Dynamic/runtime graph:** import cycle scan hanya mencakup static TypeScript import/export yang dapat di-resolve; dynamic import/plugin resolution tidak dibuktikan bebas cycle.
- **Exploit testing:** tidak dilakukan pentest, fuzzing, browser abuse/rate-limit, atau uji exploit advisory dependency terhadap production.

## Gap Tooling

| Tool/kapabilitas | Status | Konsekuensi |
| --- | --- | --- |
| `gitleaks` / `trufflehog` | Tidak tersedia | Secret history hanya diperiksa dengan tracked-file/regex fallback, tanpa entropy/provider validation. |
| `semgrep` | Tidak tersedia | Tidak ada taint analysis otomatis lintas file. |
| `osv-scanner` | Tidak tersedia | Dependency advisory hanya memakai native `bun audit`. |
| Standard complexity tool | Tidak terkonfigurasi | Complexity TypeScript adalah perkiraan traversal AST lokal, bukan metric Sonar/ESLint resmi. |
| `knip`/dead-export analyzer | Tidak terkonfigurasi | Dead export penuh tidak dapat dibuktikan; unused check tambahan hanya menemukan identifier lokal. |
| Coverage runner/config | Tidak tersedia sebagai script | Tidak ada angka branch/line/function coverage yang dapat dilaporkan dengan jujur. |

## Bukti Status Checkout

- Snapshot awal: commit `5123ae7a8b759b39fab5286bd1c5d2b944fa43f4`, branch `main` sejajar `origin/main`.
- Source/dependency/migration tidak diubah. Satu-satunya output kerja audit adalah file Markdown di `audit/`.
