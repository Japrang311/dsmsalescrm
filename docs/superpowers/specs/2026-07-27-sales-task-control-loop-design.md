# Spesifikasi Teknis: Sales Task Control Loop

> **Status: APPROVED oleh Product Owner — 2026-07-27**
>
> Product Owner menyetujui spesifikasi ini secara eksplisit ("setuju
> lanjutkan") pada 2026-07-27, setelah ketujuh keputusan Planning Boundary di
> §9 dijawab satu per satu. Ini menuntaskan Task 46 / implementation-plan
> Task 1.
>
> **Persetujuan ini TIDAK mengotorisasi implementasi.** Dokumen ini tetap
> **tidak** mengotorisasi migration, RPC, Edge Function, perubahan source
> code, perubahan `.env.local`, commit, push, atau deployment. Sesuai STOP
> RULE sesi Task 46, Task 47 / implementation-plan Task 2 memerlukan
> otorisasi eksplisit terpisah dari Product Owner sebelum dimulai — lihat
> penutup laporan sesi persetujuan untuk permintaan otorisasi tersebut.

**Sumber arah produk (final, tidak dapat diubah sepihak oleh spec ini):**

- `docs/ideas/sales-task-control-loop.md`
- `docs/ideas/sales-task-control-loop-claude-handoff.md`
- `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`
- `docs/superpowers/plans/2026-07-27-sales-task-control-loop-implementation.md`
- `tasks/sales-task-control-loop-todo.md`

---

## 1. Current-State Audit

### 1.1 Schema saat ini

**`public.tasks`** (`supabase/migrations/20260717232459_tasks.sql`,
`20260718030000_tasks_archived.sql`):

| Kolom                    | Tipe                 | Wajib                    | Catatan                                                                                             |
| ------------------------ | -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| `id`                     | uuid                 | ya                       | PK                                                                                                  |
| `client_id`              | uuid → `clients.id`  | **ya (`not null`)**      | konflik langsung dengan "Client opsional"                                                           |
| `owner_id`               | uuid → `profiles.id` | ya                       | ditegakkan aktif Sales/Manager oleh trigger (§1.3)                                                  |
| `commercial_item_id`     | uuid                 | tidak                    | legacy, tanpa FK aktif (menunjuk snapshot historis beku)                                            |
| `commercial_document_id` | uuid                 | tidak                    | kolom aktif saat ini untuk relasi Quotation/SO (ditambahkan migrasi lanjutan, di luar 4 file wajib) |
| `title`                  | text                 | ya                       |                                                                                                     |
| `due_date`               | date                 | ya                       |                                                                                                     |
| `method`                 | enum `task_method`   | ya                       | Phone/Email/Visit/WhatsApp/Meeting                                                                  |
| `status`                 | enum `task_status`   | ya, default `'Upcoming'` | **`'Today', 'Overdue', 'Upcoming', 'Done'`** — mencampur workflow dan due state                     |
| `priority`               | enum `task_priority` | ya                       | High/Normal/Low                                                                                     |
| `archived`               | boolean              | ya, default `false`      | terpisah dari `status` (migrasi `20260718030000`)                                                   |
| `created_at`             | timestamptz          | ya                       |                                                                                                     |

Tidak ada kolom `category`, `next_action`, `next_action_date`,
`cancellation_reason`, atau catatan progress terstruktur pada `tasks`.

**`public.follow_up_logs`** (`20260718040000_follow_up_logs.sql`):
`task_id` (nullable FK), `client_id` **wajib**, `commercial_item_id` (legacy),
`commercial_document_id` (kolom lanjutan aktif), `owner_id` wajib, `fu_date`,
`method`, `result` (enum `follow_up_result` — 9 nilai gaya funnel lama seperti
`'Waiting PO'`, `'PO Confirmed'`, bukan kategori Task), `next_action` (text
bebas, nullable), `next_fu_date` (nullable), `customer_status`,
`potential_value`, `notes` (nullable), `created_at`. **Insert-only** —
tidak ada UPDATE/DELETE policy.

**`public.activity_log`** (`20260718011409_activity_log.sql` + kolom
tambahan lanjutan `target_profile_id`, `target_profile_snapshot`,
`administrative_reason` dari migrasi Phase 12): `kind` (enum `activity_kind`,
sudah diperluas ke 22 nilai termasuk task/commercial/SO/lifecycle events),
`owner_id`, `actor_id` wajib, relasi opsional ke `client_id`/`task_id`/
`commercial_item_id`/`commercial_document_id`/`sales_order_id`, `title`,
`detail` (text bebas), `created_at`. **Insert-only**, immutable by design.

### 1.2 Grants (per `20260718164503_apply_super_admin_rls_matrix.sql`)

- `authenticated` mendapat `select, insert` penuh pada `tasks`, plus
  `update` **hanya** pada kolom
  `client_id, commercial_item_id, title, due_date, method, status, priority, archived`.
  Kolom `owner_id` **tidak** ada di grant UPDATE — reassignment owner Task
  tidak mungkin lewat UPDATE langsung dari browser hari ini (harus lewat aksi
  eksplisit terpisah, sama seperti `commercial_documents`/`clients`).
- `follow_up_logs` dan `activity_log`: `select, insert` saja untuk
  `authenticated` — tidak ada `update`/`delete` untuk siapa pun kecuali
  `service_role`.
- Tidak ada DELETE grant untuk `tasks` bagi `authenticated` di migrasi mana
  pun yang diaudit.

### 1.3 RLS saat ini (empat peran, `20260718164503` + `20260718171152`)

`tasks_select`: Sales lihat milik sendiri; **Manager, Executive, Super Admin
lihat SEMUA baris** (`in ('manager', 'executive', 'super_admin')`).
`tasks_insert`/`tasks_update`: Sales hanya milik sendiri; Manager dan Super
Admin company-wide. `follow_up_logs` dan `activity_log` mengikuti pola yang
sama persis (select: 4 peran dengan Executive/Super Admin read-all; insert:
Sales own + Manager/Super Admin all).

Trigger `private.enforce_active_business_owner()`
(`20260718191135_enforce_active_business_owner_invariant.sql`) memastikan
`tasks.owner_id`, `follow_up_logs.owner_id` (dan tabel bisnis lain) selalu
menunjuk profil `account_status = 'active'` dan `role in ('sales','manager')`
— berlaku di level trigger, independen dari RLS, juga menutup jalur
`service_role`/import.

**Konfirmasi temuan handoff:** RLS saat ini **memang** memberi Executive akses
baca ke seluruh baris `tasks`/`follow_up_logs`/`activity_log`, bukan hanya
Task Manager yang tereskalasi. Ini adalah pelanggaran langsung terhadap
prinsip "Executive hanya detail read-only untuk Task Manager yang Escalated"
di one-pager, dan harus diperbaiki di Task 3/Task 10 (di luar cakupan
implementasi spec ini, tetapi wajib tercatat sebagai gap yang disetujui di
sini).

### 1.4 Data layer (`src/lib/data/`)

- **`tasks.ts`**: `TaskPatch` mengizinkan update `status` sebagai
  `TaskStatus` bebas (Today/Overdue/Upcoming/Done) — tidak ada validasi
  next-action, tidak ada pemisahan due state, tidak ada RPC atomik.
  `createTask()` default `status: "Upcoming"` yang **statis saat insert** —
  tidak pernah dihitung ulang otomatis oleh database seiring waktu berjalan.
- **`follow-ups.ts`**: `logFollowUp()` adalah satu INSERT independen ke
  `follow_up_logs`. Tidak menyentuh `tasks` atau `activity_log`.
- **`activity-log.ts`**: `logActivity()` adalah satu INSERT independen.
  `listTaskHistory()` membaca `activity_log` terfilter
  `kind in ('task_created','task_status_change')` — **tidak menyertakan
  `follow_up_logs`**, jadi riwayat di `TaskDetailDrawer` hari ini tidak
  memuat follow-up.
- **`activity-feed.ts`** (`buildActivityFeed()`): menggabungkan
  `follow_up_logs` dan `activity_log` untuk halaman Activity Log
  (`_app.activity.tsx`) dengan menyortir berdasarkan `at`/`created_at` dan
  memberi prefix id berbeda (`follow-up-…` vs `activity-…`). Ini **bukan**
  timeline per-Task — halaman terpisah dari `TaskDetailDrawer`. Tidak ada
  logika dedup peristiwa karena kedua sumber memang direpresentasikan sebagai
  jenis event yang berbeda (follow-up vs audit), bukan salinan dari event yang
  sama.

### 1.5 UI — bukti konkret multi-write non-atomik

`src/components/tasks/LogFollowUpDialog.tsx` (`onSubmit`, baris 172–233)
melakukan hingga **empat** panggilan Supabase independen secara berurutan,
tanpa transaksi:

1. `logFollowUp()` — INSERT `follow_up_logs`.
2. (opsional, jika `markDone`) `updateTask(status: "Done")` + `logActivity()`.
3. (opsional, jika `createNextTask`) `createTask()` + `logActivity()`.

Kegagalan pada langkah 2 atau 3 meninggalkan follow-up log tersimpan tanpa
efek lanjutannya — persis skenario yang harus dicegah one-pager ("satu aksi
progress harus atomik").

`src/components/tasks/TaskDetailDrawer.tsx` juga menulis progress note
lewat `logActivity({kind:"task_status_change", ...})` (`addNote()`,
baris 229–253) — **terpisah** dari `follow_up_logs`, dan sama sekali tidak
mewajibkan next action/next date meski Task masih aktif.

`src/components/tasks/CreateTaskDialog.tsx` (`schema`, baris 42–52) mewajibkan
`clientId: z.string().min(1)` — Client **wajib** di level form Zod, bukan
hanya di schema database. `statusFor()` (baris 60–65) menghitung
Today/Overdue/Upcoming dari `due_date` **hanya sekali, saat form dibuka**,
lalu nilai statis itu disimpan sebagai `status` — tidak pernah dihitung ulang
otomatis setelah itu.

### 1.6 Status derivation vs stored — bukti campur aduk

- **Dashboard/Reports membaca `task.status` yang tersimpan seolah itu due
  state hidup:** `dashboard-selectors.ts` (`taskCounts()` baris 444–449,
  `todaysFollowUps()` baris 466–486, `salesPerformance()` baris 503–513),
  `_app.reports.tsx` (baris 304, 307), `TopBar.tsx` (baris 204–256),
  `_app.tasks.tsx`, `_app.clients.$clientId.tsx` (baris 141, 492–553) semua
  memfilter langsung `t.status === "Overdue"` / `"Today"` / `"Upcoming"`.
  Karena `status` tidak pernah otomatis diperbarui oleh database seiring
  waktu (§1.4/§1.5), sebuah Task yang dibuat `Upcoming` minggu lalu dan tidak
  pernah disentuh pengguna **tidak akan pernah** menjadi `Overdue` di widget
  manapun sampai seseorang membuka dan menyimpan ulang baris itu secara
  manual. Ini adalah bug korektif nyata, bukan sekadar gap arsitektur.
- **`CreateTaskDialog.tsx`** menghitung status due-date secara lokal di
  klien saat form dibuka (`statusFor()`), memakai `Date` JS biasa (bukan
  kalender kerja) — pola yang sama juga dipakai `_app.tasks.tsx` (baris 392,
  486, 624) dan `LogFollowUpDialog.tsx`/`LogCommercialFollowUpDialog.tsx`
  (`d.setDate(d.getDate()+3)`) untuk pre-fill next-date. Semua ini adalah
  penghitungan hari kalender independen per komponen yang harus dipusatkan
  (`setDate(` ditemukan di 8+ file UI berbeda).
- **`.neq("status", "Done")`** dipakai di `team.ts` (baris 131–136, untuk
  cakupan koreksi/eligibility Team & Role) dan `_app.reports.tsx`/
  `dashboard-selectors.ts` sebagai proksi "Task aktif". Predikat ini akan
  otomatis salah kalau `Cancelled` ditambahkan sebagai status baru tanpa
  audit — Task Cancelled akan tetap terhitung "aktif" oleh predikat lama.

### 1.7 Daftar konsumen yang harus dimigrasikan (bukti file+baris)

| Area                        | File                                                                                                                                                 | Bukti                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                   | `src/lib/data/dashboard-selectors.ts`                                                                                                                | `taskCounts()`, `todaysFollowUps()`, `salesPerformance()`, `waitingPoValue()` baca `t.status` mentah                      |
| Dashboard widget            | `src/components/dashboard/TodaysFollowUpList.tsx`                                                                                                    | baris 62, `task.status === "Overdue"`                                                                                     |
| Reports                     | `src/routes/_app.reports.tsx`                                                                                                                        | baris 304–307                                                                                                             |
| TopBar                      | `src/components/shell/TopBar.tsx`                                                                                                                    | baris 204–256, notifikasi Overdue/Today                                                                                   |
| Pipeline                    | `src/routes/_app.pipeline.tsx`                                                                                                                       | baris 164 (`t.status !== "Done"`), baris 326 (`status:"Upcoming"` saat create Task dari pipeline)                         |
| Pipeline drawer             | `src/components/pipeline/PipelineCardDrawer.tsx`                                                                                                     | baris 342                                                                                                                 |
| Client Detail               | `src/routes/_app.clients.$clientId.tsx`                                                                                                              | baris 141, 492, 505, 551–553                                                                                              |
| Commercial follow-up        | `src/components/commercial/LogCommercialFollowUpDialog.tsx`                                                                                          | baris 177, 366                                                                                                            |
| Export CSV                  | `src/lib/export-csv.ts`                                                                                                                              | baris 91, kolom "Overdue"                                                                                                 |
| Export XLSX                 | `src/lib/export-xlsx.ts`                                                                                                                             | baris 158, 350                                                                                                            |
| Export PDF                  | `src/lib/export-pdf.ts`                                                                                                                              | baris 228, kolom agregat "Overdue"                                                                                        |
| Ownership/account lifecycle | `src/lib/data/team.ts`                                                                                                                               | baris 131–136, `.neq("status","Done").eq("archived", false)` sebagai proksi Task aktif untuk eligibility koreksi/transfer |
| Task UI utama               | `src/routes/_app.tasks.tsx`                                                                                                                          | seluruh papan Today/Upcoming/Overdue, kalkulasi lokal `setDate()`                                                         |
| Task Detail                 | `src/components/tasks/TaskDetailDrawer.tsx`                                                                                                          | status select bebas, snooze lokal, note tanpa next-action                                                                 |
| Task Create                 | `src/components/tasks/CreateTaskDialog.tsx`                                                                                                          | Client wajib, status dihitung sekali saat submit                                                                          |
| Follow-up dialog            | `src/components/tasks/LogFollowUpDialog.tsx`                                                                                                         | 2–4 write independen                                                                                                      |
| Tests                       | `supabase/tests/tasks.test.ts`, `follow-up-logs.test.ts`, `account-lifecycle.test.ts`, `business-owner-invariant.test.ts`, `super-admin-rls.test.ts` | masih menguji kontrak 3/4-role lama tanpa workflow/due-state terpisah                                                     |

Graphify (`graphify query` atas TaskStatus/Dashboard/Reports/TopBar/Pipeline/
Client Detail/export/account-lifecycle, budget 1200) mengonfirmasi kumpulan
file yang sama persis sebagai node berkomunitas "Dashboard Executive Cards",
"Report Filters & UI Alerts", "Pipeline & Client Status UI", "Client
Management Dialogs", "Data Lib Functions" — tidak menemukan consumer lain di
luar daftar rg di atas. Graph tidak menunjukkan `.needs_update`; hasil
dianggap tidak stale untuk keperluan inventarisasi file (bukan untuk detail
baris — detail baris diverifikasi langsung dari source di atas).

### 1.8 Konflik eksplisit kode-existing vs one-pager

| #   | One-pager mensyaratkan                                                       | Kode saat ini                                                                                                                                           | Dampak                                                                                       |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | Client opsional end-to-end                                                   | `tasks.client_id not null` (DB), `clientId: z.string().min(1)` (form)                                                                                   | Task tanpa Client tidak bisa dibuat sama sekali hari ini                                     |
| C2  | Workflow status terpisah dari due state                                      | Satu enum `task_status` mencampur `Today/Overdue/Upcoming/Done`                                                                                         | KPI Overdue/Today keliru begitu status tidak lagi mengandung makna waktu                     |
| C3  | Progress update atomik                                                       | `LogFollowUpDialog` = 2–4 write independen                                                                                                              | Kegagalan parsial nyata sudah mungkin terjadi hari ini                                       |
| C4  | Executive hanya detail read-only untuk eskalasi Manager + agregat perusahaan | RLS `tasks_select` memberi Executive baca semua baris                                                                                                   | Kebocoran row-detail company-wide ke Executive                                               |
| C5  | Tidak ada Notes store ketiga; satukan `activity_log`+`follow_up_logs`        | `listTaskHistory()` hanya baca `activity_log`, tidak menyertakan `follow_up_logs`                                                                       | Timeline per-Task hari ini tidak lengkap, meski secara arsitektur belum ada tabel ketiga     |
| C6  | Next action wajib untuk Task aktif                                           | `next_action` di `follow_up_logs` nullable, tidak divalidasi; `tasks` tidak punya kolom next action sama sekali                                         | Task bisa "diam" tanpa rencana lanjutan                                                      |
| C7  | Kalender kerja terpusat                                                      | 8+ titik `setDate()` independen di UI                                                                                                                   | Escalation/snooze akan berbeda hasil antar layar                                             |
| C8  | Cancelled ≠ Archived                                                         | `task_status` tidak punya `Cancelled`; `archived` sudah terpisah dari `status` sejak `20260718030000` — bagian ini **sudah konsisten** dengan one-pager | Perlu ditambah `Cancelled` sebagai workflow value, `archived` tetap dipertahankan apa adanya |
| C9  | Kategori terstruktur                                                         | Tidak ada kolom `category`                                                                                                                              | Tidak ada gap arsitektur besar — kolom baru murni aditif                                     |

---

## 2. Target Domain Model

`public.tasks` tetap **satu-satunya** aggregate Task. Tidak ada tabel Task
paralel.

### 2.1 Kolom baru (diusulkan, additive, dual-read dengan `status` lama sampai Task 16)

| Kolom baru            | Tipe                                                                                                                                                   | Wajib                                                          | Aturan                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `workflow_status`     | enum baru `task_workflow_status` (`Open`, `In Progress`, `Waiting External`, `Done`, `Cancelled`)                                                      | ya, default `'Open'`                                           | Nilai yang **dipilih pengguna**; tidak pernah otomatis diturunkan dari tanggal                    |
| `category`            | enum baru `task_category` (`Project/Opportunity Planning`, `Client Meeting/Visit`, `Follow-Up`, `Quotation`, `Sales Order`, `Internal/Admin`, `Other`) | ya, default `'Other'` untuk baris baru; existing rows lihat §6 | Judul Task tetap bebas terpisah dari kategori                                                     |
| `client_id`           | uuid, **diubah menjadi nullable**                                                                                                                      | tidak                                                          | Perubahan schema, bukan hanya UI                                                                  |
| `next_action`         | text                                                                                                                                                   | wajib kondisional (lihat §2.4)                                 | Deskripsi bebas rencana lanjutan                                                                  |
| `next_action_date`    | date                                                                                                                                                   | wajib kondisional (lihat §2.4)                                 | Dipakai due-state engine sebagai tanggal acuan berikutnya                                         |
| `cancellation_reason` | text                                                                                                                                                   | wajib jika `workflow_status = 'Cancelled'`                     |                                                                                                   |
| `status` (lama)       | tetap ada, tidak dihapus di spec ini                                                                                                                   | —                                                              | Dual-read sampai Task 16; ditulis lewat compatibility shim, dibaca sebagai fallback consumer lama |

`due_date` yang sudah ada **tetap dipertahankan** sebagai tanggal jatuh tempo
utama Task; `next_action_date` adalah tanggal rencana lanjutan yang bisa
berbeda dari `due_date` (mis. Task due hari ini, tapi next action-nya adalah
follow-up 3 hari lagi). Field-level target lengkap (nama kolom final, DEFAULT,
CHECK constraint SQL persis) diselesaikan di Task 3, bukan di sini — spec ini
mengunci **bentuk** kontrak, bukan teks DDL final.

### 2.2 Due state — nilai turunan, bukan kolom yang ditulis pengguna

`Upcoming`, `Today`, `Overdue`, `Escalated` **tidak disimpan** sebagai kolom
`tasks`. Nilai ini dihasilkan oleh satu fungsi database (§5, §7) yang
menerima `due_date`/`next_action_date`, `workflow_status`, dan kalender kerja
sebagai input, dan dipanggil ulang setiap kali dibaca — bukan dihitung sekali
saat insert seperti `statusFor()` hari ini.

- `Upcoming`: due date > hari ini (kalender kerja).
- `Today`: due date = hari ini.
- `Overdue`: due date < hari ini, `workflow_status` masih aktif.
- `Escalated`: Overdue dan sudah melewati ambang dua hari kerja (§5).
- Task `Done`/`Cancelled` tidak memiliki due state aktif (ditampilkan sebagai
  "selesai"/"dibatalkan", bukan salah satu dari 4 nilai di atas).

### 2.3 Owner

Aturan sudah ditegakkan sebagian oleh
`private.is_active_business_owner()`/`private.enforce_active_business_owner()`
(§1.3) — Sales/Manager aktif saja. Aturan ini **dipertahankan apa adanya**
untuk Task; tidak ada perubahan pada fungsi/trigger yang sudah ada, hanya
memastikan kolom baru tunduk pada trigger yang sama.

### 2.4 Next-action enforcement

- `workflow_status in ('Open','In Progress')`: `next_action` DAN
  `next_action_date` **wajib** tidak-null pada baris final setelah progress
  update tersimpan.
- `workflow_status = 'Waiting External'`: `next_action_date` (tanggal
  follow-up) tetap wajib; `next_action` tetap wajib.
- `workflow_status in ('Done','Cancelled')`: `next_action`/`next_action_date`
  tidak wajib untuk update berikutnya (Task sudah berhenti aktif), nilai lama
  boleh tetap tersimpan sebagai riwayat.
- Aturan ini ditegakkan sebagai CHECK constraint + validasi di RPC atomik
  (§3), bukan hanya di form React.

### 2.4a Reopen dari Done/Cancelled — **DIPUTUSKAN oleh Product Owner (2026-07-27)**

**Keputusan: reopen mengembalikan `workflow_status` ke `Open`, dan baris
tidak bisa tersimpan tanpa `next_action`/`next_action_date` baru diisi** —
tidak ada field `reopen_reason` terpisah; aturan ini murni memakai constraint
next-action Task aktif yang sudah didefinisikan §2.4, tanpa menambah kolom
wajib baru. Reopen tetap menghasilkan satu baris `activity_log` audit event
(§3.3) yang mencatat transisi `Done`/`Cancelled` → `Open`, actor, dan
timestamp — cukup sebagai jejak audit tanpa field alasan eksplisit.

### 2.5 Cancelled vs Archived

- `Cancelled` adalah nilai `workflow_status` (hasil workflow, wajib
  `cancellation_reason`).
- `archived` (boolean, sudah ada) tetap murni properti tampilan/retensi,
  independen dari `workflow_status`. **DIPUTUSKAN oleh Product Owner
  (2026-07-27, §9 butir 7): pengarsipan selalu manual**, tidak ada
  job/trigger otomatis berbasis waktu. Task `Done`/`Cancelled` diarsipkan
  kapan pun pengguna memilih lewat aksi eksplisit; schema tidak melarang
  Task aktif diarsipkan juga (tidak ada constraint baru yang perlu
  ditambahkan untuk membatasi ini), konsisten dengan perilaku `archived`
  yang sudah ada sejak `20260718030000_tasks_archived.sql`.

---

## 3. Timeline dan Atomic Progress

### 3.1 Sumber canonical progress domain — **DIPUTUSKAN oleh Product Owner (2026-07-27)**

**Keputusan: `follow_up_logs` adalah canonical progress record.**
`activity_log` tetap audit trail immutable untuk _semua_ jenis event
termasuk workflow-status/owner/cancellation changes — bukan tempat
penyimpanan utama isi progress.

Konsekuensi teknis dari keputusan ini yang wajib ditangani Task 3/Task 5:

- `follow_up_logs.client_id` harus diubah nullable, sinkron dengan
  `tasks.client_id` (§2.1) — Task tanpa Client tidak boleh gagal mencatat
  progress hanya karena `follow_up_logs` masih mewajibkan `client_id`.
- `follow_up_logs.result` (enum `follow_up_result`, saat ini 9 nilai
  bergaya funnel quotation seperti `'Waiting PO'`, `'PO Confirmed'`) perlu
  diperluas dengan nilai netral (mis. `'Progress Update'`) agar masuk akal
  untuk kategori Task non-komersial (`Internal/Admin`, `Project/Opportunity
Planning`, dll.) — detail nilai baru dan penamaan final diputuskan di
  Task 3, bukan di sini.
- `follow_up_logs.task_id` tetap nullable seperti sekarang, tapi RPC atomik
  (§3.3) yang baru mewajibkan `task_id` terisi untuk setiap panggilan yang
  berasal dari alur Sales Task Control Loop (baris `follow_up_logs` tanpa
  `task_id` tetap valid untuk alur follow-up non-Task lama yang sudah ada,
  jika ada — diverifikasi di Task 2 characterization tests).
- Setiap baris `follow_up_logs` yang ditulis lewat RPC tetap memicu satu
  baris `activity_log` pendamping sebagai audit event (§3.3 langkah 5) —
  keputusan ini tidak mengubah kebutuhan audit trail, hanya menegaskan
  `follow_up_logs` sebagai sumber isi bisnis dan `activity_log` sebagai
  jejak "siapa melakukan apa, kapan."

### 3.2 Hubungan `follow_up_logs` ↔ `activity_log`

- `follow_up_logs` = **domain progress record** — isi bisnis dari update
  (catatan, next action, next date, potensi nilai, perubahan status
  customer).
- `activity_log` = **audit trail immutable** — siapa melakukan apa, kapan,
  untuk keperluan compliance/Team & Role/lifecycle. Setiap progress update
  tetap menghasilkan **satu** baris `activity_log` (`kind = 'task_progress'`
  baru, atau `task_status_change` yang sudah ada, tergantung keputusan Task 3)
  sebagai jejak audit — bukan duplikasi isi, hanya penanda "sesuatu terjadi
  di titik waktu ini, oleh siapa."
- Tidak ada tabel Notes ketiga. Timeline gabungan (§7) adalah **view/RPC
  baca** yang menggabungkan kedua sumber, bukan tabel baru.

### 3.3 Satu RPC/transaksi atomik

Satu fungsi database (nama final ditentukan Task 5, mis.
`public.record_task_progress(...)`) menerima: `task_id`, `note`,
`next_action`, `next_action_date`, `workflow_status_target` (opsional),
`cancellation_reason` (jika target `Cancelled`). Fungsi ini dalam **satu
transaksi**:

1. Validasi caller adalah owner Task, atau Manager/Super Admin dengan
   kewenangan koreksi (§4).
2. Validasi next-action rule (§2.4) sesuai `workflow_status_target`.
3. INSERT satu baris `follow_up_logs` (progress domain).
4. UPDATE `tasks` (workflow_status, next_action, next_action_date sinkron).
5. INSERT satu baris `activity_log` (audit event, actor dari `auth.uid()`,
   timestamp dari `now()` di database — **tidak pernah dari client**).

Jika langkah mana pun gagal, seluruh transaksi rollback — tidak ada follow-up
log yang tersimpan tanpa update Task, dan tidak ada update Task tanpa jejak
audit. `security invoker` (bukan `security definer`) kecuali audit Task 5
membuktikan RLS caller tidak cukup untuk salah satu langkah — jika perlu
`security definer`, wajib eksplisit membatasi hak dan didokumentasikan
alasannya (larangan "security definer hanya untuk mengatasi error
permission" dari SUPABASE SECURITY RULES).

### 3.4 Immutability dan correction

- `follow_up_logs` dan `activity_log` tetap **insert-only** — tidak ada
  UPDATE/DELETE policy baru untuk kedua tabel ini bagi role manapun.
- Koreksi terhadap note yang salah dilakukan dengan **entri koreksi baru**
  (baris `follow_up_logs`/`activity_log` baru yang secara eksplisit merujuk
  entri yang dikoreksi lewat `title`/`detail` terstruktur, mis. "Koreksi atas
  entri {id}: …"), bukan UPDATE terhadap baris lama. Mekanisme rujukan
  persis (kolom `corrects_id` baru vs konvensi teks) diputuskan di Task 5.

### 3.5 Mencegah event ganda pada timeline

- Setiap RPC progress menghasilkan **tepat satu** baris `follow_up_logs` dan
  **tepat satu** baris `activity_log` terkait — bukan satu per field yang
  berubah (berbeda dari `TaskDetailDrawer.commitSave()` hari ini yang bisa
  menghasilkan beberapa perubahan dalam satu `logActivity()` gabungan, sudah
  benar pada titik itu, tapi `quickStatus()`/`quickSnooze()`/`addNote()`
  masing-masing memicu `logActivity()` terpisah untuk aksi yang secara
  konseptual satu progress update — ini yang perlu disatukan lewat RPC).
- Timeline read-side (§7) mengurutkan berdasarkan `created_at` dan memberi
  `id` unik berprefiks sumber (pola yang sama seperti
  `buildActivityFeed()` hari ini) — tidak butuh dedup tambahan karena kedua
  sumber tidak pernah menulis event yang identik untuk aksi yang sama setelah
  RPC menjadi satu-satunya jalur tulis (jalur tulis independen lama seperti
  `LogFollowUpDialog`'s 4 panggilan terpisah pensiun di Task 6–8).

---

## 4. Role/Action Matrix

| Aksi                                                      | Sales                | Manager (My Tasks)          | Manager (Team Exceptions) | Executive                     | Super Admin                                                                |
| --------------------------------------------------------- | -------------------- | --------------------------- | ------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| Create Task milik sendiri                                 | ✅                   | ✅                          | —                         | ❌                            | ❌ (tidak jadi owner)                                                      |
| Edit/progress Task milik sendiri                          | ✅                   | ✅                          | —                         | ❌                            | ❌                                                                         |
| Lihat Task milik sendiri                                  | ✅                   | ✅                          | —                         | ❌                            | ✅ (koreksi company-wide, lihat catatan)                                   |
| Lihat Task Sales lain (non-eskalasi)                      | ❌                   | ❌                          | ❌                        | ❌                            | ✅ (koreksi company-wide)                                                  |
| Lihat Task Sales yang Escalated                           | —                    | —                           | ✅ (read+context)         | ❌                            | ✅                                                                         |
| Lihat detail Task Manager yang Escalated                  | ❌                   | —                           | —                         | ✅ read-only                  | ✅                                                                         |
| Lihat detail Task Manager non-eskalasi                    | ❌                   | —                           | —                         | ❌                            | ✅                                                                         |
| Ambil alih ownership via eskalasi                         | ❌ (tidak berpindah) | ❌                          | ❌ (tidak otomatis)       | ❌                            | ❌                                                                         |
| Ubah owner Task (transfer eksplisit)                      | ❌                   | ❌                          | ❌                        | ❌                            | ✅ (aksi transfer eksplisit, tetap ke Sales/Manager aktif, sesuai ADR-002) |
| Koreksi field non-owner (title/category/dll) company-wide | ❌                   | ✅ (company-wide, existing) | —                         | ❌                            | ✅ (ADR-002, preserve `owner_id`)                                          |
| Terima metrik agregat perusahaan                          | tidak relevan        | tidak relevan               | tidak relevan             | ✅ (aggregate-only interface) | tidak relevan (bukan performance member)                                   |
| Masuk hitungan performance/target                         | ✅                   | ✅                          | ✅                        | ❌                            | ❌ (ADR-002: dikecualikan)                                                 |
| Jadi penerima eskalasi                                    | ❌                   | ✅ (dari Sales)             | —                         | ✅ (dari Manager, read-only)  | ❌                                                                         |

### 4.1 Enforcement

- **RLS** (Task 3/Task 10): `tasks_select` untuk Executive **wajib diubah**
  dari "semua baris" (§1.3) menjadi hanya baris Manager-owned yang memenuhi
  syarat Escalated. `tasks_select` untuk Sales/Manager tetap pola
  own-or-privileged yang sudah ada.
- **Grants**: Executive tidak pernah mendapat grant `insert`/`update` pada
  `tasks`/`follow_up_logs`. Grant `authenticated` saat ini adalah blanket
  (§1.2) — perlu diverifikasi ulang di Task 3 apakah grant table-level cukup
  dipersempit lewat RLS saja, atau butuh grant terpisah per-role (Postgres
  tidak punya grant per-role di dalam `authenticated`; RLS tetap batas utama,
  konsisten dengan aturan "UI filtering bukan authorization").
- **Aggregate-only Executive** (§7.5): fungsi privileged terpisah
  (`security definer`, eksplisit role check, `search_path` di-pin, schema
  object di-qualify, `revoke execute from public`, grant sesempit mungkin ke
  `authenticated` yang lolos role check di dalam fungsi, tidak mengembalikan
  baris Task individual) — dibutuhkan **hanya jika** agregat perusahaan tidak
  bisa dihitung dari view yang sudah RLS-aman untuk Executive. Kebutuhan
  pastinya diverifikasi di Task 10, bukan diasumsikan di sini.
- **Super Admin**: RLS `tasks_insert`/`tasks_update` company-wide untuk
  Super Admin **sudah ada** (§1.3) dan **dipertahankan**. Constraint owner
  eligibility (§2.3, trigger existing) sudah mencegah Super Admin menjadi
  `owner_id` Task karena trigger hanya menerima `role in ('sales','manager')`
  — tidak perlu perubahan tambahan untuk menutup jalur ini.

---

## 5. Business Calendar

### 5.1 Aturan tetap (locked oleh one-pager)

- Zona waktu: **Asia/Jakarta** (UTC+7, tanpa DST).
- Hari kerja: Senin–Jumat.
- Sabtu, Minggu, dan hari libur (termasuk cuti bersama) tidak dihitung dalam
  ambang eskalasi.
- Ambang eskalasi: **dua hari kerja** setelah due date, masih aktif
  (`workflow_status` bukan Done/Cancelled).

### 5.2 Definisi "melewati dua hari kerja" — **DIPUTUSKAN oleh Product Owner (2026-07-27)**

**Keputusan: Interpretasi X — hari kerja dihitung mulai hari kerja _setelah_
`due_date`.** Due date itu sendiri tidak dihitung sebagai salah satu dari dua
hari kerja ambang.

Contoh: Task due Senin → hari kerja 1 = Selasa, hari kerja 2 = Rabu →
`dueState` menjadi `Escalated` mulai Kamis pagi (Asia/Jakarta). Jika Selasa
atau Rabu jatuh pada hari libur/cuti bersama, hari itu tidak dihitung dan
ambang bergeser mundur sesuai kalender kerja (§5.3–§5.5).

Aturan ini berlaku identik untuk fungsi due-state di database maupun
turunan TypeScript-nya (AC5, §8) — tidak ada penghitungan hari kerja
independen di UI manapun setelah Task 4 selesai.

### 5.3 Kalender canonical di database

Satu tabel baru (nama final Task 4, mis. `public.business_calendar_holidays`)
menyimpan setiap tanggal libur/cuti bersama sebagai baris, dengan minimal:
tanggal, label, sumber/provenance, status sinkronisasi terakhir, dan siapa
yang melakukan koreksi manual (jika ada). Semua konsumen (RPC due-state
database, `src/lib/data/business-calendar.ts` di sisi TypeScript, UI) **wajib
membaca dari tabel ini** — tidak ada penghitungan hari kerja independen di
komponen manapun setelah Task 4 selesai (menutup 8+ titik `setDate()`
independen di §1.6).

### 5.4 Sumber data holiday — **DIPUTUSKAN oleh Product Owner (2026-07-27): import manual tahunan**

**Opsi 1 — DIPILIH — Import manual tahunan oleh admin (Super Admin/Manager)
via Settings UI atau seed terkontrol.**

- Kelebihan: tidak ada dependency eksternal, tidak ada biaya API, tidak ada
  kegagalan sinkronisasi jaringan, cocok dengan pola repo ini (data bisnis
  lain — target, holiday cuti bersama tahun berikutnya — memang perlu
  keputusan manusia setiap tahun karena Indonesia mengumumkan cuti bersama
  per Keputusan Bersama Menteri, biasanya H-beberapa bulan).
- Kekurangan: butuh proses tahunan manual; risiko lupa update di awal tahun
  baru kalau tidak ada pengingat operasional.

**Opsi 2 — Sinkronisasi otomatis dari API publik (mis. API hari libur
nasional pihak ketiga).**

- Kelebihan: tidak perlu intervensi tahunan manual untuk hari libur nasional
  baku.
- Kekurangan: menambah dependency eksternal, kegagalan jaringan/API perlu
  fallback eksplisit (one-pager melarang kegagalan sinkronisasi diam-diam
  menghasilkan tenggat salah), cuti bersama sering diumumkan terpisah dari
  hari libur resmi dan API publik tidak selalu mencakupnya, dan
  keputusan/biaya penggunaan provider eksternal harus disetujui eksplisit —
  dilarang dipilih diam-diam oleh spec ini.

**Keputusan Product Owner:** Opsi 1 — import/entry manual tahunan, disimpan
sebagai tabel database canonical (§5.3), untuk MVP Sales Task Control Loop.
Opsi 2 (sinkronisasi API eksternal) tidak dipakai untuk MVP ini; boleh
dipertimbangkan lagi di masa depan sebagai peningkatan terpisah jika Product
Owner secara eksplisit meminta, tapi tidak menjadi bagian rencana Task 4.

### 5.5 Fallback, health indicator, dan koreksi

- **Fallback saat data kalender kosong/tidak lengkap untuk tahun berjalan**:
  fungsi due-state **wajib gagal secara eksplisit/terlihat** (mis. flag
  `calendar_incomplete` di hasil RPC, atau exception yang ditangkap UI
  menjadi banner peringatan) — dilarang diam-diam memperlakukan tahun tanpa
  data sebagai "tidak ada hari libur" (itu akan mempercepat eskalasi secara
  keliru) atau "semua hari libur" (itu akan menunda eskalasi secara keliru).
- **Health indicator**: kolom provenance/`synced_at` pada tabel kalender
  memungkinkan UI Settings menampilkan "kalender tahun X terakhir
  diverifikasi tanggal Y" — detail tampilan diserahkan ke Task 4.
- **Koreksi**: menambah/menghapus baris kalender adalah operasi biasa
  (INSERT/DELETE oleh admin berwenang), tapi **tidak mengubah histori
  eskalasi yang sudah tercatat** — status Escalated yang sudah tersimpan di
  `activity_log` sebagai audit event historis tetap seperti apa adanya;
  hanya perhitungan due-state _ke depan_ yang memakai kalender terbaru. Ini
  konsisten dengan prinsip immutability §3.4.

---

## 6. Existing-Data Migration

### 6.1 Strategi dual-read/compatibility

- Kolom `status` (lama) **tidak dihapus** sampai Task 16. Selama masa
  transisi, `workflow_status` baru ditulis lewat compatibility shim yang
  juga menyinkronkan `status` lama secara deterministik (mis.
  `workflow_status IN ('Open','In Progress','Waiting External')` →
  `status` lama dihitung ulang dari due date seperti sebelumnya; `Done` →
  `Done`; `Cancelled` → dipetakan ke `Done` lama untuk kompatibilitas
  predikat `.neq("status","Done")` **atau** consumer lama diaudit lebih dulu
  — pendekatan pasti diputuskan Task 3 setelah setiap consumer di §1.7
  diinventarisasi ulang di Task 2 characterization tests).
- Semua 15 file/lokasi di §1.7 diaudit satu per satu di Task 11–15
  (implementation plan) sebelum `status` lama dipensiunkan di Task 16 —
  bukan diganti serentak.

### 6.2 Mapping deterministik untuk status lama

| `status` lama                    | `workflow_status` baru (deterministik) | Alasan                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Done`                           | `Done`                                 | Sudah terminal, tidak ambigu                                                                                                                                                                                             |
| `Today` / `Overdue` / `Upcoming` | `Open`                                 | Ketiganya adalah due-state lama yang sekarang jadi nilai turunan (§2.2); Task belum pernah punya `In Progress`/`Waiting External`/`Cancelled` di data lama sehingga tidak bisa dibedakan lebih jauh secara deterministik |

Tidak ada baris existing yang bisa dipetakan deterministik ke
`In Progress`, `Waiting External`, atau `Cancelled` — nilai-nilai itu tidak
pernah ada di sistem lama, jadi memberi salah satu dari tiga nilai itu ke
data lama akan **memfabrikasi** informasi yang tidak ada. Semua baris lama
yang aktif mendarat di `Open` saja.

### 6.3 Category, next action, dan Client yang null

- **Category**: tidak ada data lama untuk diturunkan (§1.8, C9) — kolom
  `category` untuk baris lama diisi nilai eksplisit `'Other'` (bukan dibuat
  `NULL`, karena kolom didefinisikan `not null`) dengan makna yang jelas:
  "kategori belum diklasifikasi", bukan klaim bahwa Task tersebut memang
  kategori "Other" secara bisnis. Ini bukan fabrikasi karena `'Other'` secara
  eksplisit berarti "tidak diketahui/tidak diklasifikasi", sama seperti nilai
  `'Belum diklasifikasi'` yang sudah dipakai pola serupa untuk
  `QuotationLostReason` di `domain.ts`.
- **Next action / next action date**: **tidak dapat diturunkan** dari data
  lama (`tasks` tidak pernah punya kolom ini). Baris lama tetap `NULL` pada
  kedua kolom ini. Karena §2.4 mewajibkan next-action untuk Task aktif,
  baris lama `Open` dengan `next_action IS NULL` **tidak otomatis melanggar
  constraint** — constraint next-action hanya berlaku pada saat progress
  update _berikutnya_ disimpan (RPC di §3.3), bukan retroaktif terhadap baris
  yang sudah ada. Baris lama tanpa next action tetap terlihat di daftar Task
  sampai pemiliknya melakukan progress update pertama lewat alur baru, yang
  pada titik itu next-action menjadi wajib.
- **Client**: `tasks.client_id` lama selalu terisi (`not null` sebelum
  migrasi) — tidak ada baris lama yang perlu di-null-kan. Client opsional
  hanya berlaku untuk Task baru yang dibuat setelah Task 3.

### 6.4 Review state untuk record ambigu

Berdasarkan §6.2, sebenarnya **tidak ada** kasus ambigu untuk mapping
`status` → `workflow_status` (mapping selalu deterministik: Done→Done,
selain itu→Open). Review state eksplisit (kolom/flag "perlu ditinjau
manual") karena itu **tidak dibutuhkan** untuk migrasi status utama. Jika
audit Task 2 (characterization tests) menemukan bentuk data lama yang tidak
tercakup asumsi ini (mis. baris dengan `status` NULL yang lolos dari
constraint lama, atau nilai enum yang rusak), itu harus dilaporkan sebagai
temuan baru sebelum Task 16 berjalan, bukan diasumsikan tidak ada di sini.

### 6.5 Pre/post reconciliation

Task 16 mewajibkan laporan rekonsiliasi machine-readable dengan nol mismatch
tidak terjelaskan (implementation plan, Task 16 acceptance criteria). Spec
ini menetapkan minimal yang harus direkonsiliasi: jumlah baris per
`workflow_status` baru vs `status` lama, jumlah `owner_id` yang tidak berubah,
jumlah relasi (`client_id`, dokumen komersial) yang tidak berubah, jumlah
`archived=true` yang tidak berubah, dan jumlah referensi `activity_log`/
`follow_up_logs` historis yang tetap bisa di-resolve ke `task_id` yang sama.

### 6.6 Urutan penghentian enum/status lama

`status` lama (kolom dan enum `task_status`) hanya dipensiunkan di Task 16
**setelah** Task 11–15 membuktikan nol consumer aktif tersisa yang membaca
`status` lama secara langsung (bukan lewat compatibility shim). Urutan:
Task 3 (tambah kolom baru, dual-write) → Task 6 (adapter TypeScript expose
`workflowStatus`+`dueState` terpisah) → Task 11–15 (migrasi consumer satu per
satu sesuai §1.7) → Task 16 (audit nol-consumer, lalu drop kolom/enum lama).

### 6.7 Rollback strategy

- Setiap migration additive (Task 3–5) dapat di-rollback dengan `DROP COLUMN`
  pada kolom yang baru ditambahkan tanpa memengaruhi `status` lama yang masih
  hidup selama masa dual-read — karena tidak ada consumer yang bergantung
  pada kolom baru sampai Task 6 mengubah adapter.
- Migration Task 16 (retire legacy) adalah **satu-satunya** langkah yang
  merusak (`DROP COLUMN status`, `DROP TYPE task_status`) — migration ini
  wajib memiliki migration companion yang bisa mengembalikan kolom `status`
  dari `workflow_status`+due-state terhitung ulang jika rollback dibutuhkan
  sebelum verifikasi lengkap Task 17 selesai. Detail SQL rollback pasti
  ditulis di Task 16, bukan di sini.

---

## 7. Query dan Interface Contracts

Kontrak di bawah adalah **bentuk interface**, bukan implementasi final —
nama fungsi/kolom persis diselesaikan Task 6, 9, 10.

### 7.1 Owner Task list (Sales, dan Manager untuk My Tasks)

Input: `owner_id` implisit dari `auth.uid()` (RLS-scoped, sama seperti
`listTasks()` hari ini — tanpa parameter role). Output: `Task[]` dengan
`workflowStatus`, `dueState` (dihitung server-side), `category`,
`nextAction`, `nextActionDate`, field existing lainnya.

### 7.2 Manager My Tasks

Sama seperti §7.1, tapi dipanggil dari mode UI terpisah (Manager melihat
Task miliknya sendiri sebagai Sales) — query yang sama, tidak butuh interface
baru karena RLS `tasks_select` Manager sudah mencakup baris miliknya sendiri.

### 7.3 Manager Team Exceptions

Query baru: seluruh Task **Sales-owned** (bukan milik Manager sendiri) dengan
`dueState = 'Escalated'` dan `workflowStatus` aktif, dalam cakupan company
Manager (RLS `manager` existing sudah company-wide). Tidak melakukan
perpindahan `owner_id`.

### 7.4 Executive Exceptions

Query baru, **row-level**, terbatas: Task **Manager-owned** dengan
`dueState = 'Escalated'`, hanya kolom yang perlu ditampilkan sebagai detail
read-only (tanpa hak edit). Ini yang memerlukan perubahan RLS `tasks_select`
Executive (§4.1) dari "semua baris" menjadi predikat spesifik ini.

### 7.5 Executive aggregate metrics

Interface **terpisah** dari §7.4 — mengembalikan angka agregat perusahaan
(total Task aktif, jumlah escalated, dsb.) tanpa baris Task individual apa
pun, termasuk untuk Task milik Sales (yang §7.4 sama sekali tidak
mengizinkan Executive lihat row detail-nya). Jika agregat ini bisa dihitung
dari view yang sudah dibatasi RLS Executive-safe, gunakan itu; jika butuh
melihat lintas semua Task (termasuk Sales-owned) untuk hasil company-wide
yang akurat, ini **satu-satunya** kandidat privileged function beraturan
ketat (§4.1) di seluruh spec ini.

### 7.6 Unified Task timeline (per Task)

RPC/view baca baru yang menggabungkan `follow_up_logs` (progress domain)
dan `activity_log` (audit events) terfilter `task_id`, diurutkan
`created_at` — menggantikan `listTaskHistory()` yang hari ini hanya baca
`activity_log` (§1.4). Menyatukan pengalaman `TaskDetailDrawer` "Riwayat"
dengan halaman Activity Log (`_app.activity.tsx`) tanpa mengubah keduanya
menjadi tabel baru.

### 7.7 Atomic progress mutation

Kontrak RPC di §3.3.

### 7.8 React Query cache/invalidation

Kunci cache yang harus diinvalidasi setelah RPC progress berhasil (menambah
dari pola invalidasi yang sudah ada di `LogFollowUpDialog`/
`TaskDetailDrawer` hari ini):

```
["tasks"]                         // daftar Task (semua mode)
["tasks", "exceptions", "team"]   // Manager Team Exceptions (baru)
["tasks", "exceptions", "executive"] // Executive Exceptions (baru)
["task-timeline", taskId]         // §7.6, ganti key lama ["activity-log","task",id]
["activity-log"]                  // halaman Activity Log tetap perlu refresh
["follow-ups"]                    // dipakai LogFollowUpDialog hari ini
["dashboard"]                     // taskCounts/todaysFollowUps/salesPerformance
["reports"]                       // metrik yang bergantung workflow/due state
```

Nama key pasti (`useDashboardData()`, `use-dashboard-data.ts`) diverifikasi
ulang di Task 6 terhadap key existing sebelum diterapkan — daftar di atas
adalah cakupan minimal, bukan daftar final yang mengikat penamaan persis.

---

## 8. Acceptance Criteria dan Verification Matrix

| #   | Kriteria                                                                                                                                                                                                                            | Verifikasi                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AC1 | `workflow_status`, `category`, `next_action`, `next_action_date`, `cancellation_reason` ada di schema dengan constraint next-action sesuai §2.4                                                                                     | `bunx supabase db reset` + `bun test supabase/tests/tasks.test.ts`                                                      |
| AC2 | `tasks.client_id` nullable, seluruh chain (form, adapter, filter, timeline) menerima Task tanpa Client                                                                                                                              | Test data-layer + manual browser check Create Task tanpa Client                                                         |
| AC3 | RLS tiap peran diuji langsung lewat Supabase client (bukan mock) untuk Sales own-only, Manager My Tasks + Team Exceptions, Executive Exceptions row-level + aggregate-only, Super Admin correction                                  | `bun test supabase/tests/tasks.test.ts supabase/tests/super-admin-rls.test.ts` + test RLS baru Task 3/10                |
| AC4 | RPC progress rollback total saat gagal di langkah manapun (dipaksa gagal sengaja)                                                                                                                                                   | Integration test forced-failure, verifikasi nol baris `follow_up_logs`/`activity_log` tersisa dan `tasks` tidak berubah |
| AC5 | Due state (`Upcoming/Today/Overdue/Escalated`) konsisten antara fungsi database dan TypeScript untuk fixture identik, termasuk batas Jumat→Senin, cuti bersama berurutan, akhir tahun, tahun kabisat, dan baris kalender terkoreksi | Test `business-calendar.test.ts` (DB) + `business-calendar.test.ts` (TS) dengan fixture sama                            |
| AC6 | Selector Dashboard/Reports/export merekonsiliasi 1:1 dengan sumber due-state baru untuk keempat peran                                                                                                                               | Selector/component test + perbandingan fixture sebelum/sesudah dengan penjelasan setiap perubahan KPI yang disengaja    |
| AC7 | Browser UAT empat peran: Sales/Manager loop create→progress→escalate, Manager Team Exceptions, Executive Exceptions read-only + aggregate, Super Admin correction tanpa jadi owner                                                  | Manual browser check per Task 9/10/17, dicatat dengan bukti (screenshot/log), bukan asumsi                              |
| AC8 | Tidak ada regresi RFQ — tidak ada rute/label/kategori RFQ dipulihkan                                                                                                                                                                | `rg` untuk literal "RFQ" di file yang disentuh setelah implementasi + review manual                                     |
| AC9 | Verifikasi lokal (reset, test, typecheck, lint, build, advisors) dipisahkan eksplisit dari verifikasi remote (belum dijalankan sampai Task 18 dengan approval terpisah)                                                             | Laporan Task 17 mencantumkan kedua kategori terpisah                                                                    |

---

## 9. Keputusan yang Belum Bisa Ditebak

Spec ini **tidak** memilih sendiri butir-butir berikut karena mengubah
aturan bisnis. Opsi dan rekomendasi tercantum di bagian relevan di atas
(§3.1, §5.2, §5.4, §6, dan seterusnya). Pertanyaan diajukan satu per satu;
status terkini:

1. ~~**Canonical progress source** (§3.1)~~ — **DIPUTUSKAN 2026-07-27:**
   `follow_up_logs` adalah canonical progress record; `activity_log` tetap
   audit trail. Lihat §3.1 untuk konsekuensi teknis yang sudah dicatat.
2. Mapping Task lama yang tidak deterministik — **sudah tidak relevan**:
   audit §6.2/§6.4 menemukan mapping status lama sepenuhnya deterministik
   (Done→Done, selain itu→Open), jadi tidak ada kasus ambigu yang perlu
   diputuskan Product Owner untuk butir ini kecuali audit Task 2 menemukan
   data lama di luar asumsi ini.
3. ~~Authoritative holiday source dan fallback (§5.4)~~ — **DIPUTUSKAN
   2026-07-27:** import manual tahunan, disimpan di tabel database canonical.
4. ~~Batas waktu tepat untuk escalation (§5.2)~~ — **DIPUTUSKAN 2026-07-27:**
   Interpretasi X (hari kerja mulai _setelah_ due date; due date sendiri
   tidak dihitung).
5. ~~Notification query-time vs persisted event~~ — **DIPUTUSKAN
   2026-07-27:** query-time. Notifikasi Today/Overdue/Escalated dihitung
   langsung dari fungsi due-state (§2.2/§7) setiap kali dibaca — tidak ada
   tabel event notifikasi baru, tidak ada job/trigger terjadwal tambahan.
   TopBar dan widget lain (§1.7) memanggil fungsi due-state yang sama, bukan
   filter status lama.
6. ~~Aturan reopen dari Done/Cancelled~~ — **DIPUTUSKAN 2026-07-27:** reopen
   → `Open`, next-action/next-date wajib diisi ulang sebelum tersimpan
   (§2.4a), tanpa field alasan reopen terpisah.
7. ~~Kapan Done/Cancelled boleh di-archive~~ — **DIPUTUSKAN 2026-07-27:**
   selalu manual. Tidak ada job/trigger pengarsipan otomatis; `archived`
   tetap toggle eksplisit pengguna (Sales/Manager) kapan pun, sama seperti
   perilaku `archived` saat ini (§1.1/§2.5) — tidak ada perubahan perilaku
   pada mekanisme archive itu sendiri, hanya konfirmasi eksplisit bahwa Task
   16/implementasi tidak boleh menambah pengarsipan otomatis berbasis waktu.

**Ketujuh butir Planning Boundary di implementation plan sekarang seluruhnya
terjawab (#1–#7).** Tidak ada keputusan tersisa yang menghalangi Task 46
ditandai selesai selain persetujuan eksplisit Product Owner atas spesifikasi
final ini secara keseluruhan.

---

## Lampiran: Ringkasan Batasan Sesi Ini

- Sesi ini **tidak** menulis migration, RPC, Edge Function, source code
  aplikasi, atau test implementasi.
- Sesi ini **tidak** menjalankan `supabase db push`, `apply_migration`,
  `execute_sql`, atau mutation remote apa pun.
- Sesi ini **tidak** melakukan commit, push, atau deployment.
- Semua nama kolom/fungsi/tabel di dokumen ini bersifat **usulan bentuk
  kontrak**, tunduk pada finalisasi teks DDL persis di Task 3–5 memakai
  `bunx supabase migration new <nama>` (bukan timestamp yang dikarang).
