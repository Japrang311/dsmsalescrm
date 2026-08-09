# Dependency Advisory Triage — Task D1

**Tanggal:** 2026-08-09
**Scope:** local dependency remediation only. Tidak ada remote Supabase,
deployment, commit, atau push.

## Ringkasan

`bun audit --json` turun dari 17 advisory / 7 paket unik menjadi 7 advisory /
1 paket unik. `postcss`, `nanoid`, `js-yaml`, `dompurify`, `@babel/core`, dan
`esbuild` sudah tidak muncul di audit output setelah update/override lockfile.

Sisa advisory adalah `brace-expansion`. Advisory ini tidak dipaksa lewat
`overrides` karena repo memuat dua major berbeda:

- `brace-expansion@1.1.14` lewat `minimatch@3.1.5`, dipakai oleh ESLint.
- `brace-expansion@5.0.5` lewat `minimatch@10.2.5`, dipakai oleh
  TypeScript-ESLint/Sentry build tooling.

Memaksa satu versi global akan mencampur major v1/v5 dan berisiko mematahkan
lint/build. Bun mendukung `overrides`/`resolutions` untuk metadependency, tetapi
pin global tidak cukup presisi untuk kasus dua major `brace-expansion` ini.

## Advisory Decisions

| Package | Parent dependency | Reachability | Decision |
| --- | --- | --- | --- |
| `postcss` | `vite` | Build tool; tidak menerima source map dari user production. | Resolved: `vite` dinaikkan ke `^8.2.1`, lockfile memakai `postcss@8.5.26`. |
| `nanoid` | `postcss` lewat `vite` | Build tool only. Tidak ada pemanggilan app ke non-secure/custom generator rentan. | Resolved lewat update `vite`/`postcss`; lockfile memakai `nanoid@3.3.18`. |
| `js-yaml` | `@eslint/eslintrc`, `xmlbuilder2` lewat TanStack Start tooling | Build/lint/server tooling. App tidak punya fitur upload/parse YAML user-facing. | Resolved via `overrides.js-yaml = 4.3.1`. |
| `dompurify` | optional dependency `jspdf` | Production export dependency. App memakai jsPDF API text/table, bukan HTML sanitizer path, tetapi dependency tetap masuk jalur PDF export. | Resolved via `overrides.dompurify = 3.4.13`. |
| `@babel/core` | Vite React plugin, TanStack/Sentry build tooling | Build tool. Source files repo-controlled; no user-controlled `sourceMappingURL` build input. | Resolved via `overrides.@babel/core = 7.29.7`. |
| `esbuild` | `vite`/`tsx` | Dev/build tooling; low advisory scoped to Windows dev server. | Resolved by current lock after `vite` update; no audit finding remains. |
| `brace-expansion` | `minimatch` under ESLint, TypeScript-ESLint, Sentry build tooling | Build/lint tooling. No production route accepts user-controlled glob/brace patterns. | Accepted temporary exception. Owner: Project Owner. Expires: 2026-09-09. Review when parent tooling removes `minimatch@3` or Bun supports a safe nested pin for both major lines. |

## Verification Notes

- `bun audit --json` still exits 1 because of the accepted `brace-expansion`
  exception above.
- There are no Critical advisories.
- There are no unresolved High advisories outside the dated `brace-expansion`
  exception.
- D2 must make CI enforce: Critical/High fail unless covered by an unexpired
  exception with package, advisory id, owner, reason, and expiry.
