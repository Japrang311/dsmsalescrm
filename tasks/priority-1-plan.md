# Implementation Plan: Priority 1 (P1A–P1D)

> Dibuat: 2026-08-05
> Sumber: `NEXT-DEVELOPMENT-PHASE.md` Priority 1
> Spec: `specs/p1a-pwa-offline.md`, `specs/p1b-realtime-updates.md`,
> `specs/p1c-preferences-sync.md`, `specs/p1d-winloss-cycle-analytics.md`
> (keempatnya sudah direvisi + diverifikasi ke schema/code pada 2026-08-05)

> **Catatan file:** ini plan BARU untuk Priority 1. `tasks/plan.md` dan
> `tasks/todo.md` adalah rekaman historis Phase 1–12 dan **tidak boleh
> ditimpa** (CLAUDE.md). Task list per fitur ada di 4 file terpisah, ikut
> konvensi `tasks/<feature-name>-todo.md`.

## Overview

Empat fitur Priority 1 yang saling independen: PWA/offline shell (1A),
Supabase Realtime di pipeline + dashboard (1B), sync user preferences ke
Postgres (1C), dan analytics win/loss + cycle time di Reports (1D). Tidak
ada satu pun yang bergantung pada yang lain — bisa dikerjakan berurutan
atau dihentikan di tengah tanpa meninggalkan sistem setengah jadi.

Aplikasi ini **LIVE di production** (Vercel auto-deploy tiap push ke `main`,
Supabase `qhtfixgbcpcitokeryxb`). Artinya setiap task harus meninggalkan
`main` dalam keadaan build-able. Migration dan perubahan production
di-gate eksplisit per checkpoint.

## Architecture Decisions

- **Urutan tetap 1A → 1B → 1C → 1D** sesuai `NEXT-DEVELOPMENT-PHASE.md`,
  TAPI 1A dibuka dengan spike GO/NO-GO (Task 1A-0). Alasan: 1A satu-satunya
  yang menyentuh `vite.config.ts` + build pipeline, dan kompatibilitas
  `vite-plugin-pwa` dengan TanStack Start SSR (nitro, preset vercel) belum
  terbukti. Kalau spike NO-GO, lanjut ke 1B/1C/1D dan 1A direncanakan ulang
  — tidak memaksakan hack ke build config aplikasi production.
- **1D dikerjakan sebagai murni-aditif.** Tidak ada schema change, tidak ada
  dependency baru, tidak mengubah selector existing. Ini fitur paling aman
  dari keempatnya; kalau butuh quick win yang kelihatan, ini kandidatnya
  (lihat Open Questions).
- **Selector = pure function, chart = komponen terpisah.** `_app.reports.tsx`
  sudah 1167 baris. Menambah 3 section inline akan bikin file itu tidak
  terkelola, jadi chart baru diekstrak ke `src/components/reports/`.
- **`preferences-store.ts` mempertahankan API sinkron.** Store sekarang
  100% sinkron (`useSyncExternalStore`). localStorage tetap jadi sumber
  paint pertama (sinkron), Postgres jadi sumber kebenaran yang di-hydrate
  setelah auth siap. Consumer (`_app.settings.tsx`) tidak berubah.
- **Realtime menarget `commercial_documents`, bukan `commercial_items`.**
  `commercial_items` adalah tabel legacy pra-Phase-11 yang sudah tidak
  ditulis aplikasi; subscribe ke sana tidak akan pernah fire.
- **Migration local-first, remote di-gate.** Tidak ada `db push`/
  `apply_migration`/`alter publication` ke `qhtfixgbcpcitokeryxb` tanpa
  persetujuan eksplisit user yang menyebut nama project (CLAUDE.md).

## Dependency Graph

Antar-fitur: tidak ada dependency. Di dalam fitur:

```
1A: [1A-0 spike GO/NO-GO] ─▶ 1A-1 deps+icons ─▶ 1A-2 vite config
                                                     │
                                     1A-3 register SW ◀┘
                                          │
                                     1A-4 offline UX ─▶ 1A-5 verifikasi

1B: 1B-1 realtime.ts ─┬─▶ 1B-2 pipeline ─┐
                      └─▶ 1B-3 dashboard ─┴─▶ 1B-4 verifikasi ─▶ [1B-5 remote GATED]

1C: 1C-1 migration ─▶ 1C-2 RLS test ─▶ 1C-3 store ─▶ 1C-4 module test
                                                          │
                                        1C-5 settings verify ─▶ [1C-6 remote GATED]

1D: 1D-1 winloss ─┐
    1D-2 cycle    ├─▶ 1D-4 chart components ─▶ 1D-5 wire reports ─▶ 1D-6 export
    1D-3 funnel  ─┘
    (1D-1..3 saling independen, bisa paralel)
```

## Task List

Detail acceptance/verify per task ada di file todo masing-masing.

### Phase 1A — PWA + Offline Shell (`tasks/p1a-pwa-offline-todo.md`)

- [ ] 1A-0: Spike kompatibilitas `vite-plugin-pwa` + TanStack Start SSR
- [ ] **Checkpoint GO/NO-GO** ← keputusan user
- [ ] 1A-1: Tambah dependency + generate app icons
- [ ] 1A-2: Konfigurasi VitePWA di `vite.config.ts` + manifest
- [ ] 1A-3: Register service worker di `__root.tsx` (production only)
- [ ] 1A-4: Offline fallback UX
- [ ] 1A-5: Verifikasi Lighthouse + install + offline

### Checkpoint 1A

- [ ] `bun run build` sukses, `bun run lint` pass, `bun run test` pass
- [ ] Lighthouse PWA ≥ 90 di `bun run preview`
- [ ] Offline: shell render, tidak blank
- [ ] **Review user sebelum push ke `main`** (push = auto-deploy production)

### Phase 1B — Realtime (`tasks/p1b-realtime-todo.md`)

- [ ] 1B-1: `src/lib/realtime.ts` — subscribe helper + cleanup
- [ ] 1B-2: Wire `_app.pipeline.tsx` ke `commercial_documents`
- [ ] 1B-3: Wire `use-dashboard-data.ts` ke `tasks` + `sales_orders`
- [ ] 1B-4: Verifikasi 2-tab + cek memory leak
- [ ] 1B-5: `alter publication` di remote — **GATED, butuh approval user**

### Checkpoint 1B

- [ ] 2 tab lokal: perubahan tab 1 muncul di tab 2 ≤ 2 detik
- [ ] Channel unsubscribe saat unmount (verify via React DevTools)
- [ ] RLS: sales tidak menerima event milik sales lain
- [ ] `bun run test` + `bun run lint` pass
- [ ] **Review user sebelum jalankan SQL di production**

### Phase 1C — Preferences Sync (`tasks/p1c-preferences-sync-todo.md`)

- [ ] 1C-1: Migration kolom `preferences` + policy + column-scoped grant
- [ ] 1C-2: RLS test — termasuk test NEGATIF eskalasi role
- [ ] 1C-3: `preferences-store.ts` hydrate/persist async, API tetap sinkron
- [ ] 1C-4: Data module test
- [ ] 1C-5: Verifikasi integrasi Settings
- [ ] 1C-6: Apply migration ke remote — **GATED, butuh approval user**

### Checkpoint 1C

- [ ] `bunx supabase db reset` sukses
- [ ] RLS test pass, TERMASUK: user gagal update `role`/`name`/`email` sendiri
- [ ] Ganti device → preferences ikut
- [ ] Supabase mati → preferences masih bisa diubah (localStorage fallback)
- [ ] **Review user sebelum apply migration ke production**

### Phase 1D — Win/Loss + Cycle Time Analytics (`tasks/p1d-winloss-analytics-todo.md`)

- [ ] 1D-1: Selector `winLossRatio`
- [ ] 1D-2: Selector `averageCycleTime`
- [ ] 1D-3: Selector `stageConversionFunnel` + `averageDwellTime`
- [ ] 1D-4: Komponen chart di `src/components/reports/`
- [ ] 1D-5: Wire ke `_app.reports.tsx`
- [ ] 1D-6: Integrasi export CSV/XLSX/PDF

### Checkpoint 1D

- [ ] 3 section baru tampil di Reports
- [ ] Angka konsisten dengan dashboard KPI (tidak ada mismatch)
- [ ] Filter ReportFilterBar berfungsi untuk chart baru
- [ ] Unit test selector pass, `bun run lint` pass
- [ ] **Review user**

## Risks and Mitigations

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `vite-plugin-pwa` tidak kompatibel dengan TanStack Start SSR (nitro/vercel). App ini SSR — tidak ada `index.html` statis untuk di-precache, `navigateFallback` perlu cache response yang di-render server | **Tinggi** — bisa membatalkan 1A seluruhnya, atau merusak build production | Task 1A-0 spike lebih dulu, timeboxed, dengan checkpoint GO/NO-GO eksplisit. Jangan sentuh `vite.config.ts` di branch `main` sebelum spike lulus |
| `bunfig.toml` punya `minimumReleaseAge = 86400` — install `vite-plugin-pwa` bisa ditolak kalau versinya baru rilis <24 jam | Sedang | Pilih versi yang usianya >24 jam. Kalau harus di-bypass, minta konfirmasi user dulu untuk `minimumReleaseAgeExcludes` (spec `backend-data-layer.md`) |
| 1C menambah UPDATE policy self-service PERTAMA di `profiles` — tabel yang sengaja dikunci sejak awal agar user tidak bisa ubah `role` sendiri | **Tinggi (security)** | Grant di-scope per kolom (`grant update (preferences)`), bukan blanket. Wajib ada test NEGATIF yang membuktikan update `role`/`name`/`email` ditolak. Ini acceptance criteria, bukan opsional |
| `preferences-store.ts` sekarang 100% sinkron; menambah Supabase bikin flicker (form tampil default lalu loncat ke nilai DB) | Sedang | localStorage tetap paint pertama (sinkron); hydrate DB hanya menimpa kalau ada row-nya. Jangan blokir app load kalau fetch gagal |
| Dwell time dari `activity_log` hanya akurat untuk stage change SEJAK fitur logging aktif — data lama tidak punya histori | Sedang | Beri label eksplisit di chart ("berdasarkan data sejak logging aktif"). Exclude dokumen tanpa histori stage change, jangan diestimasi |
| `_app.reports.tsx` sudah 1167 baris | Rendah–Sedang | Ekstrak chart baru ke `src/components/reports/`, jangan inline |
| Push ke `main` = auto-deploy production. Tidak ada staging | **Tinggi** | Semua checkpoint mensyaratkan review user sebelum push. Verifikasi lokal (`build`+`lint`+`test`) wajib lulus dulu |
| CLAUDE.md menyatakan `vite.config.ts` di-wire oleh `@lovable.dev/vite-tanstack-config` dan melarang menambah plugin manual — padahal package itu **tidak ada** di `package.json` dan `vite.config.ts` sudah wire plugin secara manual | Rendah (tapi membingungkan saat 1A) | Catatan CLAUDE.md itu basi. Perbarui saat mengerjakan 1A-2, jangan diam-diam dilanggar |

## Open Questions

1. **Urutan eksekusi.** Plan ini mempertahankan 1A → 1B → 1C → 1D sesuai
   `NEXT-DEVELOPMENT-PHASE.md`. Tapi berdasarkan risiko: 1A paling berisiko
   (sentuh build production, dependency baru, kompatibilitas SSR belum
   terbukti), sedangkan **1D paling aman** (murni aditif, nol dependency,
   nol schema). Kalau prioritasnya "hasil kelihatan cepat tanpa risiko
   production", 1D duluan lebih masuk akal. Perlu keputusan user — plan ini
   siap dijalankan dengan urutan mana pun karena keempatnya independen.
2. **1A-0 NO-GO:** kalau spike gagal, apakah 1A di-drop, atau cari
   alternatif (misalnya manifest-only tanpa service worker → tetap
   installable, tapi tanpa offline shell)? Keputusan menunggu hasil spike.
3. **1B-5 dan 1C-6** menunggu approval eksplisit user yang menyebut project
   `qhtfixgbcpcitokeryxb` sebelum menyentuh production.
