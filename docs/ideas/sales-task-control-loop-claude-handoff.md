# Claude Handoff — Sales Task Control Loop

## Purpose

Dokumen ini adalah entrypoint untuk melanjutkan desain **Sales Task Control
Loop** di Claude Code. Arah produk sudah final, tetapi implementasi belum
diotorisasi oleh dokumen ini.

Dokumen sumber:

- `docs/ideas/sales-task-control-loop.md`
- `docs/prompts/2026-07-27-claude-sales-task-control-loop-task-46.md`
- `CLAUDE.md`
- `AGENTS.md`
- `HANDOFF.md`
- `docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md`

## Current Product Decision

Task menjadi pusat eksekusi semua aktivitas Sales dan Manager, bukan hanya
turunan Quotation atau Sales Order.

Keputusan yang sudah final:

- Manager adalah Sales sekaligus pengawas tim.
- Owner Task wajib; Client, Quotation, dan Sales Order opsional.
- Task memakai kategori terstruktur dan judul bebas.
- Progress note disimpan sebagai timeline permanen dengan penulis dan waktu.
- Setiap progress pada Task aktif wajib mempunyai next action dan tanggal.
- Waiting External tetap wajib mempunyai tanggal follow-up.
- Task overdue lebih dari dua hari kerja masuk exception view.
- Task Sales tereskalasi ke Manager.
- Task Manager tereskalasi ke Executive secara read-only.
- Eskalasi tidak memindahkan owner.
- Hari kerja adalah Senin–Jumat dan wajib mengecualikan hari libur melalui
  integrasi kalender.
- Super Admin bukan bagian dari rantai eskalasi bisnis.
- Workflow status (`Open`, `In Progress`, `Waiting External`, `Done`,
  `Cancelled`) terpisah dari due state (`Upcoming`, `Today`, `Overdue`,
  `Escalated`).
- Cancelled adalah hasil workflow; Archived tetap menjadi pilihan tampilan dan
  retensi.
- Executive tetap dapat menerima metrik Task agregat tingkat perusahaan, tetapi
  detail exception hanya untuk Task Manager yang tereskalasi.
- Super Admin mempertahankan hak koreksi bisnis yang sudah diterima dalam
  ADR-002 tanpa menjadi owner, anggota performance, atau penerima eskalasi.

## Hard Boundaries

- Jangan mengimplementasikan sebelum spesifikasi dan acceptance criteria
  dikonfirmasi pemilik produk.
- Jangan menjalankan migration atau mutation terhadap Supabase remote.
- Jangan menjalankan `supabase db push --linked` tanpa persetujuan baru yang
  menyebut project target dan command secara eksplisit.
- Jangan mengandalkan filtering UI sebagai security boundary. Aturan role dan
  visibility harus ditegakkan di database/RLS.
- Jangan memberikan hak edit Task kepada Executive.
- Jangan menjadikan Super Admin sebagai owner atau pengawas Task bisnis.
- Jangan menghapus hak koreksi Super Admin yang sudah diterima ADR-002 hanya
  karena Super Admin dikeluarkan dari ownership/escalation.
- Jangan memulihkan RFQ sebagai fitur aktif.
- Jangan menambahkan AI, WhatsApp/email notification, analytics dashboard
  lengkap, auto-transfer owner, attachment, atau real-time chat ke MVP.
- Jangan memilih layanan kalender eksternal secara diam-diam. Bandingkan sumber
  kalender, kegagalan sinkronisasi, fallback, dan biaya operasional dalam spec.
- Jangan menggunakan `Today`, `Upcoming`, `Overdue`, atau `Escalated` sebagai
  workflow status yang dipilih pengguna.
- Jangan membuat tabel/store Notes ketiga. Rekonsiliasi `activity_log` dan
  `follow_up_logs` menjadi satu pengalaman timeline terlebih dahulu.
- Jangan membuat progress update sebagai rangkaian write independen yang dapat
  berhasil sebagian.
- Jangan membuat Client opsional hanya di UI; perubahan harus konsisten pada
  schema, RLS, data layer, history, filter, dan consumer.
- Jangan menghapus Archive atau menyamakannya dengan Cancelled.
- Jangan memberi existing Task nilai Client, kategori, next action, atau status
  hasil fabrikasi.
- Jangan mencabut metrik agregat Executive secara tidak sengaja ketika membatasi
  akses detail Task.
- Pertahankan perubahan secara sempit; jangan refactor area komersial yang tidak
  diperlukan.

## Existing Implementation Constraints

Audit source 2026-07-27 menemukan:

- `public.task_status` saat ini berisi `Today`, `Overdue`, `Upcoming`, `Done`.
- Sebagian UI menurunkan overdue dari `due_date`, sementara Dashboard/Reports
  masih membaca status tersimpan.
- Task Detail sudah menyimpan catatan ke `activity_log`.
- Follow-up menyimpan notes, result, next action, dan next date ke
  `follow_up_logs`.
- Task history saat ini belum menyatukan kedua sumber tersebut.
- `tasks.client_id` dan `follow_up_logs.client_id` masih wajib.
- RLS saat ini memberi Executive akses baca ke seluruh Task/follow-up.
- Database sudah mengizinkan Sales dan Manager aktif sebagai business owner.
- UI Manager masih berorientasi Team Tasks dan belum mempunyai My Tasks serta
  Team Exceptions yang terpisah.
- Super Admin saat ini dapat melakukan supported company-wide task correction
  tanpa menjadi owner.
- Belum ada sumber kalender hari libur atau fungsi hari kerja terpusat.

Perbedaan di atas adalah migration/compatibility work, bukan alasan untuk
membangun modul paralel.

## Required Claude Workflow

1. Baca seluruh dokumen sumber yang tercantum di atas.
2. Rekonsiliasi kondisi repo saat ini:
   - `git status --short --branch`
   - recent `git log`
   - struktur Task UI/data layer saat ini
   - migrations dan RLS Task yang sudah ada
3. Petakan kemampuan Task yang sudah tersedia dan gap terhadap one-pager.
   Audit minimal mencakup semua consumer status lama:
   - Task route dan components;
   - Dashboard selectors/widgets;
   - Reports;
   - Pipeline;
   - Client Detail;
   - ownership transfer dan account lifecycle;
   - Activity Log/follow-up history;
   - RLS tests dan data-layer tests.
4. Gunakan workflow spec-driven development.
5. Buat spec terlebih dahulu; jangan implementasi.
6. Dalam spec, jelaskan dengan bahasa sederhana:
   - perubahan data model dan migration existing Task;
   - pemisahan workflow status dan due state;
   - aturan next action;
   - timeline terpadu dari `activity_log`/`follow_up_logs`;
   - atomicity progress update;
   - pemisahan My Tasks, Team Exceptions, dan Executive Exceptions;
   - matriks akses UI serta RLS, termasuk agregat vs detail Executive;
   - hak koreksi Super Admin sesuai ADR-002;
   - algoritma dua hari kerja;
   - opsi sumber kalender hari libur, sinkronisasi, fallback, dan koreksi;
   - migration/backfill untuk Task lama;
   - acceptance criteria dan rencana verifikasi.
7. Surface setiap konflik antara dokumen dan kode. Jangan memilih sendiri jika
   konflik mengubah aturan bisnis.
8. Minta persetujuan eksplisit pemilik produk atas spec sebelum membuat plan
   implementasi atau kode.

## Questions the Specification Must Resolve

### Existing-task migration

- Bagaimana Task lama yang belum memiliki kategori, next action, atau status
  baru akan dipetakan?
- Apakah Task lama boleh tetap aktif jika belum mempunyai next action?
- Bagaimana backfill dilakukan tanpa membuat data bisnis palsu?
- Consumer mana yang masih bergantung pada `Today`, `Upcoming`, `Overdue`, dan
  `Done`, serta bagaimana transisinya dilakukan tanpa merusak KPI?

### Timeline integrity

- Bagaimana `activity_log` dan `follow_up_logs` ditampilkan sebagai satu timeline
  tanpa event ganda?
- Penyimpanan mana yang tetap canonical untuk progress domain dan mana yang
  menjadi audit event?
- Bagaimana satu aksi progress dibuat atomik?
- Note bersifat immutable; koreksi dilakukan melalui entri koreksi baru.
- Event apa saja selain note yang masuk timeline?
- Bagaimana audit actor dan timestamp ditegakkan di database?

### Escalation

- Apakah ambang dua hari kerja dihitung setelah akhir tanggal jatuh tempo atau
  pada awal hari kerja berikutnya?
- Bagaimana zona waktu Asia/Jakarta ditegakkan?
- Bagaimana Task yang kembali dibuka dari Done diperlakukan?
- Bagaimana Task Cancelled dicatat dan apakah alasan pembatalan wajib?
- Bagaimana Executive tetap menerima agregat perusahaan tanpa dapat membuka
  detail Task selain eskalasi Manager?

### Holiday calendar

- Apa sumber kalender hari libur yang otoritatif?
- Apakah kalender disimpan di database, disinkronkan dari provider, atau
  dikelola oleh admin?
- Bagaimana cuti bersama diperlakukan?
- Apa fallback jika provider tidak tersedia?
- Bagaimana koreksi kalender diterapkan tanpa mengubah histori eskalasi secara
  membingungkan?

### Notifications

- Di mana indikator in-app ditampilkan?
- Apakah exception dihitung saat query atau dipersist sebagai event?
- Bagaimana mencegah notifikasi duplikat dan alert fatigue?

### Cancelled versus archived

- Bagaimana Task Cancelled dikeluarkan dari active work tanpa otomatis
  mengarsipkannya?
- Kapan Task Done atau Cancelled boleh diarsipkan?
- Bagaimana alasan Cancelled disimpan dan ditampilkan pada timeline?

## Minimum Acceptance Criteria

- Sales dan Manager dapat membuat Task mandiri tanpa Client atau dokumen
  komersial.
- Owner Task hanya Sales atau Manager aktif sesuai aturan yang disetujui.
- Task aktif tidak dapat menerima progress update tanpa next action dan tanggal.
- Waiting External tidak dapat disimpan tanpa tanggal follow-up.
- Progress note menyimpan actor dan timestamp serta tidak hilang saat Task
  diperbarui.
- Timeline tidak menggandakan event dari `activity_log` dan `follow_up_logs`.
- Progress note, next action, tanggal, serta perubahan workflow status tersimpan
  secara atomik.
- Sabtu, Minggu, dan hari libur tidak dihitung dalam ambang eskalasi.
- Task Sales yang melewati ambang terlihat oleh Manager.
- Task Manager yang melewati ambang terlihat read-only oleh Executive.
- Executive tidak dapat membuat atau mengubah Task melalui UI maupun akses
  database.
- Executive dapat menerima metrik agregat perusahaan tanpa mendapat detail Task
  operasional selain eskalasi Manager.
- Super Admin tidak masuk ke ownership/performance/escalation Task, tetapi hak
  koreksi yang sudah diterima ADR-002 tidak diregresikan.
- Cancelled dan Archived mempunyai arti serta perilaku berbeda.
- Semua consumer status lama telah diaudit dan tidak lagi menghasilkan KPI,
  overdue, atau ownership-transfer yang salah.
- Semua aturan role diuji pada level RLS, bukan hanya komponen React.
- Existing Task tetap dapat direkonsiliasi tanpa fabrikasi data bisnis.
- Test, typecheck, lint yang relevan, build, dan runtime verification harus
  lulus sebelum fitur dinyatakan selesai.

## Copy-Paste Prompt for Claude

```text
Baca terlebih dahulu:
- CLAUDE.md
- AGENTS.md
- HANDOFF.md
- docs/ideas/sales-task-control-loop.md
- docs/ideas/sales-task-control-loop-claude-handoff.md
- docs/decisions/ADR-002-super-admin-authorization-and-account-lifecycle.md

Tugas Anda saat ini hanya menyusun spesifikasi Sales Task Control Loop dengan
workflow spec-driven development. Jangan implementasi, jangan membuat migration,
dan jangan melakukan mutation terhadap Supabase remote.

Mulai dengan merekonsiliasi kondisi Git, Task UI/data layer, migration, grants,
dan RLS yang ada. Petakan kemampuan yang sudah tersedia versus gap pada
one-pager. Audit seluruh consumer status `Today`/`Upcoming`/`Overdue`/`Done`.
Lalu buat spesifikasi yang mencakup pemisahan workflow status dari due state,
timeline terpadu tanpa tabel Notes ketiga, progress update atomik, Client
opsional end-to-end, perbedaan Cancelled dan Archived, My Tasks Manager, Team
Exceptions, detail Manager-escalation yang read-only untuk Executive sambil
mempertahankan metrik agregat perusahaan, hak koreksi Super Admin sesuai
ADR-002, perhitungan dua hari kerja Senin-Jumat yang mengecualikan kalender hari
libur, strategi existing-task migration tanpa fabrikasi, acceptance criteria,
dan verifikasi.

Jangan memilih provider kalender atau membuat data backfill palsu secara
diam-diam. Jangan membuat sumber Notes ketiga atau mengganti enum status tanpa
mengaudit consumer. Surface konflik dan pertanyaan yang dapat mengubah aturan
bisnis. Minta persetujuan eksplisit saya atas spec sebelum membuat
implementation plan.
```

## Expected Deliverable from Claude

Satu dokumen spesifikasi yang dapat ditinjau pemilik produk, idealnya di:

`docs/superpowers/specs/2026-07-27-sales-task-control-loop-design.md`

Dokumen tersebut harus tetap berstatus draft sampai pemilik produk memberikan
persetujuan eksplisit.
