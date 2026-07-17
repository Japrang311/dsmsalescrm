## Tambah breakdown untuk grafik Target YTD vs Achievement YTD

### Konteks
Chart YTD saat ini hanya menampilkan 2 area: `Target YTD` dan `Achievement YTD`. User ingin bisa memecah **Achievement YTD** berdasarkan **customer** atau **produk** agar terlihat kontribusi kumulatif tiap segmen.

Sumber data: `revenue` di `src/lib/mock-data.ts` — sudah ada `clientId` (→ customer) dan `description` (→ produk).

### UX
Di header card `Target YTD vs Achievement YTD`, tambah toggle (shadcn `Tabs` atau `ToggleGroup`, 3 opsi):

- **Total** (default) — tampilan sekarang: 2 area (Target YTD + Achievement YTD).
- **Per Customer** — 1 garis Target YTD (dashed) + stacked area per customer (Top 5 + "Others").
- **Per Produk** — 1 garis Target YTD (dashed) + stacked area per produk (Top 5 + "Others").

Ringkasan angka di kanan header (Achievement / Target / %) tetap seperti sekarang.

### Logika data
- Filter `revenue` sesuai `ownerFilter` (role sales → hanya revenue miliknya) supaya konsisten dengan KPI existing.
- Hitung total per segmen (customer/produk) di rentang bulan `monthlyTargets`; ambil top 5 by total, sisanya digabung jadi "Others" (skip kalau nilai 0).
- Untuk tiap bulan pada `monthlyTargets`, akumulasikan revenue tiap segmen → hasil `ytdBreakdownData: { month, "Target YTD", [segmentName]: number, ... }`.
- Target YTD kumulatif: sama seperti sekarang (dengan scaling `× 0.25` untuk role sales).
- Untuk role sales dengan scaling 0.25, achievement segment sudah otomatis ter-scoped (karena revenue difilter by owner), jadi tidak perlu dikali ulang.

### Chart
- Mode "Total": tetap `AreaChart` seperti sekarang.
- Mode breakdown: `ComposedChart` (import dari recharts) berisi:
  - `Area` stacked (`stackId="ach"`) untuk tiap segmen dengan palet warna dari CSS vars (`--color-primary`, `--color-teal`, `--color-info`, `--color-success`, `--color-warning`, `--color-muted-foreground` untuk Others).
  - `Line` untuk `Target YTD` (dashed, tanpa dot mencolok) di atas stack.
- Tooltip pakai `formatIDR` (values dalam Rp Juta seperti sekarang) dan urutan legend mengikuti urutan top-N.

### File yang disentuh
- `src/routes/index.tsx`
  - Tambah state `const [ytdMode, setYtdMode] = useState<"total" | "customer" | "product">("total")`.
  - Tambah import `useState`, `ComposedChart`, `Line` dari recharts, `Tabs/TabsList/TabsTrigger` (atau `ToggleGroup`) dari `@/components/ui`.
  - Import `revenue`, `findClient` (sudah), `clients` (sudah).
  - Hitung `ytdBreakdownData` + `segments` (array `{ key, color }`) dengan `useMemo`.
  - Render toggle di `CardHeader`, dan branch chart di `CardContent` sesuai `ytdMode`.

Tidak ada perubahan pada mock data atau file lain.
