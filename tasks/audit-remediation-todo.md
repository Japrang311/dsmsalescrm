# Checklist Remediasi Audit Codebase

> **Status:** IN PROGRESS — Task 0, Fase A, B1-B3, C1-C3, dan Checkpoint C
> lokal selesai; Checkpoint B terverifikasi
> **Plan:** `tasks/audit-remediation-plan.md`
> **Sumber:** `audit/00-REPORT.md`
> **Bukti rilis B:** Commit `f701816`, fix test `22e7612`, push `origin/main`,
> Supabase production `qhtfixgbcpcitokeryxb` applied, Vercel production Ready,
> GitHub Actions run `31266493103` success; browser/UAT reassign-owner
> dilindungi E2E lokal `manager can reassign client owner and see ownership
audit after reload`.

## Task 0 — Setujui kontrak bisnis dan security

**Description:** Mengunci keputusan yang menentukan schema, history, dan CI
sebelum implementasi dimulai.

**Acceptance criteria:**

- [x] Soft-deleted/superseded/terminal commercial document tidak ikut transfer
      aktif tetapi tetap menjadi historical reference.
- [x] Event baru bernama `client_owner_change`; activity row lama tidak diubah.
- [x] Dependency Critical/High memblokir CI kecuali exception punya owner dan
      expiry.

**Verification:**

- [x] Keputusan user dicatat di plan sebelum migration dibuat.

**Dependencies:** None

**Files likely touched:** `tasks/audit-remediation-plan.md`, decision log proyek

**Estimated scope:** XS

---

## Task A1 — Kembalikan formatter ke kondisi hijau

**Description:** Menutup SEV-12 tanpa perubahan perilaku.

**Acceptance criteria:**

- [x] `DateRangePicker.tsx` sesuai Prettier.
- [x] Tidak ada perubahan copy atau behavior date range.

**Verification:**

- [x] `bun run lint` — exit 0 (15 warning tersisa, 0 error).
- [x] `bun run typecheck` — exit 0.

**Dependencies:** Task 0

**Files likely touched:** `src/components/dashboard/DateRangePicker.tsx`

**Estimated scope:** XS

---

## Task A2 — Buat document-numbering test re-entrant

**Description:** Menutup SEV-06 dengan fixture dan teardown yang aman diulang.

**Acceptance criteria:**

- [x] Semua document/task/activity/counter fixture dibersihkan deterministik.
- [x] Cleanup tetap mencoba resource lain bila satu langkah gagal.
- [x] Dua run berturut-turut tidak menghasilkan nomor duplicate atau Auth 500.

**Verification:**

- [x] `bun --env-file=.env.local test supabase/tests/document-numbering.test.ts`
      dijalankan dua kali berturut-turut dan keduanya exit 0.
- [x] `bun run test` dijalankan dua kali pada DB lokal yang sama: masing-masing
      585 pass, 0 fail.

**Dependencies:** Task A1

**Files likely touched:** `supabase/tests/document-numbering.test.ts`,
`supabase/tests/helpers.ts` bila helper cleanup memang dibutuhkan

**Estimated scope:** S

---

## Task A3 — Bersihkan identifier mati dan aktifkan lint rule

**Description:** Menutup SEV-11 tanpa mengubah runtime behavior.

**Acceptance criteria:**

- [x] Delapan identifier yang terdeteksi benar-benar dihapus atau dipakai.
- [x] `@typescript-eslint/no-unused-vars` aktif dengan ignore pattern eksplisit.
- [x] Tidak ada blanket disable baru.

**Verification:**

- [x] `bunx tsc --noEmit --noUnusedLocals --noUnusedParameters` — exit 0.
- [x] `bun run lint` — exit 0.
- [x] `bun run typecheck` — exit 0.

**Dependencies:** Task A2

**Files likely touched:** `eslint.config.js`, file production/test yang disebut
oleh output compiler; pecah menjadi dua commit bila lebih dari lima file

**Estimated scope:** M

---

## Checkpoint A — Baseline Tepercaya

- [x] Fresh local Supabase reset sukses dengan CLI v2.109.1.
- [x] `bun run lint` exit 0.
- [x] `bun run typecheck` exit 0.
- [x] `bun run test` exit 0 dua kali berturut-turut (585/585 per run).
- [x] `bun run build` exit 0.

---

## Task B1 — Tambahkan kontrak event owner change

**Description:** Membuat event ownership yang berbeda dari status change,
forward-only, dengan payload terstruktur dan validasi database.

**Acceptance criteria:**

- [x] Migration baru menambah `client_owner_change` ke `activity_kind`.
- [x] Constraint `event_data` menerima schema versioned owner-change payload
      tanpa melemahkan validasi stage-change.
- [x] Activity feed/view memetakan kind baru ke kategori dan label yang benar.
- [x] Row historis tidak di-update atau di-delete.

**Verification:**

- [x] Fresh `bunx supabase@2.109.1 db reset --local` sukses.
- [x] Focused ownership activity/feed/status parser tests lolos untuk event baru
      dan compatibility row legacy tanpa mutasi historis.

**Dependencies:** Checkpoint A, Task 0

**Files likely touched:** migration baru, `supabase/tests/activity-log.test.ts`,
migration/view definition baru bila view harus didefinisikan ulang

**Estimated scope:** M

---

## Task B2 — Atomikkan reassign Client dan audit insert

**Description:** Menutup SEV-01 dengan satu transaksi database untuk update owner
dan audit event.

**Acceptance criteria:**

- [x] RPC memverifikasi active manager/super-admin dan target owner valid.
- [x] Update owner dan insert `client_owner_change` terjadi dalam satu transaksi.
- [x] Actor berasal dari `auth.uid()`; old/new owner dan note tersimpan terstruktur.
- [x] Forced audit failure membatalkan perubahan owner.

**Verification:**

- [x] Focused positive/negative RPC tests lolos.
- [x] Null/inactive/unauthorized role tests memastikan ownership tidak berubah.
- [x] Forced-failure rollback test membuktikan zero partial write.

**Dependencies:** Task B1

**Files likely touched:** migration baru, test RPC ownership terkait

**Estimated scope:** M

---

## Task B3 — Pindahkan UI ke adapter dan benarkan audit reader

**Description:** Menutup SEV-09 dan menghilangkan direct RPC/audit insert dari
route Client Detail.

**Acceptance criteria:**

- [x] Route memanggil satu typed data adapter untuk reassign.
- [x] `ActivityKind` dan label mendukung `client_owner_change`.
- [x] Status Audit Trail hanya merender nilai `ClientStatus` valid.
- [x] Legacy reassign tetap terlihat sebagai ownership event tanpa memutasi row.

**Verification:**

- [x] Unit test parser untuk status asli, owner-change baru, dan legacy reassign.
- [x] Browser local: reassign tampil sebagai owner change, bukan status badge.
- [x] Reload membuktikan owner dan event persist.
- [x] CI Browser E2E umum pass pada GitHub Actions run `31266493103`.

**Dependencies:** Task B2

**Files likely touched:** `src/lib/data/clients.ts`,
`src/lib/data/activity-log.ts`, `src/routes/_app.clients.$clientId.tsx`,
`src/components/clients/StatusAuditTrail.tsx`, focused tests

**Estimated scope:** M

---

## Checkpoint B — Ownership Audit Integrity

- [x] All focused activity/RPC/RLS tests pass.
- [x] Owner tidak berubah ketika audit insert dipaksa gagal.
- [x] Activity feed dan Status Audit Trail menampilkan domain yang benar.
- [x] `bun run test:e2e` pass via CI Browser E2E flows pada run
      `31266493103`.
- [x] Browser/UAT spesifik reassign-owner: owner change tampil benar dan tetap
      persist setelah reload.

---

## Task C1 — Karakterisasi dua kontrak lifecycle

**Description:** Mengunci perilaku yang benar sebelum mengubah function
lifecycle.

**Acceptance criteria:**

- [x] Test membedakan active transferable ownership dari historical references.
- [x] Soft-deleted, superseded, terminal, active, dan audit-linked fixtures ada.
- [x] Expected count/transfer/delete result eksplisit per fixture.

**Verification:**

- [x] Focused `supabase/tests/account-lifecycle.test.ts` menunjukkan baseline
      lama pada kasus yang memang drift dan tetap melindungi historical delete.

**Dependencies:** Checkpoint B, Task 0

**Files likely touched:** `supabase/tests/account-lifecycle.test.ts`

**Estimated scope:** S

---

## Task C2 — Terapkan predicate active ownership secara terpisah

**Description:** Menutup SEV-04 tanpa melemahkan historical delete blocker.

**Acceptance criteria:**

- [x] Helper/predicate active commercial ownership didefinisikan satu kali.
- [x] Summary dan transfer memakai predicate aktif yang sama.
- [x] `account_reference_counts`/`delete_eligible_account` tetap menghitung
      seluruh history.
- [x] Tidak ada soft-deleted/superseded/terminal row yang di-reassign.

**Verification:**

- [x] Fresh DB reset dan focused lifecycle suite pass.
- [x] Transfer count sama dengan row yang benar-benar berubah.
- [x] Permanent delete tetap gagal jika hanya historical reference yang tersisa.

**Dependencies:** Task C1

**Files likely touched:** migration baru, focused lifecycle tests

**Estimated scope:** M

---

## Task C3 — Selaraskan label summary dan blocker UI

**Description:** Mencegah angka workload aktif dibaca sebagai total history atau
delete eligibility.

**Acceptance criteria:**

- [x] UI membedakan “ownership aktif” dan “referensi historis”.
- [x] Dialog transfer/delete menampilkan angka sesuai RPC yang menjadi gate.
- [x] Tidak ada angka summary yang dipakai untuk menyimpulkan delete eligibility.

**Verification:**

- [x] Component/data tests untuk active count dan blocking reference count.
- [x] Manual browser check untuk akun dengan active + historical fixtures.

**Dependencies:** Task C2

**Files likely touched:** `src/lib/data/team.ts`, Settings/Team components,
focused tests

**Estimated scope:** M

---

## Checkpoint C — Account Lifecycle

- [x] Account lifecycle full suite pass.
- [x] `supabase db lint --local` dan advisors diperiksa.
- [x] Active transfer benar; permanent delete tetap fail-closed.

---

## Task D1 — Triage dan remediasi dependency advisory

**Description:** Menutup SEV-02 berdasarkan reachability, bukan sekadar menaikkan
semua versi sekaligus.

**Acceptance criteria:**

- [x] Setiap advisory punya parent dependency, runtime/build reachability, dan
      keputusan upgrade/exception — lihat
      `docs/reports/2026-08-09-dependency-advisory-triage.md`.
- [x] Critical/High diselesaikan atau memiliki exception bertanggal —
      `brace-expansion` tersisa sebagai exception Project Owner sampai
      2026-09-09 karena dua major line tidak aman dipaksa lewat override global.
- [x] PDF/CSV/XLSX export dan production build tetap berfungsi — focused
      export tests, browser CSV download smoke, dan production build pass.

**Verification:**

- [x] `bun audit --json` — exit 1 hanya untuk accepted `brace-expansion`
      exception; audit output sekarang 7 advisory / 1 paket unik.
- [x] `bun run typecheck && bun run test && bun run build` — typecheck pass,
      full test suite 598 pass, build pass.
- [x] Focused export tests dan browser download smoke — focused export/data
      tests 26 pass; `bun run test:e2e` 9 pass.

**Dependencies:** Checkpoint A

**Files likely touched:** `package.json`, `bun.lock`, dependency risk report/test

**Estimated scope:** M

---

## Task D2 — Jadikan dependency risk sebagai CI gate

**Description:** Menutup SEV-03 setelah advisory baseline ditangani.

**Acceptance criteria:**

- [ ] Script membaca exit/result dan menerapkan threshold policy.
- [ ] Critical/High tanpa exception menghasilkan exit non-zero.
- [ ] Artifact report selalu dibuat/upload, termasuk ketika gate gagal.
- [ ] Exception expired otomatis dianggap gagal.

**Verification:**

- [ ] Unit test fixture: clean exit 0, High exit non-zero, expired exception exit
      non-zero.
- [ ] Local workflow/script smoke pass.

**Dependencies:** Task D1

**Files likely touched:** `scripts/dependency-risk-report.ts`, focused test,
`.github/workflows/ci.yml` bila behavior upload perlu disesuaikan

**Estimated scope:** M

---

## Task E1 — Persempit compatibility contract CommercialItem

**Description:** Menutup SEV-10 dengan membuat TypeScript hanya menawarkan field
yang benar-benar didukung runtime.

**Acceptance criteria:**

- [ ] Unsupported fields tidak ada dalam public patch input.
- [ ] Caller menggunakan API document/task yang menjadi source of truth.
- [ ] Transitional facade diberi deprecation/contract note yang akurat.

**Verification:**

- [ ] Focused commercial-items tests pass.
- [ ] `bun run typecheck` membuktikan caller tidak memakai field legacy.
- [ ] Pipeline next follow-up behavior tetap sama.

**Dependencies:** Checkpoint C

**Files likely touched:** `src/lib/data/commercial-items.ts`, caller terkait,
focused test

**Estimated scope:** M

---

## Task E2 — Hapus cache key Client yang mati

**Description:** Menutup SEV-07 dengan menghapus kontrak cache palsu atau
mengganti dengan updater paginated yang benar bila UX membutuhkannya.

**Acceptance criteria:**

- [ ] Tidak ada write exact ke key tanpa consumer.
- [ ] Add Client muncul benar setelah create dan setelah reload.
- [ ] Query-key factory digunakan untuk cache paginated.

**Verification:**

- [ ] Focused query-cache test menggunakan key production yang nyata.
- [ ] Browser create Client + reload pass.

**Dependencies:** Checkpoint A

**Files likely touched:** `src/components/clients/AddClientDialog.tsx`,
`src/lib/query-cache-updates.test.ts`, query-key helper bila diperlukan

**Estimated scope:** S

---

## Task E3 — Bersihkan warning PL/pgSQL tanpa edit history

**Description:** Menutup SEV-08 melalui function redefinition dalam migration
baru, atau menandai sebagai resolved bila Task B/C sudah menghapus variabelnya.

**Acceptance criteria:**

- [ ] Tidak mengedit migration lama.
- [ ] `v_old_owner_id`, `v_new_owner_name`, dan `v_so_linked` tidak lagi unused.
- [ ] Semantik function tidak berubah kecuali yang disetujui Task B/C.

**Verification:**

- [ ] Fresh DB reset.
- [ ] `supabase db lint --local --level warning --fail-on none` tidak lagi
      melaporkan tiga unused variable tersebut.

**Dependencies:** Tasks B2, C2

**Files likely touched:** migration baru atau migration B/C yang belum dirilis,
focused DB tests

**Estimated scope:** S

---

## Task F1 — Bekukan perilaku TasksInboxPage

**Description:** Menyiapkan safety net sebelum menutup SEV-05.

**Acceptance criteria:**

- [ ] Pure tests mencakup filter, grouping, sort, dan view-specific selection.
- [ ] Exact query keys dan invalidation prefixes dicatat dalam tests.
- [ ] E2E smoke tersedia untuk Table, Kanban, dan Calendar.

**Verification:**

- [ ] Focused Task tests dan tiga E2E mode pass sebelum ekstraksi.

**Dependencies:** Checkpoint A

**Files likely touched:** focused Task selector/component/E2E tests

**Estimated scope:** M

---

## Task F2 — Ekstrak pure controller dan data actions

**Description:** Memisahkan state/filter/selectors serta query/mutation actions
dari route tanpa mengubah contract.

**Acceptance criteria:**

- [ ] Pure transform tidak berada di component route.
- [ ] Query keys dan mutation side effects tetap identik.
- [ ] Tidak ada perubahan UI/copy/role behavior.

**Verification:**

- [ ] Focused tests dari Task F1 tetap hijau.
- [ ] `bun run lint && bun run typecheck && bun run build`.

**Dependencies:** Task F1

**Files likely touched:** `_app.tasks.tsx`, module selector/controller baru,
hook/actions baru, focused tests

**Estimated scope:** M

---

## Task F3 — Ekstrak Table, Kanban, dan Calendar secara serial

**Description:** Menyelesaikan SEV-05 dengan satu view per commit/checkpoint.

**Acceptance criteria:**

- [ ] Table, Kanban, dan Calendar menjadi component terpisah dengan props typed.
- [ ] Setiap ekstraksi diverifikasi sebelum lanjut ke view berikutnya.
- [ ] Route menjadi orchestrator, bukan pemilik seluruh render/action logic.

**Verification:**

- [ ] Focused tests dan E2E mode pass setelah setiap ekstraksi.
- [ ] Full `bun run test`, lint, typecheck, build, dan E2E pass pada akhir task.

**Dependencies:** Task F2

**Files likely touched:** `_app.tasks.tsx`, component Task view terpisah, tests

**Estimated scope:** M per view; tiga commit terpisah

---

## Program Completion

- [ ] Semua SEV diberi status `RESOLVED`, `ACCEPTED`, atau `DEFERRED` dengan
      bukti.
- [ ] Full test pass dua kali berurutan.
- [ ] Lint, typecheck, build, DB lint/advisors, dan E2E pass.
- [ ] Local verification report direview user.
- [ ] Approval exact-target diperoleh sebelum migration production.
- [ ] Approval commit/branch diperoleh sebelum push `main`/deploy.
- [ ] Supabase remote, Vercel deploy, dan browser production UAT dilaporkan
      sebagai status terpisah.
