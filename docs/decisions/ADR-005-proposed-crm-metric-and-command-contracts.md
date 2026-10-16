# ADR-005 — Kontrak Metrik dan Command CRM

Status: **Accepted** · Tanggal: 16 Oktober 2026.

[Spec](../../specs/crm-reliability-and-growth.md) ·
[Plan](../../tasks/crm-reliability-and-growth-plan.md)

## Konteks

Reports mempunyai campuran scope periode; edit SO dan audit terpisah; perluasan
forecast dan repeat-order membutuhkan sumber angka yang dapat ditelusuri.
Aplikasi sudah mempunyai RLS, RPC domain, task control loop, dan audit sehingga
rewrite atau workflow engine tambahan belum beralasan.

## Keputusan yang diterima

1. Satukan konteks metrik: periode, filter, basis Nilai SO, dan waktu snapshot.
   UI/export/AI facts menggunakan konteks sama. Target hanya dibandingkan bila
   periodenya dan populasinya sebanding sesuai D02.
2. Mutation SO penting melalui command database atomik dengan audit, concurrency
   check, dan retry deduplication. Validasi tidak bisa dilewati lewat direct API.
3. Tambahkan expected close date secara additive; pertahankan bobot existing dan
   tampilkan Won tanpa SO sebagai backlog terpisah. Tidak mengubah definisi revenue.
4. Bentuk antrean dari exception domain dan task existing; repeat-order memakai
   aturan versioned yang transparan, bukan model AI atau auto-task massal.
5. Gunakan server aggregation dan pagination; role/ownership tetap mengikuti
   ADR-002. Tidak ada role baru, service-role client, atau akses tambahan untuk Executive.

## Alternatif yang dipertimbangkan

| Alternatif                             | Alasan tidak dipilih untuk proposal                                 |
| -------------------------------------- | ------------------------------------------------------------------- |
| Memperbaiki label Reports saja         | Tidak memperbaiki numerator/denominator yang berbeda periode        |
| Audit dari browser setelah save        | Masih bisa gagal sebagian dan dilewati direct write                 |
| Mengubah revenue menjadi cash received | Membutuhkan model invoice/payment dan keputusan bisnis baru         |
| Menambah probability AI sejak awal     | Histori dan outcome belum cukup dibuktikan; sulit menjelaskan hasil |
| Membuat task engine baru               | Mendobelkan control loop yang sudah ada                             |
| Mengganti stack/rewrite                | Tidak diperlukan untuk menyelesaikan gap yang ditemukan             |

## Konsekuensi

Ada migration additive, pengujian concurrency/RLS, dan pekerjaan legacy review.
Database command lebih kompleks daripada update langsung, tetapi menjaga data dan
audit dalam satu boundary. Retry ledger memerlukan retensi dan akses private.
Target parsial dan data yang belum cukup akan lebih sering ditampilkan sebagai
tidak dapat dibandingkan, bukan angka yang tampak pasti.

## Catatan penerimaan

Disetujui oleh pemilik produk melalui pesan "dokumen approved" pada 16 Oktober 2026.
Approval mencakup paket dokumen dan default D01–D08 sebagai baseline pengembangan.
Implementasi belum dimulai; approval ini tidak membuktikan acceptance criteria
lulus atau memberi izin otomatis untuk migration produksi, push, atau deployment.

Compatibility existing importer, consumer lama, soft-delete, AC, dan release gates
tetap harus dibuktikan saat implementasi. ADR ini tidak menggantikan ADR-001
sampai ADR-004. Nama file dipertahankan agar tautan draft sebelumnya tetap berlaku.
