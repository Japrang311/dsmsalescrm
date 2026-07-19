# Phase 11 Import Closeout Evidence

Date: 2026-07-19  
Environment: local Supabase at `127.0.0.1:54321` only. No operation was
performed against a remote Supabase project.

## Verdict

[Pasti] Every row in the five prepared source-tab CSVs has been processed
through the normalized importer. Every document that passed validation is
present in local Postgres with matching ownership, dates, classifications,
item counts, and totals.

[Pasti] Rows requiring judgment remain quarantined. They were not partially
imported and were not silently coerced.

## Source-to-database reconciliation

Fresh dry-runs and a read-only source-to-database comparison produced:

| Tab       | Source rows | Review rows | Imported headers | Imported items |            Paid total |
| --------- | ----------: | ----------: | ---------------: | -------------: | --------------------: |
| QUOTATION |         747 |          98 |              377 |            649 |      Rp83.588.869.771 |
| SO 2026   |         312 |          25 |              127 |            287 |      Rp16.511.939.352 |
| NP 2026   |          18 |           4 |               12 |             14 |          Rp87.358.000 |
| PROTY     |          12 |           0 |                8 |             12 |          Rp12.346.000 |
| HARIFF    |          43 |           0 |               25 |             43 |       Rp3.259.394.500 |
| **Total** |   **1.132** |     **127** |          **549** |      **1.005** | **Rp103.459.907.623** |

The comparison checked every accepted document number against local Postgres
and reported `failures: []`.

For Sales Orders it compared customer PO, Date, client, owner, tax type,
Prototype status, header total, item count, and item total. For Quotations it
compared client, owner, Date, item count, and item total.

## Closeout corrections

The closeout audit found that the importer could previously accept the valid
rows of a document while other rows with the same document number went to
review. This could create an incomplete header total.

The importer now quarantines the entire document when any source row for that
document requires review. The regression is covered by a red-then-green test.

The closeout audit also found a safe continuation-row pattern in Sales Order
sources: one document can state its single customer PO on the first item and
leave the following item rows blank. The parser now forward-fills a PO only
when the non-Quotation document contains exactly one unique nonblank PO.
Documents with multiple distinct POs are not coerced.

The correction affected:

- `DSM-26SO065`, `DSM-26SO066`, and `DSM-26SO129` now reconcile as 18 complete
  items totaling Rp188.949.450 and were imported locally in one transaction.
- `DSM-26SO111` remains quarantined because it still contains rejected rows.
- `DSM-26QUO-0208` and `DSM-26QUO-0389`; their partial local rows had no
  task, follow-up, activity, or revision references and were removed together
  with their child items.

Five historical customer spellings were approved as explicit aliases after
their source owner and customer PO identity matched the existing master client.
This released seven complete local documents (`DSM-26SO068`, `DSM-26SO090`,
`DSM-26SO121`, `DSM-26SO131`, `DSM-26SO143`, `DSM-26NP009`, and
`DSM-26NP015`) with 10 items totaling Rp75.991.500. The importer never applies
fuzzy matching to unapproved names.

Four bare carriage-return characters inside three unquoted Quotation cells
previously split physical source rows into incomplete records. Removing only
those embedded characters restored `DSM-26QUO-0194` and `DSM-26QUO-0208` as
complete documents and reduced `DSM-26QUO-0238` to one coherent review row.

`PT. CIKARANG LISTRINDO` was also approved as an alias of
`PT. Cikarang listrindo Indonesia`: SO138 shares PO `4300004949` with the
existing quotation history, SO140 is linked from Quotation
`DSM-26QUO-0332.R3`, and both use the master's owner. Together these corrections
released four complete local documents with 10 items totaling Rp250.149.000.

The final header-conflict audit found one punctuation-only address variation:
`PT.Hariff Daya Tunggal Engineering` versus
`PT Hariff Daya Tunggal Engineering`. Header comparison now ignores
punctuation, casing, and repeated whitespace for `clientAddress` only, while
preserving the first source spelling. This released `DSM-26QUO-0119` with two
items totaling Rp13.250.000. Status, Note, linked SO, PO, and client-ID
conflicts remain quarantined because they contain distinct business values.

The final verification also found that numbering tests used live-looking
2026/2027 counter years. A full suite could therefore delete the imported 2026
seeds and leave 2027 test counters behind. Numbering tests now use dedicated
2091–2096 years, delete only those test counters, and clean stale injected
failure triggers before and after lifecycle tests. A fresh 313-test run left
the counter table byte-for-byte equivalent to its pre-test state.

Counter seeding was also corrected. Valid official numbers found on review
rows now reserve their sequence so the app cannot issue a historical number
again. Fresh dry-runs propose:

| Series/year | Reserved maximum | Expected next    |
| ----------- | ---------------: | ---------------- |
| QUO/26      |              404 | `DSM-26QUO-0405` |
| SO/26       |              143 | `DSM-26SO144`    |
| NP/26       |               16 | `DSM-26NP017`    |
| PROTY/26    |                8 | `DSM-26PROTY009` |

HARIFF historical numbers remain outside automatic counter seeding. The local
counter table matches the four 2026 maxima above and retains the historical
SO/22 seed required by existing local data.

## HARIFF evidence

- 25 headers and 43 items were reconciled.
- Paid total is Rp3.259.394.500.
- All 43 items use `Unit` because the source has no explicit UOM column.
- Four documents preserve multiple unique customer POs in source order:
  `DSM-22SO136`, `DSM-22SO137`, `DSM-22SO143`, and `DSM-22SO145`.
- HARIFF imported numbers consume no special HARIFF counter.

## Fresh verification

- Focused importer suite: 24 pass, 0 fail.
- Full project suite: 313 pass, 0 fail.
- TypeScript: `bunx tsc --noEmit` passed.
- ESLint passed with 0 errors and 12 existing warnings.
- Production client, SSR, and Nitro build passed.
- Prettier check passed for every closeout file.
- Five fresh dry-runs completed with exit code 0 and no writes.
- Read-only source-to-database comparison returned `failures: []`.
- Counter query returned SO/22=22, QUO/26=404, SO/26=143, NP/26=16,
  PROTY/26=8.
- Full-suite counter snapshot before/after: unchanged.

## Remaining gates

The 127 review rows, represented by 55 pending decision entries in
`Phase-11-Import-Review.xlsx`, require source-data correction or an explicit business
decision. They are intentionally not part of revenue or forecast.

Remote rollout remains blocked until the owner identifies the exact Supabase
target and separately approves the reviewed migration and import commands.
