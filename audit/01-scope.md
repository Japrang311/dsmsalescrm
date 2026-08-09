# Fase 0 — Peta & Ruang Lingkup

## Snapshot

- **Waktu audit:** 2026-08-08 (Asia/Jakarta)
- **Commit:** `5123ae7a8b759b39fab5286bd1c5d2b944fa43f4`
- **Branch:** `main`, sejajar dengan `origin/main`
- **Worktree saat pemetaan:** bersih
- **Ukuran kode:** 388 file, 75.372 LOC setelah mengecualikan dependency/build/cache/generated output.

## Stack dan entry point

- **Bahasa:** TypeScript/TSX, SQL PostgreSQL, CSS, TOML.
- **Frontend/SSR:** React 19 + TanStack Start/Router + Vite 8 + Nitro; Tailwind CSS 4.
- **Backend/data:** Supabase Auth, Postgres, RLS, Edge Functions (Deno-compatible TypeScript), Realtime/Storage lokal tersedia.
- **State/data fetching:** TanStack Query dan `@supabase/supabase-js`.
- **Package manager:** Bun 1.3.14 di CI, satu lockfile otoritatif `bun.lock`; `bunfig.toml` menahan paket yang baru dirilis kurang dari 24 jam.
- **Browser entry:** `src/routes/__root.tsx` dan route hasil file-based routing di `src/routes/`.
- **Router entry:** `src/router.tsx`; `src/routeTree.gen.ts` adalah file generated dan dikecualikan.
- **SSR entry:** `src/server.ts`, dipilih oleh `vite.config.ts`; middleware aplikasi berada di `src/start.ts`.
- **Database entry:** 90 migrasi imperatif di `supabase/migrations/`; file tersebut diperlakukan sebagai source keamanan karena proyek menyatakan migrasi ditulis/ditinjau manual, bukan generated output.
- **Edge Function:** `supabase/functions/manage-team-member/`.
- **Build/deploy:** `bun run build` menghasilkan bundle Vite/Nitro untuk preset Vercel region `hnd1`; push ke `main` memicu CI dan auto-deploy Vercel menurut dokumentasi proyek.
- **Quality gates CI:** lint, typecheck, reset/advisors/lint database lokal, unit/RLS tests, Playwright E2E, build/runtime smoke, migration parity, performance budget, dan dependency risk.

## Peta direktori kode dan LOC

Perhitungan memakai file teks kode (`.ts`, `.tsx`, `.js`, `.jsx`, `.sql`, `.css`, `.toml`) dan mengecualikan `.git`, `node_modules`, `dist`, `build`, `.vercel`, `.tanstack`, `.wrangler`, `.planning`, `.superpowers`, `.worktrees`, artifacts/output, cache `.temp`, lockfile, aset biner, serta `src/routeTree.gen.ts`.

| Area | LOC | Peran |
|---|---:|---|
| `src/components/` | 19.616 | UI domain dan primitives |
| `src/lib/` | 15.842 | data access, selectors, exports, rules, monitoring |
| `supabase/migrations/` | 12.845 | schema, RLS, RPC, grants, triggers |
| `supabase/tests/` | 9.752 | integration/RLS database tests |
| `src/routes/` | 9.682 | route, orchestration, page-level queries/mutations |
| `scripts/` (termasuk subfolder) | 3.865 | import, parity, benchmark, smoke, reports |
| `supabase/functions/` | 1.718 | lifecycle anggota tim via Edge Function |
| `supabase/` root/config/seed | 848 | konfigurasi dan seed lokal |
| `e2e/` | 408 | browser flows |
| `src/` root | 340 | SSR/router/start/styles |
| `src/hooks/` | 123 | hooks bersama |
| `src/context/` | 115 | role context |
| `supabase/snippets/` | 76 | bootstrap manual/historis |
| `tests/` | 76 | smoke/fixtures lintas modul |
| `supabase/scripts/` | 66 | bootstrap lokal |

## 10 file terbesar

| LOC | File | Alasan prioritas |
|---:|---|---|
| 2.069 | `src/routes/_app.tasks.tsx` | route paling besar; orchestration task dan mutasi |
| 1.778 | `src/routes/_app.settings.tsx` | pengelolaan akun/role dan surface admin |
| 1.251 | `supabase/tests/super-admin-rls.test.ts` | bukti boundary otorisasi paling kritikal |
| 1.184 | `supabase/tests/account-lifecycle.test.ts` | lifecycle akun, invariants, dan privileged actions |
| 1.164 | `src/components/clients/CreateRecordDialogs.tsx` | banyak flow pembuatan record bisnis |
| 1.076 | `supabase/migrations/20260718180929_add_account_lifecycle_functions.sql` | RPC lifecycle berprivilege tinggi |
| 1.051 | `src/routes/_app.sales-orders.$soId.tsx` | detail/edit Sales Order dan data finansial |
| 951 | `supabase/migrations/20260719033236_add_atomic_document_numbering.sql` | penomoran atomik dan fungsi database |
| 861 | `src/components/pipeline/PipelineCardDrawer.tsx` | stage transition dan edit pipeline |
| 805 | `src/lib/data/dashboard-selectors.ts` | aturan agregasi/dashboard terpusat |

## 10 file paling sering berubah

Diambil dari seluruh histori Git dengan `git log --format= --name-only`, mengabaikan baris kosong, lockfile, generated route tree, dan output audit.

| Perubahan | File | Risiko churn |
|---:|---|---|
| 32 | `HANDOFF.md` | continuity sering berubah; bukan source runtime |
| 26 | `tasks/four-stage-stabilization-and-growth-todo.md` | tracker historis; bukan source runtime |
| 24 | `src/routes/index.tsx` | auth/bootstrap routing |
| 22 | `src/routes/_app.clients.$clientId.tsx` | account-centric detail flow |
| 19 | `src/routes/_app.pipeline.tsx` | pipeline orchestration |
| 18 | `src/components/commercial/CommercialDetailPage.tsx` | commercial detail flow |
| 18 | `src/components/clients/CreateRecordDialogs.tsx` | multi-flow record creation |
| 16 | `src/routes/_app.reports.tsx` | report orchestration/filtering |
| 16 | `src/lib/data/clients.ts` | client query/mutation boundary |
| 15 | `src/routes/_app.tasks.tsx` | task orchestration |

## Prioritas audit

1. **Boundary otorisasi database:** seluruh policy/grant/RPC `SECURITY DEFINER`, khususnya migrasi account lifecycle, task control loop, ownership transfer, metrics, dan Edge Function `manage-team-member`.
2. **Input sampai sink:** login, form create/edit, CSV/Sheet importer, Edge Function body parsing, RPC arguments, PDF/XLSX/CSV export, dan setiap `dangerouslySetInnerHTML`/DOM sink.
3. **Data access:** `src/lib/data/` dan route yang melakukan query/mutation langsung; cari IDOR/BOLA, query tanpa scoping, unbounded fetch, dan error yang ditelan.
4. **Hotspot ukuran/churn:** file pada dua tabel di atas, dengan fokus memisahkan temuan nyata dari sekadar ukuran besar.
5. **Verifikasi:** test unit/RLS/E2E, CI config, typecheck/lint/build, dependency audit, secret scanning, dan migration parity lokal yang tersedia.

## Pengecualian eksplisit

- Dependency/vendor: `node_modules/`.
- Output build/cache: `dist/`, `build/`, `.vercel/`, `.tanstack/`, `.wrangler/`, `supabase/.temp/`.
- Worktree lain dan artifacts: `.worktrees/`, `.claude/worktrees/`, `artifacts/`, `outputs/`, `graphify-out/`.
- Generated source: `src/routeTree.gen.ts`.
- Lockfile: `bun.lock` tidak dibaca baris per baris; tetap dipakai oleh native dependency audit.
- Aset biner: PNG dan file non-teks.
- Dokumen historis/planning tidak dihitung sebagai source runtime; hanya dibaca bila perlu untuk memvalidasi intent atau klaim dokumentasi yang bertentangan dengan kode.

## Catatan ruang lingkup

Ukuran source runtime + test/database adalah 75.372 LOC, jauh di atas panduan 30k LOC pada prompt. Audit tetap diteruskan per fase dengan checkpoint di `audit/00-STATE.md`; area yang belum sempat dibaca akan disebut eksplisit dan tidak akan disajikan sebagai cakupan lengkap.
