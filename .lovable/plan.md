## Sales Order — multi-product rows & column changes

Scope: hanya halaman **Sales Order** (`/orders`). Halaman RFQ & Quotation tetap pakai `CommercialList` seperti sekarang.

### Perubahan data (mock)
Tambahkan struktur baru di `src/lib/mock-data.ts`:

- `SalesOrderLine`: `{ id, description, qty, unitPrice, total }`
- `SalesOrder`: `{ id, soNo, poNo, clientId, ownerId, poReleaseDate, expectedDeliveryDate, lines: SalesOrderLine[] }`
- Generator `salesOrders` (~10–14 SO). Tiap SO punya 1–4 line items dengan qty & unit price bervariasi. `expectedDeliveryDate = poReleaseDate + N hari` (mis. 21–45 hari, konsisten per SO).

### Perubahan UI `/orders`
Ganti pemakaian `CommercialList` dengan komponen baru `SalesOrderList` (atau langsung inline di `src/routes/orders.tsx`). Layout: satu baris header per SO, lalu baris-baris produk di bawahnya (grouped rows, mirip invoice).

Kolom baru:

```text
SO No | PO No | Client | Owner | PO Release | Target Kirim | Qty | Unit Price | Amount
```

- **Stage**: dihapus.
- **Aging**: dihapus, diganti **Target Kirim** = `expectedDeliveryDate` (format tanggal + sisa hari, mis. "12 Aug 2026 · 26d").
- **Qty** & **Unit Price**: ditampilkan per line item.
- **Amount**: total per line; SO header menampilkan grand total.

Contoh tampilan:

```text
▸ SO-2026-001  PO-2001  PT Astra   Ratna  17 Jul → 12 Aug (26d)   Total: Rp 145 Jt
    • Bracket SS304        120   Rp 850k    Rp 102 Jt
    • Cover plate laser     60   Rp 720k    Rp  43 Jt
```

Implementasi pakai `<TableBody>` dengan dua tingkat baris (header row + sub-rows) menggunakan styling muted untuk sub-rows.

### File yang disentuh
- `src/lib/mock-data.ts` — tambah tipe & data `salesOrders` (tidak mengubah `commercialItems` yang dipakai halaman lain).
- `src/routes/orders.tsx` — ganti isi jadi tabel SO multi-line baru.
- (opsional) `src/components/app/sales-order-list.tsx` — komponen tabel baru jika ingin dipisah.

Halaman RFQ, Quotation, Pipeline, Revenue **tidak berubah**.
