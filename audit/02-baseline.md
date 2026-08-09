# Fase 1 — Automated Baseline

Semua hasil pada file ini berlabel **[VERIFIED]** karena berasal dari perintah yang dijalankan pada checkout `5123ae7a8b759b39fab5286bd1c5d2b944fa43f4` tanggal 2026-08-08. Output credential lokal dari `supabase status` sengaja tidak disalin; nilainya adalah credential development stack standar, bukan bukti credential produksi.

## Ringkasan

| Area | Perintah | Exit | Hasil |
|---|---|---:|---|
| Secrets tool discovery | `command -v gitleaks trufflehog` | 0 | Keduanya tidak tersedia |
| Secret fallback | `git ls-files`, `rg` current tree, `git log -G` history | 0 | Hanya `.env.local.example` tracked; tidak ada private key atau key provider produksi yang terkonfirmasi; JWT tracked adalah fixture Supabase lokal |
| Dependency | `bun audit --json` | 1 | 17 advisory pada 7 paket bernama unik; beberapa high, perlu triage reachability |
| Static tool discovery | `command -v semgrep osv-scanner` | 0 | Keduanya tidak tersedia |
| ESLint/Prettier | `bun run lint` | 1 | 2 error formatting, 15 warning |
| TypeScript | `bun run typecheck` | 0 | Lolos, tanpa diagnostic |
| Build | `bun run build` | 0 | Lolos; Vite client + SSR/Nitro Vercel output terbentuk |
| Unit/integration/RLS | `bun --env-file=.env.local test tests scripts supabase src` | 1 | 583 pass, 3 fail, 2.374 assertions, 79 file |
| Focused test | `bun --env-file=.env.local test supabase/tests/document-numbering.test.ts` | 1 | 5 pass, 3 fail; dua collision data dan satu teardown Auth 500 |
| Browser E2E | `bun run test:e2e` | 0 | 8/8 Chromium flow lolos |
| DB lint | `supabase db lint --local --level warning --fail-on none` | 0 | 3 false/structural errors pada temp table analysis, 3 unused-variable warning |
| DB advisors | `supabase db advisors --local --type all --level info --fail-on none` | 0 | Tidak ada security advisory; 18 info unindexed foreign key |
| Dependency age | query metadata registry npm untuk dependency langsung | 0 | `clsx` latest 2.1.1 dirilis 2024-04-23; `xlsx` registry latest 0.18.5 dirilis 2022-03-24, tetapi repo memakai tarball SheetJS 0.20.3 di luar registry |

## Secrets

### Tool dan perintah

```text
gitleaks: MISSING
trufflehog: MISSING
```

Fallback yang dijalankan:

```text
git ls-files '.env*' '*.pem' '*.key'
rg current tree untuk credential keywords, provider key shapes, dan private-key header
git log --all -G'<credential patterns>' --name-only
```

Hasil:

- Satu file env tracked: `.env.local.example`; isinya URL loopback dan placeholder anon key kosong.
- JWT panjang ditemukan di 11 file test/script/config. Payload dan URL pendamping menunjukkan fixture Supabase lokal; `supabase/tests/local-supabase-url.test.ts` juga menguji fail-closed terhadap URL non-lokal.
- Pattern `dpl_...` ditemukan pada handoff/report sebagai Vercel deployment identifier. Itu bukan token autentikasi.
- Pencarian history berbasis regex menghasilkan kandidat commit, tetapi tanpa `gitleaks`/`trufflehog` tidak ada entropy verification, allowlist, atau validasi provider. Karena itu kesimpulannya **bukan** “history bersih”; kesimpulannya “tidak ada secret produksi yang terkonfirmasi oleh fallback terbatas”.

## Dependency audit

`bun audit --json` berhasil setelah akses registry diberikan dan mengembalikan exit 1.

| Paket terpasang | Advisory severity | Jalur/reachability awal |
|---|---|---|
| `@babel/core@7.29.0` | 1 Low | build/tooling |
| `brace-expansion@1.1.14`, `5.0.5` | 1 Moderate + 6 High | transitif lint/glob; tidak ditemukan import aplikasi |
| `dompurify@3.4.12` | 1 Moderate XSS | optional dependency `jspdf`; masuk production bundle |
| `esbuild@0.27.7` | 1 Low | build/dev server Windows; environment audit macOS/Vercel Linux |
| `js-yaml@4.1.1` | 1 Moderate + 2 High | transitif ESLint/xml tooling; tidak ditemukan parser YAML di source aplikasi |
| `nanoid@3.3.12` | 2 High | transitif PostCSS; tidak ditemukan import aplikasi |
| `postcss@8.5.15` | 1 Moderate + 1 High | transitif Vite/build; source-map file-read class |

Advisory yang paling mungkin reachable pada artefak production adalah DOMPurify karena build menunjukkan chunk `dompurify` dan `jspdf` dipakai untuk export PDF. Reachability eksploit spesifik tetap perlu dikaitkan ke sink pada Fase 2; native audit sendiri tidak membuktikan eksploitabilitas.

Pemeriksaan usia dependency langsung terhadap tanggal batas 2024-08-08 menemukan:

- `clsx@2.1.1`: rilis latest npm 2024-04-23 (>24 bulan). Paket kecil/stabil, jadi usia rilis adalah sinyal maintenance, bukan vulnerability.
- `xlsx`: repo memasang SheetJS 0.20.3 dari CDN vendor, sedangkan registry npm berhenti pada 0.18.5 (2022-03-24). Metadata registry tidak dapat menetapkan umur rilis tarball 0.20.3; provenance/release-age vendor ini tetap gap.

## Static analysis

### ESLint + Prettier

```text
17 problems (2 errors, 15 warnings)
2 errors and 0 warnings potentially fixable with --fix
```

Error berada di `src/components/dashboard/DateRangePicker.tsx:87-88` dan murni formatting. Warning terdiri dari 14 `react-refresh/only-export-components` dan satu hook dependency nyata di `src/components/tasks/TaskDetailDrawer.tsx:159`; ada pula satu unnecessary dependency di route Pipeline. Source tidak diubah dan `--fix` tidak dijalankan.

### Typecheck

```text
$ tsc --noEmit
exit 0
```

### Semgrep/OSV

```text
semgrep: MISSING
osv-scanner: MISSING
```

## Build

`bun run build` exit 0. Client mentransformasi 3.996 module dan SSR 233 module. Warning yang terlihat:

- Node `module.register()` deprecated.
- `vite-tsconfig-paths` kini redundant karena Vite 8 memiliki native tsconfig path resolution.
- Nitro menargetkan runtime Node.js 24 dan menghasilkan Vercel output.

Build juga membuktikan beberapa paket vulnerable masuk artefak production, termasuk chunk DOMPurify dan dependency PDF/XLSX yang besar. Build sukses tidak menghapus advisory security.

## Test

### Run tanpa akses loopback

Run pertama di sandbox menghasilkan 193 pass/143 fail karena koneksi `127.0.0.1:54321/54322` ditolak. Itu adalah kegagalan environment dan tidak dipakai sebagai verdict kode.

### Run dengan akses Supabase lokal

Run serial final:

```text
3 tests failed
583 pass
2374 expect() calls
Ran 586 tests across 79 files. [67.10s]
```

Focused run `supabase/tests/document-numbering.test.ts` menunjukkan:

```text
Received code 23505:
Key (quotation_number)=(DSM-94QUO-0001) already exists.
commercial_documents_quotation_number_key

5 pass, 3 fail, 29 expect() calls
```

Dua test memakai tahun/kunci tetap dan hanya menghapus counter, bukan dokumen dari run sebelumnya; test suite tidak re-entrant terhadap DB yang sudah pernah dipakai. Teardown kemudian gagal menghapus Auth fixture dengan HTTP 500. Ini akan dinilai sebagai maintainability/test isolation, bukan kegagalan fitur penomoran production tanpa bukti tambahan.

Coverage tidak dijalankan: suite belum hijau dan tidak ada script coverage terpisah; angka coverage pada run gagal berpotensi menyesatkan.

### Browser E2E

`bun run test:e2e` membangun production preview dan menjalankan delapan flow Chromium; semuanya lolos dalam 30,1 detik, termasuk login protection, Task persistence, follow-up persistence, Quotation/SO creation, Closed Lost reason, dan denial write Executive oleh RLS/RPC.

## Database lint/advisors

`supabase db lint --local` melaporkan temp table tidak dikenal pada tiga fungsi (`private.migrate_commercial_document_data`, `public.admin_import_normalized_documents`, `public.import_business_calendar_holidays`). Test integrasi fungsi-fungsi terkait lolos, sehingga hasil ini adalah keterbatasan static analyzer terhadap temp table yang dibuat dinamis dalam body fungsi, bukan defect runtime yang terverifikasi.

Unused-variable warning:

- `public.reassign_client_owner`: `v_old_owner_id`, `v_new_owner_name`.
- `public.commercial_analytics_coverage`: `v_so_linked`.

`supabase db advisors --local` tidak melaporkan security advisory. Ada 18 foreign key tanpa covering index pada legacy private tables serta `activity_log`, `business_calendar_holidays`, `commercial_documents`, `follow_up_logs`, `sales_orders`, dan `tasks`. Advisor berlevel INFO; dampak harus diukur terhadap volume/query aktual sebelum diangkat sebagai temuan.

## Gap baseline

- `gitleaks` dan `trufflehog` tidak tersedia; history secret scan tidak setara dengan scanner entropy/provider-aware.
- `semgrep` tidak tersedia; tidak ada cross-file taint analysis otomatis.
- `osv-scanner` tidak tersedia; dependency baseline hanya memakai native Bun audit.
- Tidak ada cyclomatic-complexity/coverage tool terkonfigurasi.
- Release age/provenance tarball SheetJS 0.20.3 di luar npm registry belum dapat diverifikasi dari metadata npm.
