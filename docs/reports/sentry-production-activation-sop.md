# Aktifkan Sentry Production — SOP (butuh akses user)

**Status:** Kode 100% siap. Yang kurang hanya mengisi env var di Vercel
project settings. Setelah itu deploy ulang sekali.

## Yang sudah ada di kode (tidak perlu diubah)

| Komponen | File | Perilaku |
| --- | --- | --- |
| Browser runtime init | `src/lib/browser-monitoring.ts` | `initBrowserMonitoring()` — init Sentry hanya jika `VITE_SENTRY_DSN` ada; lazy-import `@sentry/react` |
| Server runtime init | `src/lib/server-monitoring.ts` | `initServerMonitoring()` — init jika `SENTRY_DSN` atau `VITE_SENTRY_DSN` ada; pakai `@sentry/node` |
| Source-map upload | `vite.config.ts` | `sentryVitePlugin` aktif hanya jika `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` ada; sourcemap `hidden`, file `.map` dihapus setelah upload |
| Test | `src/lib/monitoring-config.test.ts` | 5 test config: disabled tanpa DSN, environment/release, fallback Vercel SHA, prefer private DSN, dll |

Tanpa env var, semua path ini **no-op** (tidak error, tidak bundle bloat — lazy import).

## Langkah di Vercel (user, ~10 menit)

1. Buka Vercel → project `dsmsalescrm` → **Settings → Environment Variables**.
2. Tambah 4 var (Production):

   | Key | Nilai | Dari mana |
   | --- | --- | --- |
   | `VITE_SENTRY_DSN` | `https://<public>@<org>.ingest.sentry.io/<project>` | Sentry dashboard → Project Settings → Client Keys (DSN) |
   | `SENTRY_AUTH_TOKEN` | `sentry_auth_token_...` | Sentry → Settings → Auth Tokens (scope: `project:releases`, `project:write`) |
   | `SENTRY_ORG` | `<org-slug>` | Sentry URL / Settings |
   | `SENTRY_PROJECT` | `<project-slug>` | Sentry URL / Settings |

   Catatan: `VITE_SENTRY_DSN` adalah public key — aman dipakai di browser
   (bukan rahasia). `SENTRY_AUTH_TOKEN` rahasia — hanya server-side.
3. Redeploy production: `vercel --prod` (atau push commit apa pun ke `main`).
4. Verifikasi:
   - **Event**: buka app, trigger error (atau tunggu), cek Sentry dashboard
     → Issues muncul, environment = `production`.
   - **Source-map**: di Sentry Issue detail, stack trace ter-resolve ke kode
     sumber (bukan minified), release = commit SHA.

## Verifikasi otomatis setelah deploy

Jalankan di repo (saya bisa lakukan setelah kamu set env var):
```bash
# cek env var ada di Vercel
/opt/homebrew/bin/vercel env ls production

# source-map upload aktif saat build (log akan tampil sentry: Source Maps uploaded)
/opt/homebrew/bin/vercel --prod --yes
```

## Catatan

- `tracesSampleRate: 0` — performance tracing dimatikan; hanya error events
  + source-map. Kalau mau tracing, ubah di `browser-monitoring.ts` /
  `server-monitoring.ts` (bukan wajib).
- Release name = commit SHA (`VERCEL_GIT_COMMIT_SHA`), jadi setiap deploy
  otomatis ter-associate ke commit yang benar.
