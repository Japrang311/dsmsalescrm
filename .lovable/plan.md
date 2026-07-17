## Tambah menu "Prototype"

Fitur baru mirror dari halaman **PO/Sales Order**, tapi untuk pencatatan pengiriman prototype ke customer. Nilai (unit price / amount) boleh diisi atau dibiarkan kosong. Bila diisi, kontribusinya masuk ke perhitungan Revenue.

### 1. Data model (`src/lib/mock-data.ts`)
- Tambah interface `Prototype` dan `PrototypeLine` — mirror `SalesOrder`/`SalesOrderLine`, tapi:
  - `unitPrice?: number` dan `total?: number` opsional (boleh `null`/`undefined`).
  - `poNo` diganti jadi `refNo` opsional (referensi internal, boleh kosong).
  - Field baru `chargeable: boolean` (turunan otomatis: true kalau ada line dengan `unitPrice > 0`).
- Tambah array mock `prototypes: Prototype[]` — 4–5 entri dengan campuran: sebagian berbiaya, sebagian gratis (unitPrice kosong).
- Update fungsi revenue agar prototype berbiaya ikut terhitung:
  - Tambah helper `prototypeRevenue(ownerFilter?)` menjumlahkan `line.total` dari prototype yang sudah "delivered".
  - Sisipkan hasilnya ke `ytdAchievement()`, `topCustomers()`, `salesPerformance()`, dan `ppnBreakdown()` (default masuk PPN kecuali flag `nonPpn`).
- Tidak mengubah struktur `revenue[]` existing (tetap pakai data lama) — cukup tambah agregasi.

### 2. Route baru `src/routes/prototype.tsx`
- Duplikasi struktur `src/routes/orders.tsx`:
  - Header: "Prototype", deskripsi "Pengiriman prototype ke customer. Nilai opsional — bila diisi akan masuk ke revenue."
  - Kolom tabel: `Prototype No`, `Ref No`, `Client`, `Owner`, `Release Date`, `Target Kirim / Delivered`, `Qty`, `Unit Price`, `Amount`, `Action`.
  - Tampilkan `—` untuk unitPrice/amount yang kosong.
  - Baris SO menampilkan badge kecil "Chargeable" (bila ada nilai) atau "Free sample" (bila semua kosong).
  - Tombol **Selesai** sama seperti orders — flip target kirim → "Delivered to customer" + tanggal.

### 3. Navigasi (`src/components/app/sidebar.tsx`)
- Tambah item nav baru di `salesNav` di antara `/orders` dan `/revenue`:
  ```
  { to: "/prototype", label: "Prototype", icon: FlaskConical }
  ```
- Icon `FlaskConical` dari `lucide-react`.
- `execNav` tetap tidak diubah (executive tidak butuh operational list ini).

### 4. Efek ke Revenue view
- Dashboard KPI "Achievement YTD" dan chart YTD/monthly akan otomatis ikut naik karena `ytdAchievement()` diperbarui.
- Halaman `/revenue` juga otomatis mencerminkan tambahan (bila membaca dari helper yang sama). Bila `/revenue` mengiterasi array `revenue` langsung, tambahkan catatan kecil di summary card "termasuk prototype berbayar" — akan dicek saat implementasi.

### File yang disentuh
- `src/lib/mock-data.ts` — tambah tipe, mock, dan agregasi.
- `src/routes/prototype.tsx` — file baru.
- `src/components/app/sidebar.tsx` — tambah entry nav.

Tidak ada perubahan backend / DB (mock only).
