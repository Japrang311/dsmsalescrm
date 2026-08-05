# Task List: PWA + Offline Shell (P1A)

Spec: `specs/p1a-pwa-offline.md` (direvisi 2026-08-05).
Plan: `tasks/priority-1-plan.md`.

> **Status:** Belum diimplementasi. Mencentang task berarti acceptance +
> verify-nya sudah lulus di local dev. Checklist ini TIDAK mengotorisasi
> push ke `main` — push memicu auto-deploy Vercel ke production, jadi perlu
> konfirmasi terpisah di checkpoint akhir.

> **Risiko utama:** aplikasi ini SSR (TanStack Start + nitro preset vercel),
> bukan SPA. `vite-plugin-pwa` didesain terutama untuk SPA dengan
> `index.html` statis. Task 1A-0 ada untuk membuktikan ini bisa jalan
> SEBELUM menyentuh `vite.config.ts` aplikasi production.

## Dependency order

```
Task 1A-0 (spike)
   │
   ▼
[CHECKPOINT GO / NO-GO]  ← keputusan user
   │
   ▼
Task 1A-1 (dependency + icons)
   │
   ▼
Task 1A-2 (vite.config.ts + manifest)
   │
   ▼
Task 1A-3 (register SW di __root.tsx)
   │
   ▼
Task 1A-4 (offline fallback UX)
   │
   ▼
Task 1A-5 (verifikasi Lighthouse/install/offline)
```

## Tasks

- [ ] **Task 1A-0: Spike kompatibilitas `vite-plugin-pwa` + TanStack Start SSR**
  - Acceptance:
    - Dikerjakan di **branch terpisah** (mis. `spike/pwa`), bukan `main`.
      Boleh berantakan — ini dibuang setelah selesai, yang diambil hanya
      kesimpulannya.
    - Membuktikan/menyanggah 3 hal konkret:
      1. `bun run build` tetap sukses dengan plugin VitePWA aktif
         (nitro preset vercel tidak konflik).
      2. Service worker benar-benar ter-generate di output build, dan
         precache manifest-nya berisi asset client (JS/CSS), bukan kosong.
      3. `navigateFallback` bisa menyajikan shell saat offline meski HTML
         di-render server — atau tidak bisa, dan alasannya apa.
    - Timebox: berhenti dan lapor apa pun hasilnya. Kalau mentok, "tidak
      bisa" adalah hasil yang sah dan berguna — jangan dipaksakan dengan
      hack ke build config.
  - Verify:
    - Tulis temuan (GO / NO-GO + alasan + versi `vite-plugin-pwa` yang
      dipakai) langsung di task ini sebagai catatan.
    - `main` tidak tersentuh: `git status` di `main` tetap bersih.
  - Dependencies: None.
  - Files: branch terpisah, tidak ada file `main` yang berubah.
  - Size: S.

- [ ] **CHECKPOINT GO/NO-GO** ← perlu keputusan user
  - GO → lanjut Task 1A-1.
  - NO-GO → hentikan P1A, lapor ke user, lanjut ke P1B/P1C/P1D. Opsi
    cadangan yang bisa ditawarkan: manifest-only (app tetap installable /
    Add to Home Screen, tapi tanpa offline shell) — jauh lebih sederhana
    dan tidak menyentuh service worker sama sekali.

- [ ] **Task 1A-1: Tambah dependency + generate app icons**
  - Acceptance:
    - `vite-plugin-pwa` masuk `devDependencies` dengan versi yang usianya
      >24 jam (patuh `minimumReleaseAge = 86400` di `bunfig.toml`). Kalau
      terblokir guard, **berhenti dan tanya user** — jangan diam-diam
      menambah `minimumReleaseAgeExcludes`.
    - Icon dibuat dari `public/dsm-mark.png` yang sudah ada: 192x192,
      512x512, dan satu varian maskable (dengan safe-zone padding).
    - Icon disimpan di `public/icons/`.
  - Verify:
    - `bun install` sukses, `bun.lock` ter-update.
    - File icon benar-benar ada dan ukurannya benar (cek via `file` atau
      buka gambarnya).
  - Dependencies: 1A-0 (GO).
  - Files: `package.json`, `bun.lock`, `public/icons/*`.
  - Size: S.

- [ ] **Task 1A-2: Konfigurasi VitePWA di `vite.config.ts` + manifest**
  - Acceptance:
    - Plugin VitePWA ditambahkan ke array `plugins` di `vite.config.ts`,
      TIDAK mengubah/menghapus plugin yang sudah ada (`tsConfigPaths`,
      `tanstackStart`, `nitro`, `react`, `tailwindcss`).
    - Manifest di-generate lewat opsi plugin (bukan file `public/manifest.json`
      tulis tangan): `name`, `short_name`, `description`, `theme_color`,
      `background_color`, `display: "standalone"`, `start_url: "/"`, icons
      dari 1A-1.
    - `theme_color`/`background_color` ikut tema slate existing
      (`components.json` base color: slate).
    - Runtime caching: Supabase API network-first; shell statis
      precache/cache-first; **jangan** cache response yang mengandung token
      auth.
    - SW dinonaktifkan di dev (`devOptions.enabled: false`) supaya cache
      tidak mengganggu `bun run dev`.
    - Sekalian perbaiki catatan basi di `CLAUDE.md` yang menyebut
      `@lovable.dev/vite-tanstack-config` — package itu tidak ada di
      `package.json`, dan `vite.config.ts` memang wire plugin manual.
  - Verify:
    - `bun run build` sukses.
    - `bun run dev` masih jalan normal, tidak ada SW aktif di dev.
    - Manifest + SW muncul di output build.
  - Dependencies: 1A-1.
  - Files: `vite.config.ts`, `CLAUDE.md`.
  - Size: S.

- [ ] **Task 1A-3: Register service worker di `__root.tsx`**
  - Acceptance:
    - SW di-register hanya di production (`import.meta.env.PROD`) dan hanya
      di browser (guard `typeof window !== "undefined"` — ini app SSR,
      `navigator` tidak ada di server).
    - Register dilakukan di `useEffect` dalam `RootComponent`, tidak di
      module scope.
    - Kegagalan register di-catch dan tidak melempar — SW gagal tidak boleh
      menjatuhkan aplikasi.
  - Verify:
    - `bun run build && bun run preview` → SW terdaftar (cek DevTools →
      Application → Service Workers).
    - `bun run dev` → tidak ada SW terdaftar.
    - Tidak ada error SSR/hydration di console.
  - Dependencies: 1A-2.
  - Files: `src/routes/__root.tsx`.
  - Size: S.

- [ ] **Task 1A-4: Offline fallback UX**
  - Acceptance:
    - Saat offline, shell tetap render — sidebar/topbar tampil, layar tidak
      blank/putih.
    - Query yang gagal karena offline menampilkan pesan yang jelas
      (mis. "Anda sedang offline — data mungkin belum terbaru"), bukan error
      mentah atau spinner selamanya.
    - Reuse komponen `src/components/ui/empty-state.tsx` yang sudah ada,
      jangan bikin komponen baru kalau tidak perlu.
    - Saat online kembali, TanStack Query refetch otomatis (perilaku default,
      pastikan tidak sengaja dimatikan).
  - Verify:
    - `bun run preview`, buka app, DevTools → Network → Offline, refresh:
      shell tetap tampil.
    - Kembalikan ke Online: data ter-refresh tanpa reload manual.
  - Dependencies: 1A-3.
  - Files: `src/routes/__root.tsx` dan/atau komponen shell terkait
    (maksimal ~3 file — kalau lebih, pecah task ini).
  - Size: S–M.

- [ ] **Task 1A-5: Verifikasi akhir**
  - Acceptance:
    - Lighthouse PWA score ≥ 90 di `bun run preview`.
    - Installable di Android Chrome (muncul prompt Add to Home Screen).
    - Installable di iOS Safari (Share → Add to Home Screen), buka full
      screen tanpa address bar.
    - `bun run test` pass (tidak ada perubahan backend, jadi harusnya tidak
      ada regression — kalau ada, itu sinyal ada yang salah).
    - `bun run lint` pass.
  - Verify:
    - Lampirkan skor Lighthouse aktual, bukan "kira-kira lulus".
    - Test install di HP sungguhan, bukan hanya emulator.
  - Dependencies: 1A-4.
  - Files: tidak ada (verifikasi saja).
  - Size: S.

## Checkpoint akhir P1A

- [ ] `bun run build` sukses
- [ ] `bun run lint` pass
- [ ] `bun run test` pass
- [ ] Lighthouse PWA ≥ 90 (skor aktual dicatat)
- [ ] Offline: shell render, tidak blank
- [ ] Install works di Android + iOS
- [ ] **Konfirmasi user sebelum push ke `main`** — push = auto-deploy ke
      production `dsmsalescrm.vercel.app`. Service worker yang salah
      konfigurasi bisa menyajikan asset basi ke user yang sudah install;
      pastikan strategi update SW jelas sebelum rilis.
