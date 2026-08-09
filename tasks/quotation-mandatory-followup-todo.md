# Task List: Follow-up Wajib saat Membuat Quotation

Spec: `docs/superpowers/specs/2026-08-03-quotation-mandatory-followup-design.md`
(APPROVED 2026-08-03). Intent: `docs/intent/quotation-mandatory-followup.md`.

> **Status:** Approved, belum diimplementasi. Checking a task means its
> acceptance criteria dan verification sudah lulus di local dev. Checklist
> ini tidak mengotorisasi apply migration ke Supabase remote/production —
> itu tetap perlu konfirmasi eksplisit terpisah per checkpoint di bawah,
> sama seperti migration `next_fu` sebelumnya.

## Dependency order

```
Task 1 (RPC + migration)
   │
   ▼
Task 2 (data layer types/functions)
   │
   ├──▶ Task 3 (schema + Create Quotation UI)
   │        │
   │        ▼
   └──▶ Task 4 (Revise Quotation UI, pakai schema dari Task 3)
            │
            ▼
        Task 5 (verifikasi & test tambahan)
```

## Tasks

- [x] **Task 1: RPC `create_quotation`/`revise_quotation` + migration**
  - Acceptance:
    - Kedua RPC bertambah param wajib `p_next_action text`,
      `p_next_action_date date`; raise `NEXT_ACTION_REQUIRED`/
      `NEXT_ACTION_DATE_REQUIRED` kalau null/kosong (spec §3.2-3.3).
    - Setelah document dibuat, RPC insert 1 baris `tasks` sesuai tabel
      mapping di spec §3.3 (title, due_date, method='Phone',
      category='Quotation', workflow_status='Open', next_action,
      next_action_date, commercial_document_id, client_id, owner_id).
    - `revise_quotation` TIDAK menyentuh Task lama dari Quotation
      sebelumnya (spec §3.4, Open Question 2 — dibiarkan terbuka).
    - Tidak ada batas minimum untuk `p_next_action_date` (Open Question 1).
  - Verify:
    - `bunx supabase db reset` sukses tanpa error.
    - Manual via `docker exec ... psql`: panggil RPC tanpa
      `p_next_action`/`p_next_action_date` → error yang benar; panggil
      dengan keduanya terisi → satu baris `tasks` baru muncul dengan field
      yang sesuai, dan (karena trigger `tasks_sync_client_next_fu` sudah
      ada) `clients.next_fu` client tsb ikut ter-update.
  - Dependencies: None (fondasi).
  - Files: 1 migration baru di `supabase/migrations/`.
  - Size: S.

- [x] **Task 2: Update data layer TypeScript (`commercial-documents.ts`)**
  - Acceptance:
    - `CreateQuotationInput`/`ReviseQuotationInput` bertambah field wajib
      `nextAction: string`, `nextActionDate: string`.
    - `createQuotation()`/`reviseQuotation()` mengirim
      `p_next_action`/`p_next_action_date` ke RPC.
  - Verify:
    - `bun run test src/lib/data/commercial-documents.test.ts` — update
      test existing call site untuk menyertakan field baru, semua pass.
    - `tsc`/`bun run build` tidak error (type-check).
  - Dependencies: Task 1.
  - Files: `src/lib/data/commercial-documents.ts`,
    `src/lib/data/commercial-documents.test.ts`.
  - Size: S.

- [x] **Task 3: Field baru di `CreateQuotationDialog` + schema**
  - Acceptance:
    - `quotationSchema` bertambah `nextAction` (string, required, trimmed)
      dan `nextActionDate` (string, required, format date) di
      `commercial-form-schemas.ts`.
    - `CreateQuotationDialog` menampilkan 2 field baru (Next Action,
      Tanggal Follow-up), wajib diisi, tidak bisa submit tanpa keduanya.
      Desain/tata-letak field mengikuti skill `bencium` frontend design
      (load skill saat mengerjakan task ini, konsisten dengan komponen
      shadcn/ui yang sudah dipakai di dialog ini).
    - Tidak ada field Metode ditambahkan (sesuai spec).
  - Verify:
    - Manual di browser lokal (`bun run dev`): buat Quotation baru tanpa
      isi Next Action/Tanggal → submit diblokir dengan pesan error yang
      jelas; isi keduanya → Quotation tersimpan, toast sukses muncul.
    - `bun run lint` bersih untuk file yang diubah.
  - Dependencies: Task 2.
  - Files: `src/components/clients/commercial-form-schemas.ts`,
    `src/components/clients/CreateRecordDialogs.tsx`.
  - Size: M.

- [x] **Task 4: Field baru di `ReviseQuotationDialog`**
  - Acceptance:
    - `ReviseQuotationDialog` pakai schema yang sama (dari Task 3),
      field Next Action + Tanggal Follow-up wajib diisi juga saat revisi.
    - Task baru yang dibuat oleh `revise_quotation` terhubung ke
      `commercial_document_id` hasil revisi (bukan dokumen lama).
  - Verify:
    - Manual di browser lokal: buka Quotation existing, buat revisi tanpa
      isi field baru → diblokir; isi lengkap → revisi tersimpan, Task baru
      muncul di Task list milik client tsb.
  - Dependencies: Task 3 (schema sudah ada).
  - Files: `src/components/clients/CreateRecordDialogs.tsx`.
  - Size: S.

- [x] **Task 5: Update test RPC langsung + verifikasi akhir**
  - Acceptance:
    - Semua call site RPC langsung (bukan lewat UI) di
      `supabase/tests/null-role-rpc-gates.test.ts` dan
      `supabase/tests/document-numbering.test.ts` di-update menyertakan
      `p_next_action`/`p_next_action_date`.
    - (Opsional tapi direkomendasikan) tambah 1 test baru yang membuktikan:
      buat Quotation → Task baru muncul dengan `next_action_date` benar →
      `clients.next_fu` client tsb ter-update sesuai trigger existing.
  - Verify:
    - `bun run test` full suite hijau (kecuali flaky
      `task-exceptions-rls.test.ts` pre-existing yang sudah diketahui
      tidak terkait — lihat catatan di riwayat sesi ini).
    - `bun run build` sukses.
  - Dependencies: Task 1-4.
  - Files: `supabase/tests/null-role-rpc-gates.test.ts`,
    `supabase/tests/document-numbering.test.ts`, test baru (opsional).
  - Size: S.

## Checkpoint: Sebelum apply ke production

- [x] Semua Task 1-5 checked, `bun run test` (479/480 pass — 1 fail adalah
      `task-exceptions-rls.test.ts`, flaky pre-existing yang sudah
      dikonfirmasi tidak terkait perubahan ini) dan `bun run build` hijau
      di local dev.
- [x] Demo manual end-to-end di local dev (browser, role Sales Manager):
      buat Quotation baru → Task baru muncul dengan next_action_date benar
      → `clients.next_fu` client tsb ter-update → Activity Compliance card
      naik dari 0% ke 1%.
- [x] Konfirmasi eksplisit dari user diterima 2026-08-03 — migration
      diterapkan ke Supabase remote (`qhtfixgbcpcitokeryxb`) dan kode
      di-push ke `main` (commit `825cc46`, `86236f9`), Vercel auto-deploy
      berjalan.

## Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| RPC dipanggil langsung dari tempat lain yang belum diaudit | Bisa gagal diam-diam kalau ada pemanggil tak terduga | Sudah digrep tuntas (spec §2) — hanya 2 dialog UI + 3 file test, semua tercakup di Task 1-5 |
| Sales menganggap 2 field baru mengganggu kecepatan input Quotation | Adopsi rendah / keluhan UX | Di luar scope spec ini untuk diselesaikan sekarang; pantau setelah rilis, bisa jadi follow-up terpisah |
