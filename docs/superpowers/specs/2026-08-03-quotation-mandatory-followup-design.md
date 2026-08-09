# Spesifikasi Teknis: Follow-up Wajib saat Membuat Quotation

> **Status: APPROVED oleh Product Owner — 2026-08-03.**
> Kedua Open Question di §7 dijawab: (1) tidak ada batas minimum Tanggal
> Follow-up, (2) Task lama saat revisi dibiarkan terbuka begitu saja.
> Lanjut ke `planning-and-task-breakdown` / `tasks/plan.md`.

**Sumber:** `docs/intent/quotation-mandatory-followup.md` (ditangkap via
skill `interview-me`, 2026-08-03, dikonfirmasi user dengan "yes").

## 1. Latar Belakang

Saat mendiagnosis kenapa Dashboard "Activity Compliance" selalu 0%
(root cause pertama: `clients.next_fu` tidak pernah ditulis oleh app sejak
Sales Task Control Loop — sudah diperbaiki via
`supabase/migrations/20260803120000_sync_client_next_fu_from_tasks.sql`,
yang membuat `clients.next_fu` = tanggal `next_action_date` TERDEKAT di
antara Task aktif milik client), ditemukan root cause kedua: di production
tidak ada satupun Task yang berstatus aktif (`In Progress`/
`Waiting External`) dengan `next_action_date` terisi. Semua Task yang
pernah diprogress langsung dibawa ke `Done`.

User mengidentifikasi sumbernya: **membuat Quotation hari ini tidak pernah
memaksa sales menentukan langkah selanjutnya** — sales submit Quotation
lalu selesai, tanpa jejak "next follow-up terjadwal" apapun. Spec ini
menutup gap tersebut khusus di titik pembuatan/revisi Quotation.

## 2. Current State (ringkas)

- **UI:** `CreateQuotationDialog` dan `ReviseQuotationDialog`, keduanya di
  [`src/components/clients/CreateRecordDialogs.tsx`](../../../src/components/clients/CreateRecordDialogs.tsx)
  (baris 111 dan 243). Field saat ini: Date, Stage (create only), Note,
  Line Items. Tidak ada field follow-up.
- **Validasi form:** `quotationSchema` di
  [`src/components/clients/commercial-form-schemas.ts`](../../../src/components/clients/commercial-form-schemas.ts)
  (baris 33-45).
- **Data layer:** `createQuotation()`/`reviseQuotation()` di
  [`src/lib/data/commercial-documents.ts`](../../../src/lib/data/commercial-documents.ts)
  (baris 221, 245) — masing-masing memanggil RPC atomik `create_quotation`/
  `revise_quotation` (bukan multi-step client-side write, sesuai aturan
  Phase 11 "satu submission = satu transaksi atomik").
- **RPC saat ini** (definisi terbaru:
  `supabase/migrations/20260728091500_fix_null_role_fail_open_gates.sql`,
  baris 145 dan 294): masing-masing insert 1 baris
  `commercial_documents` + N baris `commercial_document_items` + 1 baris
  `activity_log`, dalam satu transaksi `security definer`.
- **Satu-satunya pemanggil RPC ini dari UI**: kedua dialog di atas (dicek
  via grep — `CommercialDetailPage.tsx` hanya me-render ulang
  `ReviseQuotationDialog` yang sama). Sheet importer (Phase 11) memakai
  jalur normalized-import terpisah, TIDAK memanggil `create_quotation`/
  `revise_quotation` — jadi tidak terdampak oleh spec ini.
- **Tabel `tasks`** sudah punya semua kolom yang dibutuhkan sejak Sales
  Task Control Loop (`next_action`, `next_action_date`, `workflow_status`,
  `category`, `commercial_document_id`, `client_id`, `owner_id`, `method`,
  `due_date`) — **tidak perlu migration skema baru**, hanya perlu mengisi
  kolom-kolom ini dari RPC.

## 3. Target Behavior

### 3.1 Form (UI)

Dua field baru, **wajib diisi**, ditambahkan ke `CreateQuotationDialog`
dan `ReviseQuotationDialog`:

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| Next Action | teks bebas | ya | mis. "Telepon PIC untuk konfirmasi harga" |
| Tanggal Follow-up | date | ya | tanggal next follow-up dijadwalkan |

Tidak ada field Metode — default `'Phone'` diisi otomatis oleh RPC, tidak
ditanya di form (sudah disepakati saat interview).

Detail visual (layout, penempatan, komponen) mengikuti skill **bencium**
frontend design saat fase implementasi — di luar cakupan spec ini.

### 3.2 Validasi

- Wajib diisi di **kedua level**: zod schema (frontend, untuk UX cepat)
  DAN di dalam RPC `create_quotation`/`revise_quotation` (backend,
  defense-in-depth) — konsisten dengan pola validasi lain yang sudah ada
  di RPC ini (`DOCUMENT_DATE_REQUIRED`, `DOCUMENT_STAGE_REQUIRED`).
  Kode error RPC baru: `NEXT_ACTION_REQUIRED`,
  `NEXT_ACTION_DATE_REQUIRED`.
- **(Open Question 1)** Apakah Tanggal Follow-up boleh diisi tanggal yang
  sudah lewat / harus `>= document_date` / harus `>= hari ini`? Belum
  dibahas saat interview. Default yang diusulkan: **tidak ada batas
  minimum** (sama seperti `next_action_date` di `record_task_progress`
  yang juga tidak membatasi) — supaya konsisten dengan RPC lain dan tidak
  menambah aturan baru yang belum diminta.

### 3.3 Perubahan RPC

Signature `create_quotation` dan `revise_quotation` bertambah 2 parameter
wajib:

```sql
p_next_action text,
p_next_action_date date,
```

Setelah `commercial_documents`/`commercial_document_items`/`activity_log`
diinsert (logika existing tidak berubah), RPC insert satu baris `tasks`
baru:

| Kolom `tasks` | Nilai |
|---|---|
| `client_id` | `p_client_id` (create) / `v_current.client_id` (revise) |
| `owner_id` | `v_owner_id` (create) / `v_current.owner_id` (revise) — pemilik client, bukan selalu `v_actor_id`, sama seperti pola `activity_log` yang sudah ada di RPC ini |
| `commercial_document_id` | `v_document_id` (Quotation yang baru dibuat/direvisi) |
| `title` | `format('Follow-up: %s', v_number)` |
| `due_date` | `p_next_action_date` |
| `method` | `'Phone'` (default tetap) |
| `category` | `'Quotation'` |
| `workflow_status` | `'Open'` |
| `next_action` | `p_next_action` |
| `next_action_date` | `p_next_action_date` |

Task yang baru dibuat ini otomatis memicu trigger
`tasks_sync_client_next_fu` yang sudah terpasang di production, sehingga
`clients.next_fu` (dan Activity Compliance) langsung ter-update tanpa
perubahan tambahan.

### 3.4 Revisi Quotation

Berlaku sama persis seperti pembuatan baru (disepakati saat interview:
"revisi = submit baru juga secara alur") — `reviseQuotation` juga wajib
mengisi Next Action + Tanggal, dan RPC `revise_quotation` insert Task baru
dengan `commercial_document_id` menunjuk ke Quotation hasil revisi
(`v_document_id`, bukan `v_current.id`).

**(Open Question 2)** Task lama (jika ada) yang masih terbuka dari
Quotation sebelum direvisi — dibiarkan begitu saja (tidak otomatis
ditutup/diarsip oleh spec ini)? Default yang diusulkan: **ya, dibiarkan**
— menutup Task lama adalah keputusan sales (lewat Task drawer seperti
biasa), bukan sesuatu yang harus terjadi otomatis di balik layar.

## 4. Dampak ke Test yang Sudah Ada

RPC `create_quotation`/`revise_quotation` dipanggil langsung (bukan lewat
UI) di:

- `src/lib/data/commercial-documents.test.ts`
- `supabase/tests/null-role-rpc-gates.test.ts`
- `supabase/tests/document-numbering.test.ts`

Semua pemanggilan ini akan gagal begitu parameter baru menjadi wajib.
Task implementasi harus meng-update seluruh call site test ini untuk
menyertakan `p_next_action`/`p_next_action_date` (dan `nextAction`/
`nextActionDate` di sisi `CreateQuotationInput`/`ReviseQuotationInput`
TypeScript).

## 5. Out of Scope

(dipindah dari intent, tidak berubah)

- Form Customer PO dan Sales Order **tidak** disentuh.
- Quotation-quotation lama yang sudah ada **tidak** di-backfill dan
  **tidak** diminta melengkapi follow-up retroaktif.

## 6. Success Criteria

- Tidak mungkin submit Quotation baru maupun revisi tanpa mengisi Next
  Action + Tanggal Follow-up, baik lewat UI maupun panggilan RPC langsung.
- Setiap Quotation baru/revisi baru menghasilkan tepat satu Task baru
  dengan `next_action_date` terisi, terhubung ke `commercial_document_id`
  yang benar.
- `bun run test` hijau (termasuk test yang di-update di §4).
- Verifikasi manual: buat 1 Quotation baru di local dev, cek
  `clients.next_fu` client tsb ikut terisi otomatis (trigger existing).

## 7. Open Questions (perlu dijawab sebelum lanjut ke Plan)

1. Batas minimum Tanggal Follow-up (§3.2) — pakai default "tidak ada
   batas", atau mau ditambah aturan (mis. tidak boleh tanggal lampau)?
2. Task lama saat revisi (§3.4) — dibiarkan terbuka begitu saja, atau ada
   perlakuan lain yang diinginkan?
