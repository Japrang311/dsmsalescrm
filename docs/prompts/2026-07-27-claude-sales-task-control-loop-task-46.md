# Claude Execution Prompt — Sales Task Control Loop Task 46

## Usage

Copy the prompt below into a fresh Claude Code session. This prompt authorizes
Claude to execute only the technical-specification gate, corresponding to
feature-plan Task 1 and project-tracker Task 46.

It does not authorize source-code implementation, SQL migration creation,
Supabase mutation, Git commit/push, or deployment.

## Copy-Paste Prompt

```text
Anda bekerja pada repository:

/Users/macbook/Library/CloudStorage/GoogleDrive-adhitya.wirambara@gmail.com/My Drive/Project/DSM SALES CRM

TUJUAN SESI

Eksekusi hanya Sales Task Control Loop Task 46 / implementation-plan Task 1:
menyusun dan menuntaskan draft spesifikasi teknis untuk persetujuan Product
Owner.

Jangan mulai Task 47 atau implementation-plan Task 2. Jangan menulis source
code, migration SQL, RPC, Edge Function, test implementasi, atau UI pada sesi
ini.

ATURAN KERJA WAJIB

1. Baca penuh sebelum bertindak:
   - AGENTS.md
   - CLAUDE.md
   - HANDOFF.md
   - /Users/macbook/.agents/skills/using-agent-skills/SKILL.md
   - /Users/macbook/.codex/skills/graphify/SKILL.md
   - docs/ideas/sales-task-control-loop.md
   - docs/ideas/sales-task-control-loop-claude-handoff.md
   - docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md
   - docs/superpowers/plans/2026-07-27-sales-task-control-loop-implementation.md
   - tasks/sales-task-control-loop-todo.md
   - tasks/plan.md bagian Phase 13
   - tasks/todo.md bagian Phase 13

2. Gunakan using-agent-skills untuk memilih workflow. Karena hasil sesi ini
   adalah spesifikasi, gunakan spec-driven-development. Karena desain menyentuh
   Supabase, baca dan patuhi skill Supabase yang tersedia sebelum membuat
   keputusan schema, RLS, grants, view, atau function.

3. Gunakan Graphify sebagai peta awal untuk menghemat context/token:
   - cek `graphify-out/graph.json` dan `graphify-out/GRAPH_REPORT.md`;
   - jika `graphify-out/graph.json` tersedia dan tidak ada
     `graphify-out/.needs_update`, jangan rebuild graph;
   - jalankan beberapa query sempit, bukan satu query besar, masing-masing
     memakai budget maksimal 800-1200 token;
   - query minimal:

     graphify query "Trace TaskStatus and every Dashboard, Reports, TopBar, Pipeline, Client Detail, export, and account-lifecycle consumer" --budget 1200

     graphify query "Trace Task notes and follow-up writes through tasks, follow_up_logs, activity_log, UI dialogs, and timeline readers" --budget 1000

     graphify query "Trace Task ownership and visibility for Sales, Manager, Executive, and Super Admin through migrations, grants, RLS, and tests" --budget 1000

   - gunakan `source_location` hasil Graphify untuk menentukan file dan bagian
     source yang perlu dibaca;
   - jangan memuat seluruh graph.json ke context dan jangan membaca seluruh repo
     secara linear;
   - jika hasil query terlalu luas, sempitkan pertanyaan atau gunakan
     `graphify path`/`graphify explain`, bukan menambah budget tanpa batas;
   - Graphify adalah navigation index, bukan source of truth. Verifikasi setiap
     claim penting pada source, migration, atau test aktual;
   - jika `.needs_update` ada, graph tidak tersedia, atau hasilnya jelas stale,
     laporkan kondisi tersebut dan gunakan targeted `rg` + source reads.
     Jangan rebuild/update Graphify secara diam-diam pada sesi specification-only.

4. Rekonsiliasi kondisi repository, jangan percaya handoff atau graph secara
   buta:
   - git status --short --branch
   - git log -5 --oneline --decorate
   - pastikan file plan dan one-pager benar-benar ada
   - jangan reset, checkout, menghapus, atau menimpa perubahan yang sudah ada
   - perlakukan seluruh perubahan existing sebagai milik pengguna

5. Audit source yang relevan sebelum menulis spesifikasi. Mulai dari node dan
   `source_location` Graphify, lalu verifikasi minimal:
   - supabase/migrations/20260717232459_tasks.sql
   - supabase/migrations/20260718030000_tasks_archived.sql
   - supabase/migrations/20260718040000_follow_up_logs.sql
   - supabase/migrations/20260718011409_activity_log.sql
   - migration lanjutan yang mengubah grants/RLS tabel tersebut
   - src/lib/domain.ts
   - src/lib/data/tasks.ts
   - src/lib/data/follow-ups.ts
   - src/lib/data/activity-log.ts
   - src/lib/data/activity-feed.ts
   - src/routes/_app.tasks.tsx
   - src/components/tasks/CreateTaskDialog.tsx
   - src/components/tasks/TaskDetailDrawer.tsx
   - src/components/tasks/LogFollowUpDialog.tsx
   - Dashboard, Reports, TopBar, Pipeline, Client Detail, commercial follow-up,
     exports, ownership transfer, account lifecycle, serta test yang masih
     membaca Today/Upcoming/Overdue/Done

6. Gunakan rg secara targeted untuk melengkapi dan memverifikasi consumer
   inventory Graphify. Cari minimal:
   - TaskStatus
   - Today
   - Upcoming
   - Overdue
   - Done
   - task.status
   - activity_log
   - follow_up_logs
   - setDate(
   - current_user_role

7. Ini planning/specification-only. Perintah read-only dan penulisan dokumen
   spec diperbolehkan. Dilarang:
   - menjalankan atau membuat migration;
   - supabase db push, apply_migration, execute_sql, atau mutation remote;
   - mengubah source code atau test;
   - mengubah .env.local;
   - menambah dependency;
   - commit, push, PR, atau deployment;
   - memulihkan RFQ sebagai fitur aktif;
   - membuat Task module kedua atau Notes store ketiga.

OUTPUT WAJIB

Buat atau revisi:

docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md

Status dokumen harus DRAFT — AWAITING PRODUCT OWNER APPROVAL.

Spesifikasi harus menggunakan bahasa Indonesia yang jelas dan memuat:

1. Current-state audit
   - schema, grants, RLS, data layer, UI, status consumers, timeline sources;
   - konflik spesifik antara kode existing dan one-pager;
   - daftar file/consumer yang harus dimigrasikan.

2. Target domain model
   - satu tabel tasks existing sebagai aggregate;
   - workflow status Open, In Progress, Waiting External, Done, Cancelled;
   - due state Upcoming, Today, Overdue, Escalated sebagai nilai turunan;
   - category terstruktur;
   - owner wajib dan hanya active Sales/Manager;
   - Client, Quotation, dan Sales Order opsional end-to-end;
   - next action dan next date;
   - cancellation reason;
   - Archived terpisah dari Cancelled.

3. Timeline dan atomic progress
   - putuskan sumber canonical progress domain;
   - jelaskan hubungan follow_up_logs dengan activity_log;
   - jangan membuat Notes store ketiga;
   - definisikan satu RPC/transaksi untuk note, next action, next date,
     workflow status, dan audit event;
   - actor/timestamp dari database;
   - immutable history dan mekanisme correction entry;
   - strategi mencegah event ganda.

4. Role/action matrix
   - Sales own Task;
   - Manager sebagai Sales untuk My Tasks dan supervisor untuk Team Exceptions;
   - Executive hanya detail read-only untuk Manager Task yang Escalated;
   - Executive tetap memperoleh aggregate company metrics tanpa row-detail
     leakage;
   - Super Admin mempertahankan supported company-wide correction sesuai
     ADR-002 tetapi tidak menjadi owner, anggota performance, atau penerima
     escalation;
   - enforcement UI, grants, RLS, dan privileged function jika diperlukan.

5. Business calendar
   - Asia/Jakarta;
   - Senin-Jumat;
   - hari libur dan cuti bersama;
   - definisi tepat kapan dua business days terlewati;
   - canonical database calendar;
   - sumber data, provenance, sync/import, fallback, health indicator, dan
     correction behavior;
   - UI tidak menghitung aging dengan Date.setDate() sendiri.

6. Existing-data migration
   - dual-read/compatibility strategy;
   - mapping deterministic untuk status lama;
   - perlakuan Task tanpa category, next action, atau Client yang dapat
     dinull-kan;
   - review state untuk record ambigu;
   - pre/post reconciliation;
   - urutan penghentian enum/status lama setelah semua consumer selesai;
   - rollback strategy.

7. Query dan interface contracts
   - owner Task list;
   - Manager My Tasks;
   - Manager Team Exceptions;
   - Executive Exceptions;
   - Executive aggregate metrics;
   - unified Task timeline;
   - atomic progress mutation;
   - exact React Query cache/invalidation boundaries.

8. Acceptance criteria dan verification matrix
   - schema constraints;
   - RLS langsung melalui Supabase client setiap role;
   - atomic rollback failure;
   - calendar boundaries;
   - selectors/KPI/report/export reconciliation;
   - browser UAT untuk empat role;
   - no-regression RFQ retirement;
   - local versus remote verification dipisahkan.

KEPUTUSAN YANG TIDAK BOLEH DITEBAK

Jika belum ada bukti atau keputusan final mengenai hal berikut, tulis opsi,
trade-off, dan rekomendasi Anda, lalu tanyakan hanya SATU pertanyaan Product
Owner pada satu waktu:

- canonical progress source;
- mapping Task lama yang tidak deterministik;
- authoritative holiday source dan fallback;
- batas waktu tepat untuk escalation;
- notification query-time versus persisted event;
- aturan reopen dari Done/Cancelled;
- kapan Done/Cancelled boleh di-archive.

Jangan menulis beberapa pertanyaan sekaligus. Setelah Product Owner menjawab,
perbarui draft dan lanjut ke pertanyaan berikutnya.

SUPABASE SECURITY RULES

- RLS wajib pada setiap tabel public/exposed.
- UI filtering bukan authorization.
- UPDATE membutuhkan SELECT policy serta USING dan WITH CHECK.
- Jangan memakai user_metadata untuk authorization.
- Jangan memakai SECURITY DEFINER hanya untuk mengatasi error permission.
- Jika aggregate-only Executive benar-benar memerlukan privileged function:
  jelaskan alasannya, lakukan explicit role check, pin search_path, schema
  qualify semua object, revoke EXECUTE from PUBLIC, grant sesempit mungkin,
  jangan mengembalikan row detail, dan wajibkan direct security tests.
- Jangan mengubah hak koreksi Super Admin secara diam-diam.

STOP RULE

Setelah draft spec selesai:

1. Jalankan hanya pemeriksaan dokumentasi:
   - git diff --check
   - git status --short --branch
   - rg untuk memastikan seluruh bagian wajib ada
2. Laporkan:
   - file yang dibuat/diubah;
   - current-state conflicts yang ditemukan;
   - keputusan yang sudah memiliki bukti;
   - keputusan yang masih menunggu Product Owner;
   - verifikasi yang benar-benar dijalankan;
   - konfirmasi bahwa tidak ada source code, migration, database remote, commit,
     push, atau deployment yang dilakukan.
3. Ajukan hanya satu pertanyaan keputusan berikutnya.
4. BERHENTI. Jangan menjalankan Task 47/implementation-plan Task 2 walaupun
   draft terasa lengkap.

Task 46 baru boleh ditandai selesai setelah Product Owner memberi persetujuan
eksplisit terhadap spesifikasi. Setelah persetujuan, tetap berhenti dan minta
otorisasi baru sebelum implementasi.
```

## Expected Claude Result

Claude should leave the repository with only a draft technical specification
and, if necessary, narrowly synchronized documentation. The next interaction
must be a Product Owner decision or approval—not implementation.
