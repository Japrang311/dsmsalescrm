# Stage 2 Dependency Risk Triage

**Date:** 2026-08-05  
**Scope:** local dependency audit triage only. No dependency upgrade was performed. No approved vulnerability exception was created.

## Summary

`bun audit --json` currently reports 13 advisories:

- Critical: 0
- High: 8
- Moderate: 3
- Low: 2

## Triage table

| Package           | Advisories | Severity           | Observed dependency path                                                                                         | Initial disposition                                                                                                                                                  |
| ----------------- | ---------: | ------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brace-expansion` |          7 | 6 high, 1 moderate | Transitive through `minimatch` used by ESLint / TypeScript ESLint tooling.                                       | Tooling-path risk. Do not expose user input directly to this package in app runtime. Upgrade path should start with ESLint / TypeScript ESLint stack review.         |
| `js-yaml`         |          2 | 1 high, 1 moderate | Transitive through ESLint config tooling and `xmlbuilder2` under TanStack Start tooling.                         | Tooling/server-build path risk. No production YAML upload/parse feature is approved in this app. Upgrade path should verify ESLint and TanStack Start compatibility. |
| `postcss`         |          2 | 1 high, 1 moderate | Transitive through `vite`.                                                                                       | Build-tool risk with source-map handling. Highest practical upgrade value because Vite owns the path. Upgrade only in isolated batch with build/runtime smoke.       |
| `@babel/core`     |          1 | low                | Transitive through `@vitejs/plugin-react`, TanStack router/start build tooling, and Babel dead-code elimination. | Build-tool risk. Upgrade with Vite/TanStack compatibility check.                                                                                                     |
| `esbuild`         |          1 | low                | Transitive/peer through `vite` and `tsx`.                                                                        | Local dev-server risk, especially Windows-specific advisory. Keep dev server loopback-only; upgrade through Vite/tsx batch.                                          |

## Policy decision

No advisory is considered permanently accepted.

The CI dependency-risk job generates a non-secret artifact (`dependency-risk-report.md`) so every run records the current advisory set. It does not yet fail the whole pipeline because the baseline is already known-red and Stage 2 has not approved dependency upgrades or dated exceptions.

## Required next decision

Choose one path before closing Stage 2:

1. Approve isolated upgrade batches for Vite/TanStack/ESLint-related packages.
2. Approve dated exceptions with explicit owner and expiry for any advisory that remains after upgrade attempts.

Recommended owner for temporary exceptions, if approved later: `Project Owner`. Recommended expiry: 2026-09-05 or earlier.
