# Pengembangan DSM CRM — Keandalan Angka dan Eksekusi Penjualan

Tanggal: 16 Oktober 2026 · Status: **Approved — implementasi belum dimulai**.

## Tujuan

Membuat CRM lebih dapat dipercaya untuk membaca pencapaian, menjaga integritas
transaksi, dan membantu sales menentukan pelanggan serta peluang yang perlu
ditindaklanjuti. Program ini melanjutkan aplikasi yang ada, tanpa rewrite.

Disetujui oleh pemilik produk melalui pesan "dokumen approved" pada 16 Oktober 2026.
Approval mencakup paket dokumen dan default D01–D08 sebagai baseline pengembangan.
Implementasi belum dimulai; approval ini tidak membuktikan acceptance criteria
lulus atau memberi izin otomatis untuk migration produksi, push, atau deployment.

## Peta dokumen

| Dokumen                                                                            | Fungsi                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Spec](../specs/crm-reliability-and-growth.md)                                     | Perilaku, kontrak data, acceptance criteria, dan keputusan yang diterima |
| [Plan](../tasks/crm-reliability-and-growth-plan.md)                                | Urutan implementasi, file sasaran, verifikasi, dan release gates         |
| [Checklist](../tasks/crm-reliability-and-growth-todo.md)                           | Status eksekusi per task                                                 |
| [ADR-005 Accepted](decisions/ADR-005-proposed-crm-metric-and-command-contracts.md) | Alasan pilihan arsitektur dan alternatifnya                              |

Otoritas saat ini tetap [PRD](../PRD.md), ADR-001 sampai ADR-004, dan aturan
komersial/otorisasi yang telah diterima. Spec yang disetujui mengatur
hanya delta scope program ini. Plan menjelaskan cara implementasi, bukan menambah
requirement. Konflik terhadap aturan lama harus diputuskan eksplisit; bukan
diselesaikan hanya berdasarkan tanggal dokumen.

## Dasar rekomendasi dan batas bukti

Baseline sumber: commit `fc58877`, diperiksa 16 Oktober 2026.

| Temuan                                                                                                   | Tingkat bukti                                                 | Implikasi                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reports mencampur rentang KPI dengan tahun pada Top Customers; share menggunakan denominator KPI         | [Pasti] inspeksi source                                       | Samakan kontrak periode dan denominator                          |
| Revenue aplikasi dihitung dari nilai SO, bukan bukti penerimaan pembayaran                               | [Pasti] source dan PRD                                        | Perjelas label; jangan mengubah aturan pencapaian diam-diam      |
| Edit header SO dan pencatatan aktivitas memakai permintaan terpisah                                      | [Pasti] source                                                | Jadikan koreksi dan audit satu transaksi                         |
| Jalur taut manual memvalidasi client/status quotation; konsistensi validasi create/edit perlu pembuktian | [Kemungkinan Besar] risiko dari source                        | Uji negatif sebelum menentukan patch database                    |
| Forecast memakai bobot tetap tanpa tanggal perkiraan closing                                             | [Pasti] source                                                | Bedakan potensi pipeline dan forecast per periode                |
| Pending SO sudah ditandai di Pipeline                                                                    | [Pasti] source diverifikasi pada penyusunan dokumen           | Perluas ke antrean tindakan; jangan membuat status duplikat      |
| Mayoritas revenue berasal dari existing customer                                                         | Konteks PRD sekitar 80%, belum divalidasi ulang pada produksi | Pilot repeat-order harus mengukur relevansi terhadap data aktual |
| Win/loss, cycle time, task exceptions, CI dan RLS tests sudah ada                                        | [Pasti] source                                                | Reuse, bukan bangun ulang                                        |

Verifikasi pada audit sebelumnya dalam sesi ini: `bun run typecheck` lulus dan
43 tes terarah pada tujuh file lulus. Belum menjalankan seluruh suite, browser
produksi, migrasi remote, atau restore backup. Angka itu bukan bukti kesiapan
release program baru. Tidak ada perubahan kode aplikasi selama audit.

## Urutan nilai bisnis

| Tahap                  | Deliverable                                                     | Ukuran keberhasilan                                                          |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A — Kepercayaan data   | Reports konsisten, definisi metrik, koreksi SO atomik           | Rekonsiliasi angka lulus; audit failure tidak meninggalkan perubahan parsial |
| B — Kendali peluang    | Forecast per periode, backlog Won tanpa SO, sinyal deal stagnan | Setiap angka dapat ditelusuri; antrean menunjukkan pemilik dan tindakan      |
| C — Repeat order       | Pola order pelanggan dan prioritas tindak lanjut                | Alasan sinyal dapat dijelaskan; sampel minim tidak menghasilkan prediksi     |
| D — Adopsi dan operasi | Alur ringkas, bukti backup/restore, evaluasi AI                 | Lebih sedikit langkah; pemulihan terbukti; ringkasan tidak mengarang fakta   |

Tahap D untuk pemulihan operasional dimulai sejak A dan menjadi gate sebelum
migrasi produksi. AI dan integrasi Finance tidak mendahului perbaikan angka.
Tidak ada janji tanggal selesai atau kenaikan revenue sebelum baseline tersedia.

## Pengalaman yang dituju

1. Sales membuka Tasks/Dashboard dan melihat alasan prioritas: deal mendekati
   closing, quotation kedaluwarsa, Won tanpa SO, atau repeat order terlambat.
2. Membuka sumber terkait dengan konteks client, owner, nilai, tanggal, dan aksi.
3. Mencatat hasil dan next action melalui mekanisme task/follow-up yang sudah ada.
4. Manager melihat exception tim; Executive tetap pada informasi agregat yang
   diizinkan. Super Admin tidak berubah menjadi pemilik sales.
5. Reports menggunakan angka, periode, filter, dan snapshot export yang sama.

## Keputusan yang disetujui

Pilihan lengkap ada di bagian D01–D08 pada spec. Yang paling memengaruhi scope:

- Label metrik SO dan perlakuan target pada rentang parsial.
- Batas edit SO yang telah ditautkan ke quotation.
- Periode forecast dan sumber timestamp Closed Won yang andal.
- Kecukupan histori serta ambang repeat order untuk pilot.
- Batas kehilangan data dan waktu pemulihan yang dapat diterima bisnis.

Default D01–D08 diterima melalui approval paket dokumen. Aturan tersebut menjadi
baseline implementasi, bukan klaim bahwa aplikasi sudah menerapkannya. Perubahan
berikutnya harus dicatat sebagai revisi keputusan.

## Yang ditunda

Integrasi invoice/pembayaran/produksi, perubahan hubungan quotation menjadi
one-to-many, otomatisasi pesan WhatsApp/email, AI yang menulis data bisnis,
PWA/offline write, serta redesign besar. Masing-masing memerlukan spec tersendiri.
Riwayat produk/harga tetap kandidat lanjutan; tidak masuk MVP repeat-order.

## Pelacakan hasil pilot

Catat baseline minimal dua minggu kerja sebelum menetapkan target perbaikan:
jumlah Won tanpa SO, usia backlog, peluang tanpa next action, waktu menyelesaikan
satu follow-up, dan sinyal repeat-order yang dinilai relevan/tidak relevan oleh
sales. Bandingkan periode dan scope pengguna yang sama. Kenaikan revenue bukan
otomatis akibat fitur; hindari klaim kausal dari pilot kecil.

## Pemeliharaan dokumentasi

Checklist lama tidak dihapus atau ditandai selesai massal. Saat implementasi,
tandai rencana lama yang overlap dengan rujukan penggantinya. Setiap release
mencatat commit, bukti lokal, CI, migrasi remote, deployment, dan browser smoke
secara terpisah. Dokumen yang belum diverifikasi diberi status jelas.
