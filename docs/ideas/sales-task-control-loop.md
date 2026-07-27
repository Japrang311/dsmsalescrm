# Sales Task Control Loop

## Status

Final — disetujui pemilik produk pada 2026-07-27.

Dokumen ini menetapkan arah produk. Dokumen ini belum memberikan izin untuk
implementasi, migration, perubahan Supabase remote, atau deployment.

## Problem Statement

Bagaimana memastikan setiap aktivitas Sales dan Manager selalu memiliki
progress, next action, tenggat, dan jalur eskalasi tanpa membuat pencatatan
lebih berat daripada pekerjaan Sales itu sendiri?

Task bukan hanya turunan Quotation atau Sales Order. Task adalah pusat eksekusi
seluruh aktivitas Sales, termasuk perencanaan proyek baru, kunjungan atau
pertemuan dengan Client, follow-up, pekerjaan komersial, serta aktivitas
internal.

## Recommended Direction

Bangun satu alur vertikal bernama **Sales Task Control Loop**. Setiap Task aktif
harus terus bergerak melalui progress note, next action, dan tanggal berikutnya.
Progress disimpan sebagai timeline permanen agar riwayat aktivitas tidak
ditimpa.

Manager memiliki dua fungsi:

- **My Tasks** — Manager bekerja sebagai Sales dan tunduk pada aturan Task yang
  sama.
- **Team Exceptions** — Manager mengawasi Task Sales yang sudah melewati ambang
  eskalasi.

Executive menerima visibilitas read-only terhadap Task milik Manager yang sudah
melewati ambang eskalasi. Super Admin tidak masuk ke rantai pengawasan bisnis
karena perannya administratif, bukan atasan proses penjualan.

Fitur ini adalah evolusi dari sistem Task yang sudah ada, bukan fitur paralel.
Implementasi harus memakai dan memigrasikan kemampuan Task, `activity_log`, dan
`follow_up_logs` yang relevan; jangan membangun modul Task atau penyimpanan Notes
kedua.

## Roles and Visibility

### Sales

- Membuat dan mengelola Task miliknya sendiri.
- Menambahkan progress note.
- Menentukan next action dan tanggal berikutnya.
- Melihat Task yang upcoming, jatuh tempo, dan overdue.
- Tetap menjadi owner ketika Task tereskalasi.

### Manager

- Memiliki seluruh kemampuan Sales untuk Task miliknya sendiri.
- Melihat **My Tasks** secara terpisah dari Task tim.
- Melihat **Team Exceptions** untuk Task Sales yang tereskalasi.
- Membaca timeline Task tim sesuai kewenangan perusahaan.
- Tidak otomatis mengambil alih ownership Task Sales.

### Executive

- Tidak mengelola Task operasional.
- Melihat detail secara read-only hanya untuk Task milik Manager yang sudah
  tereskalasi.
- Tetap dapat menerima metrik Task agregat tingkat perusahaan yang diperlukan
  Dashboard dan Reports, tanpa memperoleh detail Task operasional lain melalui
  exception view.
- Tidak mengubah owner, status, note, next action, atau tanggal Task.
- Pemisahan akses agregat dan detail harus ditegakkan di database/RLS atau
  interface server yang setara, bukan hanya dengan menyembunyikan menu.

### Super Admin

- Tidak menjadi pemilik atau pengawas Task bisnis.
- Kewenangan administratif tidak boleh digunakan sebagai pengganti rantai
  eskalasi Sales.
- Hak koreksi bisnis company-wide yang sudah diterima dalam ADR-002 tetap
  dipertahankan selama koreksi tidak menjadikan Super Admin sebagai owner,
  anggota performance, atau penerima eskalasi.

## MVP Scope

### Task identity

- Owner wajib dan hanya dapat menunjuk Sales atau Manager aktif sesuai aturan
  ownership yang berlaku.
- Relasi ke Client, Quotation, dan Sales Order bersifat opsional.
- Task dapat berdiri sendiri untuk aktivitas seperti project planning,
  prospecting, persiapan meeting, atau pekerjaan internal.
- Client opsional harus berlaku konsisten pada schema Task, progress/follow-up
  history, audit event, tipe data, form, filter, dan tampilan; tidak cukup hanya
  menghapus validasi pada form.

### Categories

Task memakai kategori terstruktur dengan judul bebas:

- Project/Opportunity Planning
- Client Meeting/Visit
- Follow-Up
- Quotation
- Sales Order
- Internal/Admin
- Other

### Workflow status

- Open
- In Progress
- Waiting External
- Done
- Cancelled

Task berstatus Waiting External tetap wajib memiliki tanggal follow-up.
Waiting External bukan cara untuk menghentikan pengawasan.

Workflow status tidak boleh dicampur dengan posisi Task terhadap tanggal.
`Today`, `Upcoming`, `Overdue`, dan `Escalated` adalah **due state** yang
diturunkan dari tanggal, zona waktu, serta kalender kerja; nilai-nilai tersebut
bukan workflow status yang dipilih pengguna.

Implementasi harus memigrasikan enum/status lama dengan aman dan memperbarui
semua consumer Dashboard, Reports, Pipeline, Client Detail, ownership transfer,
dan test yang masih memakai status lama. Jangan mengganti enum tanpa audit
consumer.

### Progress timeline

- Satu Task dapat memiliki banyak progress note.
- Setiap note menyimpan isi, penulis, dan waktu pencatatan.
- Note lama tidak boleh tertimpa atau hilang tanpa jejak audit.
- Perubahan status, next action, tanggal, dan owner harus dapat ditelusuri.
- Notes dan follow-up yang saat ini tersebar pada `activity_log` dan
  `follow_up_logs` harus disatukan sebagai satu pengalaman timeline.
- Jangan menambah tabel atau store Notes ketiga sebelum spec membuktikan bahwa
  dua sumber lama tidak dapat direkonsiliasi.
- Satu aksi progress harus atomik: penyimpanan note, next action, tanggal, serta
  perubahan workflow status tidak boleh berhasil sebagian.

### Next-action enforcement

- Setiap progress note pada Task aktif wajib disertai next action dan tanggal
  berikutnya.
- Task Done atau Cancelled tidak memerlukan next action baru.
- Sistem tidak boleh membiarkan Task aktif berhenti sebagai catatan pasif tanpa
  rencana lanjutan.

### Due date and escalation

- Pada hari jatuh tempo, Task ditandai overdue untuk owner.
- Setelah lewat dua hari kerja dan masih aktif, Task masuk jalur eskalasi.
- Task Sales muncul pada Team Exceptions Manager.
- Task Manager muncul pada Exception View Executive secara read-only.
- Eskalasi tidak memindahkan owner.
- Due state dan eskalasi dihitung dari sumber aturan kalender yang sama untuk UI,
  query Manager, query Executive, Dashboard, dan Reports.

### Business-day calendar

- Hari kerja dihitung Senin sampai Jumat.
- Sabtu, Minggu, dan hari libur tidak dihitung dalam ambang dua hari kerja.
- Perhitungan wajib terintegrasi dengan kalender hari libur.
- Sumber kalender, mekanisme sinkronisasi, fallback, dan pengelolaan koreksi
  harus diputuskan dalam spesifikasi teknis sebelum implementasi.
- Kegagalan sinkronisasi kalender tidak boleh diam-diam menghasilkan tenggat
  yang salah.
- Zona waktu bisnis adalah Asia/Jakarta.
- Logika hari kerja harus dipusatkan; komponen UI tidak boleh menghitung aging
  atau snooze dengan penambahan hari kalender masing-masing.

### Cancelled and archived

- Cancelled adalah hasil workflow: pekerjaan dihentikan dan alasan pembatalan
  harus tercatat.
- Archived adalah pilihan tampilan/retensi untuk menyembunyikan record lama dari
  inbox tanpa mengubah hasil workflow.
- Done, Cancelled, dan Archived tidak boleh diperlakukan sebagai sinonim.

### Existing-data compatibility

- Existing Task tidak boleh diberi Client, kategori, next action, atau status
  hasil fabrikasi.
- Migration/backfill harus memakai data yang benar-benar dapat diturunkan dari
  record lama.
- Record yang tidak dapat dipetakan secara deterministik harus masuk proses
  review atau status kompatibilitas yang eksplisit.
- Ownership transfer, account lifecycle, Dashboard, Reports, Pipeline, Client
  Detail, Activity Log, dan test suite harus diaudit sebagai consumer sebelum
  status lama dipensiunkan.

## Primary User Flow

1. Sales atau Manager membuka Task miliknya.
2. Owner menambahkan progress note.
3. Jika Task masih aktif, sistem mewajibkan next action dan tanggal berikutnya.
4. Jika menunggu pihak luar, owner memilih Waiting External dan menentukan
   tanggal follow-up.
5. Sistem menyimpan note dan perubahan sebagai timeline permanen.
6. Pada jatuh tempo, Task ditandai overdue.
7. Setelah dua hari kerja, Task muncul pada exception view sesuai rantai
   eskalasi.
8. Pengawas membaca konteks timeline tanpa mengambil ownership secara otomatis.

## Success Criteria

- 100% Task aktif memiliki next action dan tanggal berikutnya.
- Tidak ada Task terlambat lebih dari dua hari kerja yang tidak terlihat oleh
  pengawas yang berwenang.
- Sabtu, Minggu, dan hari libur tidak menambah hitungan hari eskalasi.
- Riwayat progress dapat ditelusuri tanpa note lama tertimpa.
- Satu progress update tidak dapat meninggalkan note tersimpan tanpa next action
  terkait, atau sebaliknya.
- Sales dan Manager dapat menemukan pekerjaan hari ini tanpa membaca seluruh
  daftar.
- Manager melihat pengecualian yang perlu perhatian, bukan notifikasi untuk
  seluruh aktivitas.
- Executive hanya memperoleh detail read-only terhadap eskalasi Manager, tetapi
  metrik agregat perusahaan tetap tersedia bagi Dashboard/Reports.
- Super Admin dapat melakukan koreksi yang didukung tanpa menjadi owner,
  anggota performance, atau penerima eskalasi.
- Existing Task dapat dimigrasikan tanpa fabrikasi data bisnis.

## Key Assumptions to Validate

- [ ] Sales dan Manager mencatat progress saat aktivitas terjadi, bukan
      merekonstruksinya belakangan.
- [ ] Form progress cukup cepat sehingga pengguna tidak kembali mencatat di
      WhatsApp, spreadsheet, atau buku.
- [ ] Ambang dua hari kerja sesuai untuk mayoritas aktivitas.
- [ ] Waiting External tidak digunakan untuk menghindari eskalasi.
- [ ] Manager dan Executive benar-benar menindaklanjuti exception view.
- [ ] Sumber kalender hari libur dapat dipercaya dan memiliki fallback yang
      jelas.
- [ ] Dashboard dan Reports tetap benar setelah workflow status dipisahkan dari
      due state.
- [ ] Timeline terpadu tidak menggandakan event dari `activity_log` dan
      `follow_up_logs`.

## MVP Risks

- Terlalu banyak field wajib mendorong pengguna kembali ke pencatatan di luar
  aplikasi.
- Pengguna menulis note asal-asalan hanya untuk lolos validasi.
- Semua keterlambatan dianggap sama pentingnya sehingga exception view menjadi
  bising.
- Waiting External dipakai sebagai jalan pintas untuk menghindari eskalasi.
- Kalender hari libur tidak sinkron dan menghasilkan eskalasi terlalu cepat
  atau terlalu lambat.
- Aturan akses hanya diterapkan di UI dan tidak ditegakkan oleh RLS/database.
- Status lama diganti tanpa memperbarui consumer sehingga KPI, ownership
  transfer, atau daftar overdue menjadi salah.
- Notes baru ditambahkan sebagai sumber ketiga dan menghasilkan timeline ganda.
- Executive kehilangan metrik agregat yang masih diperlukan, atau sebaliknya
  tetap dapat membaca seluruh detail Task.

## Not Doing

- **AI next-action recommendation** — timeline belum memiliki data konsisten
  yang cukup.
- **WhatsApp atau email notification** — MVP memakai notifikasi di dalam
  aplikasi.
- **Dashboard analitik lengkap** — tunggu 2–4 minggu data penggunaan nyata.
- **Pemindahan owner otomatis** — eskalasi memberi visibilitas, bukan
  memindahkan tanggung jawab.
- **Template kategori kompleks** — berisiko menambah beban input.
- **Attachment dan chat real-time** — bukan penyebab utama follow-up terputus.
- **Super Admin sebagai pengawas Sales** — bertentangan dengan batas peran
  administratif yang sudah diterima.
- **Tabel/store Notes ketiga** — memperbesar fragmentasi timeline yang sudah
  tersebar.
- **Penghapusan Archive** — Archive tetap dibutuhkan sebagai pengaturan inbox
  dan tidak digantikan oleh Cancelled.

## Compatibility Guardrails

1. Pisahkan workflow status dari due state.
2. Satukan pengalaman timeline dari penyimpanan yang ada; jangan membuat sumber
   Notes ketiga.
3. Terapkan Client opsional secara end-to-end.
4. Pisahkan metrik agregat Executive dari akses detail exception.
5. Pertahankan hak koreksi Super Admin sesuai ADR-002 tanpa ownership,
   performance, atau escalation membership.
6. Bedakan Cancelled dari Archived.
7. Pusatkan perhitungan hari kerja dan kalender libur.
8. Migrasikan existing Task tanpa fabrikasi data.

## Required Next Step

Gunakan proses spec-driven development untuk mengubah arah produk ini menjadi
spesifikasi implementasi dan acceptance criteria. Spec wajib memulai dari audit
consumer status, timeline yang sudah ada, schema/RLS, dan existing data. Jangan
langsung mengubah schema atau UI dari dokumen ide ini.
